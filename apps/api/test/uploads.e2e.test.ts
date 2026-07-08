import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { AuthModule } from "../src/auth/auth.module.js";
import { PrismaService } from "../src/infrastructure/database/prisma.service.js";
import { UploadsModule } from "../src/uploads/uploads.module.js";

type UserStatusValue = "ACTIVE" | "DISABLED";

type UserRecord = {
  readonly id: string;
  readonly sessionVersion: number;
  readonly status: UserStatusValue;
};

type SessionRecord = {
  readonly expiresAt: Date;
  readonly id: string;
  readonly revokedAt: Date | null;
  readonly user: UserRecord;
  readonly userId: string;
};

class UploadsPrismaTestDouble {
  readonly sessions = new Map<string, SessionRecord>();

  readonly userSession = {
    findUnique: async (args: { include?: { user?: boolean }; where: { id?: string } }): Promise<SessionRecord | null> =>
      args.where.id === undefined ? null : (this.sessions.get(args.where.id) ?? null)
  };
}

const applyTestEnv = (uploadsDir: string): void => {
  process.env.AUTH_REFRESH_TOKEN_TTL_SECONDS = "2592000";
  process.env.API_PORT = "3000";
  process.env.DATABASE_URL = "postgresql://construction:construction@localhost:5432/construction_personnel?schema=public";
  process.env.FACE_SERVICE_API_KEY = "face-service-key";
  process.env.FACE_SERVICE_BASE_URL = "http://localhost:8000";
  process.env.JWT_ACCESS_TOKEN_SECRET = "test-jwt-secret-with-at-least-32-characters";
  process.env.JWT_ACCESS_TOKEN_TTL_SECONDS = "900";
  process.env.NODE_ENV = "test";
  process.env.OBJECT_STORAGE_ACCESS_KEY = "object-storage-access-key";
  process.env.OBJECT_STORAGE_BUCKET = "construction-personnel";
  process.env.OBJECT_STORAGE_ENDPOINT = "http://localhost:9000";
  process.env.OBJECT_STORAGE_SECRET_KEY = "object-storage-secret-key";
  process.env.UPLOADS_DIR = uploadsDir;
  process.env.WECHAT_APP_ID = "wechat-app-id";
  process.env.WECHAT_APP_SECRET = "wechat-app-secret";
};

const createApp = async (prisma: UploadsPrismaTestDouble): Promise<INestApplication> => {
  const moduleRef = await Test.createTestingModule({
    imports: [AuthModule, UploadsModule]
  })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
};

const createAccessToken = async (app: INestApplication, userId: string, sessionId: string): Promise<string> => {
  const jwtService = app.get(JwtService);
  const secret = process.env.JWT_ACCESS_TOKEN_SECRET;
  if (secret === undefined) throw new Error("Missing JWT test secret");
  return jwtService.signAsync({ sid: sessionId, sub: userId, sv: 1 }, { expiresIn: 900, secret });
};

const seedSession = (prisma: UploadsPrismaTestDouble, userId: string, sessionId: string): void => {
  const user: UserRecord = { id: userId, sessionVersion: 1, status: "ACTIVE" };
  prisma.sessions.set(sessionId, {
    expiresAt: new Date(Date.now() + 60_000),
    id: sessionId,
    revokedAt: null,
    user,
    userId
  });
};

describe("POST /uploads", (): void => {
  let app: INestApplication | undefined;
  let prisma: UploadsPrismaTestDouble;
  let uploadsDir: string;

  beforeEach(async (): Promise<void> => {
    uploadsDir = await mkdtemp(join(tmpdir(), "uploads-e2e-"));
    applyTestEnv(uploadsDir);
    prisma = new UploadsPrismaTestDouble();
  });

  afterEach(async (): Promise<void> => {
    if (app !== undefined) {
      await app.close();
      app = undefined;
    }
    await rm(uploadsDir, { force: true, recursive: true });
  });

  test("stores a jpeg, returns objectKey/hash/sizeBytes/contentType, and the file lands on disk", async (): Promise<void> => {
    seedSession(prisma, "user-1", "session-1");
    app = await createApp(prisma);
    const token = await createAccessToken(app, "user-1", "session-1");
    const data = Buffer.from("jpeg-bytes-for-test");

    const response = await request(app.getHttpServer())
      .post("/uploads")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", data, { contentType: "image/jpeg", filename: "selfie.jpg" })
      .expect(201);

    expect(response.body.objectKey).toMatch(/^uploads\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.jpg$/);
    expect(response.body.hash).toBe(createHash("sha256").update(data).digest("hex"));
    expect(response.body.sizeBytes).toBe(data.length);
    expect(response.body.contentType).toBe("image/jpeg");

    const written = await readFile(join(uploadsDir, response.body.objectKey));
    expect(written.equals(data)).toBe(true);
  });

  test("stores a png with a .png extension", async (): Promise<void> => {
    seedSession(prisma, "user-1", "session-1");
    app = await createApp(prisma);
    const token = await createAccessToken(app, "user-1", "session-1");

    const response = await request(app.getHttpServer())
      .post("/uploads")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("png-bytes"), { contentType: "image/png", filename: "site.png" })
      .expect(201);

    expect(response.body.objectKey).toMatch(/\.png$/);
  });

  test("rejects a request without a file with 400 UPLOAD_FILE_REQUIRED", async (): Promise<void> => {
    seedSession(prisma, "user-1", "session-1");
    app = await createApp(prisma);
    const token = await createAccessToken(app, "user-1", "session-1");

    const response = await request(app.getHttpServer())
      .post("/uploads")
      .set("Authorization", `Bearer ${token}`)
      .expect(400);

    expect(response.body.message).toBe("UPLOAD_FILE_REQUIRED");
  });

  test("rejects a disallowed content type with 400 UPLOAD_CONTENT_TYPE_NOT_ALLOWED", async (): Promise<void> => {
    seedSession(prisma, "user-1", "session-1");
    app = await createApp(prisma);
    const token = await createAccessToken(app, "user-1", "session-1");

    const response = await request(app.getHttpServer())
      .post("/uploads")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("plain text"), { contentType: "text/plain", filename: "notes.txt" })
      .expect(400);

    expect(response.body.message).toBe("UPLOAD_CONTENT_TYPE_NOT_ALLOWED");
  });

  test("rejects an oversize file with 413", async (): Promise<void> => {
    seedSession(prisma, "user-1", "session-1");
    app = await createApp(prisma);
    const token = await createAccessToken(app, "user-1", "session-1");

    await request(app.getHttpServer())
      .post("/uploads")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.alloc(5 * 1024 * 1024 + 1), { contentType: "image/jpeg", filename: "huge.jpg" })
      .expect(413);
  });

  test("rejects a missing token with 401", async (): Promise<void> => {
    app = await createApp(prisma);
    await request(app.getHttpServer())
      .post("/uploads")
      .attach("file", Buffer.from("bytes"), { contentType: "image/jpeg", filename: "a.jpg" })
      .expect(401);
  });
});
