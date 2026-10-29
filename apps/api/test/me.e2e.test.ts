import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { AuthModule } from "../src/auth/auth.module.js";
import { PrismaService } from "../src/infrastructure/database/prisma.service.js";

type RoleCodeValue = "SYSTEM_ADMIN" | "COMPANY_ADMIN" | "PROJECT_ADMIN" | "TEAM_LEADER" | "WORKER";
type ScopeTypeValue = "GLOBAL" | "COMPANY" | "PROJECT" | "TEAM";
type ProfileRef = { id: string } | null;

type MeUser = {
  readonly openid: string;
  readonly encryptedRealName: string;
  readonly phone: string;
  readonly nickname: string;
  readonly avatarObjectKey: string;
  id: string;
  isBound: boolean;
  managerProfile: ProfileRef;
  sessionVersion: number;
  status: "ACTIVE" | "DISABLED";
  workerProfile: ProfileRef;
};
type MeSession = { expiresAt: Date; id: string; revokedAt: Date | null; user: MeUser; userId: string };
type MeUserRole = { role: { code: RoleCodeValue }; scopeId: string; scopeType: ScopeTypeValue };
type MeRole = { code: RoleCodeValue; permissions: { permission: { code: string } }[] };

class MePrismaTestDouble {
  readonly users = new Map<string, MeUser>();
  readonly sessions = new Map<string, MeSession>();
  readonly userRolesByUser = new Map<string, MeUserRole[]>();
  readonly roles: MeRole[] = [
    { code: "SYSTEM_ADMIN", permissions: [{ permission: { code: "system.manage" } }] },
    { code: "COMPANY_ADMIN", permissions: [{ permission: { code: "company.manage" } }] },
    { code: "PROJECT_ADMIN", permissions: [{ permission: { code: "project.manage" } }] },
    { code: "TEAM_LEADER", permissions: [{ permission: { code: "makeup.approve" } }] },
    { code: "WORKER", permissions: [{ permission: { code: "attendance.submit" } }] }
  ];

  readonly user = {
    findUnique: async (args: { where: { id: string } }): Promise<MeUser | null> =>
      this.users.get(args.where.id) ?? null
  };
  readonly userSession = {
    findUnique: async (args: { where: { id?: string } }): Promise<MeSession | null> =>
      args.where.id === undefined ? null : (this.sessions.get(args.where.id) ?? null)
  };
  readonly userRole = {
    findMany: async (args: { where: { userId: string } }): Promise<MeUserRole[]> =>
      this.userRolesByUser.get(args.where.userId) ?? []
  };
  readonly role = {
    findMany: async (): Promise<MeRole[]> => this.roles
  };
}

const applyTestEnv = (): void => {
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
  process.env.WECHAT_APP_ID = "wechat-app-id";
  process.env.WECHAT_APP_SECRET = "wechat-app-secret";
};

const createApp = async (prisma: MePrismaTestDouble): Promise<INestApplication> => {
  const moduleRef = await Test.createTestingModule({ imports: [AuthModule] })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
};

const createAccessToken = async (
  app: INestApplication,
  userId: string,
  sessionId: string
): Promise<string> => {
  const jwtService = app.get(JwtService);
  const secret = process.env.JWT_ACCESS_TOKEN_SECRET;
  if (secret === undefined) {
    throw new Error("Missing JWT test secret");
  }
  return jwtService.signAsync({ sid: sessionId, sub: userId, sv: 1 }, { secret, expiresIn: 900 });
};

const seedUser = (
  prisma: MePrismaTestDouble,
  params: {
    userId: string;
    sessionId: string;
    workerProfile: ProfileRef;
    managerProfile: ProfileRef;
    roles: MeUserRole[];
  }
): void => {
  const user: MeUser = {
    id: params.userId,
    openid: params.userId,
    encryptedRealName: "test-encrypted-name",
    phone: "13800000000",
    nickname: "Test",
    avatarObjectKey: "test/avatar.png",
    isBound: params.workerProfile !== null || params.managerProfile !== null,
    managerProfile: params.managerProfile,
    sessionVersion: 1,
    status: "ACTIVE",
    workerProfile: params.workerProfile
  };
  prisma.users.set(user.id, user);
  prisma.sessions.set(params.sessionId, {
    expiresAt: new Date(Date.now() + 60_000),
    id: params.sessionId,
    revokedAt: null,
    user,
    userId: user.id
  });
  prisma.userRolesByUser.set(user.id, params.roles);
};

describe("GET /auth/me", () => {
  let app: INestApplication | undefined;
  let prisma: MePrismaTestDouble;

  beforeEach((): void => {
    applyTestEnv();
    prisma = new MePrismaTestDouble();
  });

  afterEach(async (): Promise<void> => {
    if (app !== undefined) {
      await app.close();
      app = undefined;
    }
  });

  test("returns profile and highest role for a bound worker", async (): Promise<void> => {
    seedUser(prisma, {
      managerProfile: null,
      roles: [{ role: { code: "WORKER" }, scopeId: "project-1", scopeType: "PROJECT" }],
      sessionId: "session-1",
      userId: "user-1",
      workerProfile: { id: "worker-1" }
    });
    app = await createApp(prisma);
    const token = await createAccessToken(app, "user-1", "session-1");

    const response = await request(app.getHttpServer())
      .get("/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual({
      profile: { id: "worker-1", type: "WORKER" },
      roles: {
        assignments: [{ roleCode: "WORKER", scope: { scopeId: "project-1", scopeType: "PROJECT" } }],
        highestRoleCode: "WORKER"
      },
      user: { id: "user-1", isBound: true, status: "ACTIVE" }
    });
  });

  test("returns MANAGER profile and TEAM_LEADER for a bound manager", async (): Promise<void> => {
    seedUser(prisma, {
      managerProfile: { id: "manager-1" },
      roles: [{ role: { code: "TEAM_LEADER" }, scopeId: "team-1", scopeType: "TEAM" }],
      sessionId: "session-1",
      userId: "user-1",
      workerProfile: null
    });
    app = await createApp(prisma);
    const token = await createAccessToken(app, "user-1", "session-1");

    const response = await request(app.getHttpServer())
      .get("/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.profile).toEqual({ id: "manager-1", type: "MANAGER" });
    expect(response.body.roles.highestRoleCode).toBe("TEAM_LEADER");
  });

  test("picks the highest role for a multi-role user", async (): Promise<void> => {
    seedUser(prisma, {
      managerProfile: { id: "manager-1" },
      roles: [
        { role: { code: "WORKER" }, scopeId: "project-1", scopeType: "PROJECT" },
        { role: { code: "PROJECT_ADMIN" }, scopeId: "project-1", scopeType: "PROJECT" }
      ],
      sessionId: "session-1",
      userId: "user-1",
      workerProfile: null
    });
    app = await createApp(prisma);
    const token = await createAccessToken(app, "user-1", "session-1");

    const response = await request(app.getHttpServer())
      .get("/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.roles.highestRoleCode).toBe("PROJECT_ADMIN");
    expect(response.body.roles.assignments).toHaveLength(2);
  });

  test("returns null highest role for a bound user with no assignments", async (): Promise<void> => {
    seedUser(prisma, {
      managerProfile: { id: "manager-1" },
      roles: [],
      sessionId: "session-1",
      userId: "user-1",
      workerProfile: null
    });
    app = await createApp(prisma);
    const token = await createAccessToken(app, "user-1", "session-1");

    const response = await request(app.getHttpServer())
      .get("/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.roles).toEqual({ assignments: [], highestRoleCode: null });
  });

  test("rejects a request without a token", async (): Promise<void> => {
    app = await createApp(prisma);
    await request(app.getHttpServer()).get("/auth/me").expect(401);
  });

  test("prefers the WORKER profile when a user has both profiles", async (): Promise<void> => {
    seedUser(prisma, {
      managerProfile: { id: "manager-1" },
      roles: [],
      sessionId: "session-1",
      userId: "user-1",
      workerProfile: { id: "worker-1" }
    });
    app = await createApp(prisma);
    const token = await createAccessToken(app, "user-1", "session-1");

    const response = await request(app.getHttpServer())
      .get("/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.profile).toEqual({ id: "worker-1", type: "WORKER" });
  });

  test("returns a null profile for a user with no profiles", async (): Promise<void> => {
    seedUser(prisma, {
      managerProfile: null,
      roles: [],
      sessionId: "session-1",
      userId: "user-1",
      workerProfile: null
    });
    app = await createApp(prisma);
    const token = await createAccessToken(app, "user-1", "session-1");

    const response = await request(app.getHttpServer())
      .get("/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.profile).toEqual({ id: null, type: null });
    expect(response.body.user.isBound).toBe(false);
  });
});
