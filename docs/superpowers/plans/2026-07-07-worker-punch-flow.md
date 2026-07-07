# Worker Punch Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give workers a working punch page (geolocation + selfie + site photo) backed by a new upload endpoint and a new "attendance today" endpoint.

**Architecture:** Two backend additions — an `UploadsModule` (multipart → sha256 → `StoragePort`, local-disk implementation behind a DI symbol so COS can replace it later) and a public `AttendanceService.getAttendanceToday` exposed via `MeController` — plus a new Taro page `pages/punch/index` that consumes them. The existing punch endpoint `POST /attendance/projects/:projectId/records` is not modified.

**Tech Stack:** NestJS 10 (Express adapter, multer bundled), Prisma 6, Zod, Vitest + Supertest (in-memory Prisma doubles), Taro 4.2 (React 18 + TS).

**Spec:** `docs/superpowers/specs/2026-07-07-worker-punch-flow-design.md`

---

## Codebase conventions you must follow (read once, apply everywhere)

- **ESM with `.js` import specifiers**: all intra-`apps/api` imports end in `.js` even though sources are `.ts` (`import { AuthModule } from "../auth/auth.module.js"`).
- **Validation**: no `ValidationPipe`/class-validator. Hand-written Zod parsers throw `BadRequestException({ issues, message })`. The uploads endpoint has no JSON body, so its checks live in the service.
- **DI tokens**: `Symbol`-based tokens provided with `useFactory` + `inject: [API_ENV]` (see `FACE_VERIFICATION_CONNECTOR` in `apps/api/src/attendance/attendance.module.ts`). `API_ENV` is global (from `EnvModule`).
- **Auth**: `@UseGuards(AccessTokenGuard)` + `@CurrentUser()`. `AuthModule` exports the guard plus `EnvModule`, `JwtModule`, `PrismaModule` — importing `AuthModule` is all a feature module needs.
- **Tests**: every e2e test file under `apps/api/test/*.e2e.test.ts` is fully self-contained: its own env setter, in-memory Prisma double, `Test.createTestingModule({...}).overrideProvider(PrismaService).useValue(double)`, JWT minted via `app.get(JwtService)` signing `{ sid, sub, sv }`. Run with `cd apps/api && npx vitest run test/<file>`.
- **Object key / property ordering**: object literals and Zod schemas keep keys alphabetically sorted (see any existing file). Follow it.
- **Coordinates are strings** end-to-end. Do not convert to numbers in request payloads.
- **pnpm is not on PATH**; use `npx` inside package dirs or `corepack pnpm` at the root.

## File map

| File | Action | Responsibility |
|---|---|---|
| `apps/api/src/infrastructure/storage/storage.types.ts` | Create | `StoragePort` interface + `STORAGE_PORT` symbol |
| `apps/api/src/infrastructure/storage/local-disk-storage.ts` | Create | Dev implementation writing under `UPLOADS_DIR` |
| `apps/api/test/local-disk-storage.test.ts` | Create | Unit tests for the disk adapter |
| `apps/api/src/config/env.ts` | Modify | Add `UPLOADS_DIR` (default `./var/uploads`) |
| `.gitignore` | Modify | Ignore `apps/api/var/` |
| `.env.example` | Modify | Document `UPLOADS_DIR` |
| `apps/api/src/uploads/uploads.types.ts` | Create | `UploadResponse`, `UploadedMultipartFile` |
| `apps/api/src/uploads/uploads.service.ts` | Create | Validate → hash → store |
| `apps/api/src/uploads/uploads.controller.ts` | Create | `POST /uploads` (FileInterceptor) |
| `apps/api/src/uploads/uploads.module.ts` | Create | Wire controller/service/`STORAGE_PORT` |
| `apps/api/src/app.module.ts` | Modify | Register `UploadsModule` |
| `apps/api/test/uploads.e2e.test.ts` | Create | E2E for `POST /uploads` |
| `apps/api/src/attendance/attendance.types.ts` | Modify | `AttendanceToday*` response types |
| `apps/api/src/attendance/attendance.service.ts` | Modify | `getAttendanceToday` + point-mapping helper |
| `apps/api/src/me/me.controller.ts` | Modify | `GET /me/projects/:projectId/attendance-today` |
| `apps/api/src/me/me.module.ts` | Modify | Import `AttendanceModule` |
| `apps/api/test/attendance-today.e2e.test.ts` | Create | E2E for the today endpoint |
| `apps/miniprogram/src/services/uploads.ts` | Create | `uploadImage` via `Taro.uploadFile` |
| `apps/miniprogram/src/services/me.types.ts` | Modify | Today/submit types |
| `apps/miniprogram/src/services/me.ts` | Modify | `fetchAttendanceToday`, `submitAttendanceRecord` |
| `apps/miniprogram/src/pages/punch/index.tsx` | Create | The punch page |
| `apps/miniprogram/src/pages/punch/index.config.ts` | Create | Page config |
| `apps/miniprogram/src/app.config.ts` | Modify | Register the page |
| `apps/miniprogram/src/components/role-panels/index.tsx` | Modify | Wire the worker 打卡 tile |

---

### Task 1: Storage port + local-disk implementation + `UPLOADS_DIR`

**Files:**
- Create: `apps/api/src/infrastructure/storage/storage.types.ts`
- Create: `apps/api/src/infrastructure/storage/local-disk-storage.ts`
- Test: `apps/api/test/local-disk-storage.test.ts`
- Modify: `apps/api/src/config/env.ts` (add one schema line)
- Modify: `.gitignore`, `.env.example`

- [ ] **Step 1: Write the failing test**

Create `apps/api/test/local-disk-storage.test.ts`:

```ts
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { LocalDiskStorage } from "../src/infrastructure/storage/local-disk-storage.js";

describe("LocalDiskStorage", (): void => {
  let rootDir: string;

  beforeEach(async (): Promise<void> => {
    rootDir = await mkdtemp(join(tmpdir(), "local-disk-storage-"));
  });

  afterEach(async (): Promise<void> => {
    await rm(rootDir, { force: true, recursive: true });
  });

  test("put writes the bytes beneath the root, creating nested directories", async (): Promise<void> => {
    const storage = new LocalDiskStorage(rootDir);
    const data = Buffer.from("fake-jpeg-bytes");

    await storage.put("uploads/2026-07-07/abc.jpg", data, "image/jpeg");

    const written = await readFile(join(rootDir, "uploads/2026-07-07/abc.jpg"));
    expect(written.equals(data)).toBe(true);
  });

  test("put overwrites an existing object at the same key", async (): Promise<void> => {
    const storage = new LocalDiskStorage(rootDir);
    await storage.put("uploads/a.jpg", Buffer.from("first"), "image/jpeg");
    await storage.put("uploads/a.jpg", Buffer.from("second"), "image/jpeg");

    const written = await readFile(join(rootDir, "uploads/a.jpg"));
    expect(written.toString()).toBe("second");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run test/local-disk-storage.test.ts`
Expected: FAIL — cannot resolve `../src/infrastructure/storage/local-disk-storage.js`.

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/infrastructure/storage/storage.types.ts`:

```ts
export const STORAGE_PORT = Symbol("STORAGE_PORT");

export interface StoragePort {
  put(objectKey: string, data: Buffer, contentType: string): Promise<void>;
}
```

Create `apps/api/src/infrastructure/storage/local-disk-storage.ts`:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { StoragePort } from "./storage.types.js";

export class LocalDiskStorage implements StoragePort {
  private readonly rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  async put(objectKey: string, data: Buffer, _contentType: string): Promise<void> {
    const filePath = join(this.rootDir, objectKey);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
  }
}
```

(Object keys are always server-generated UUID paths — no user input reaches `join`, so no traversal handling is needed.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run test/local-disk-storage.test.ts`
Expected: 2 passed.

- [ ] **Step 5: Add `UPLOADS_DIR` to the env schema**

In `apps/api/src/config/env.ts`, inside `envSchema`, insert between `TENCENT_SECRET_KEY` and `WECHAT_APP_ID`:

```ts
    UPLOADS_DIR: z.string().min(1).default("./var/uploads"),
```

The default keeps every existing test's `applyTestEnv()` working unchanged.

- [ ] **Step 6: Ignore the local upload dir and document the var**

Append to `.gitignore` (repo root):

```
apps/api/var/
```

Append to `.env.example` (repo root, near the `OBJECT_STORAGE_*` block):

```
UPLOADS_DIR=./var/uploads
```

- [ ] **Step 7: Typecheck and full test run**

Run: `cd apps/api && npm run typecheck && npx vitest run`
Expected: typecheck clean; all suites pass (existing + 2 new).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/infrastructure/storage apps/api/test/local-disk-storage.test.ts apps/api/src/config/env.ts .gitignore .env.example
git commit -m "feat(api): storage port + local-disk implementation + UPLOADS_DIR env"
```

---

### Task 2: `POST /uploads` endpoint

**Files:**
- Create: `apps/api/src/uploads/uploads.types.ts`
- Create: `apps/api/src/uploads/uploads.service.ts`
- Create: `apps/api/src/uploads/uploads.controller.ts`
- Create: `apps/api/src/uploads/uploads.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/test/uploads.e2e.test.ts`

- [ ] **Step 1: Write the failing e2e test**

Create `apps/api/test/uploads.e2e.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run test/uploads.e2e.test.ts`
Expected: FAIL — cannot resolve `../src/uploads/uploads.module.js`.

- [ ] **Step 3: Write the uploads module**

Create `apps/api/src/uploads/uploads.types.ts`:

```ts
export type UploadedMultipartFile = {
  readonly buffer: Buffer;
  readonly mimetype: string;
  readonly originalname: string;
  readonly size: number;
};

export type UploadResponse = {
  readonly contentType: string;
  readonly hash: string;
  readonly objectKey: string;
  readonly sizeBytes: number;
};
```

Create `apps/api/src/uploads/uploads.service.ts`:

```ts
import { createHash, randomUUID } from "node:crypto";

import { BadRequestException, Inject, Injectable } from "@nestjs/common";

import { STORAGE_PORT, type StoragePort } from "../infrastructure/storage/storage.types.js";

import type { UploadedMultipartFile, UploadResponse } from "./uploads.types.js";

const contentTypeExtensions: ReadonlyMap<string, string> = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"]
]);

@Injectable()
export class UploadsService {
  constructor(@Inject(STORAGE_PORT) private readonly storage: StoragePort) {}

  async storeImage(file: UploadedMultipartFile | undefined): Promise<UploadResponse> {
    if (file === undefined) {
      throw new BadRequestException({
        message: "UPLOAD_FILE_REQUIRED"
      });
    }

    const extension = contentTypeExtensions.get(file.mimetype);

    if (extension === undefined) {
      throw new BadRequestException({
        contentType: file.mimetype,
        message: "UPLOAD_CONTENT_TYPE_NOT_ALLOWED"
      });
    }

    const hash = createHash("sha256").update(file.buffer).digest("hex");
    const objectKey = `uploads/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${extension}`;
    await this.storage.put(objectKey, file.buffer, file.mimetype);

    return {
      contentType: file.mimetype,
      hash,
      objectKey,
      sizeBytes: file.size
    };
  }
}
```

Create `apps/api/src/uploads/uploads.controller.ts` (multer defaults to in-memory storage when no `storage`/`dest` option is given, so `file.buffer` is populated; the 5 MB limit surfaces as Nest's standard 413):

```ts
import { Controller, Inject, Post, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

import { AccessTokenGuard } from "../auth/access-token.guard.js";

import { UploadsService } from "./uploads.service.js";
import type { UploadedMultipartFile, UploadResponse } from "./uploads.types.js";

export const maxUploadSizeBytes = 5 * 1024 * 1024;

@Controller("uploads")
export class UploadsController {
  constructor(@Inject(UploadsService) private readonly uploadsService: UploadsService) {}

  @Post()
  @UseGuards(AccessTokenGuard)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: maxUploadSizeBytes } }))
  async upload(@UploadedFile() file: UploadedMultipartFile | undefined): Promise<UploadResponse> {
    return this.uploadsService.storeImage(file);
  }
}
```

Create `apps/api/src/uploads/uploads.module.ts`:

```ts
import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { API_ENV } from "../config/env.module.js";
import type { ApiEnv } from "../config/env.js";
import { LocalDiskStorage } from "../infrastructure/storage/local-disk-storage.js";
import { STORAGE_PORT, type StoragePort } from "../infrastructure/storage/storage.types.js";

import { UploadsController } from "./uploads.controller.js";
import { UploadsService } from "./uploads.service.js";

@Module({
  imports: [AuthModule],
  controllers: [UploadsController],
  providers: [
    UploadsService,
    {
      provide: STORAGE_PORT,
      useFactory: (env: ApiEnv): StoragePort => new LocalDiskStorage(env.UPLOADS_DIR),
      inject: [API_ENV]
    }
  ]
})
export class UploadsModule {}
```

In `apps/api/src/app.module.ts`, add the import line (alphabetical with the others):

```ts
import { UploadsModule } from "./uploads/uploads.module.js";
```

and append `UploadsModule` to the `imports` array after `ReportsModule`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run test/uploads.e2e.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Typecheck and full test run**

Run: `cd apps/api && npm run typecheck && npx vitest run`
Expected: clean; all suites pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/uploads apps/api/src/app.module.ts apps/api/test/uploads.e2e.test.ts
git commit -m "feat(api): POST /uploads multipart endpoint backed by StoragePort"
```

---

### Task 3: `GET /me/projects/:projectId/attendance-today`

**Files:**
- Modify: `apps/api/src/attendance/attendance.types.ts` (append types)
- Modify: `apps/api/src/attendance/attendance.service.ts` (one helper + one public method)
- Modify: `apps/api/src/me/me.controller.ts` (new route)
- Modify: `apps/api/src/me/me.module.ts` (import `AttendanceModule`)
- Test: `apps/api/test/attendance-today.e2e.test.ts`

- [ ] **Step 1: Write the failing e2e test**

Create `apps/api/test/attendance-today.e2e.test.ts`. Note "today" is the **Asia/Shanghai** date; the test computes it the same way the service does:

```ts
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { AuthModule } from "../src/auth/auth.module.js";
import { MeModule } from "../src/me/me.module.js";
import { PrismaService } from "../src/infrastructure/database/prisma.service.js";

type UserStatusValue = "ACTIVE" | "DISABLED";
type MemberStatusValue = "ACTIVE" | "EXITED" | "SUSPENDED";
type ProfileOwnerTypeValue = "WORKER" | "MANAGER";
type AttendancePointCodeValue = "SEGMENT_1_START" | "SEGMENT_1_END" | "SEGMENT_2_START" | "SEGMENT_2_END";
type AttendanceRecordStatusValue = "VALID" | "INVALID";

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

type WorkerMembershipRecord = {
  readonly id: string;
  readonly projectId: string;
  readonly requiresAttendance: boolean;
  readonly status: MemberStatusValue;
};

type WorkerProfileRecord = {
  readonly id: string;
  readonly projectMemberships: readonly WorkerMembershipRecord[];
  readonly userId: string;
};

type ProjectRecord = {
  readonly centerLatitude: string;
  readonly centerLongitude: string;
  readonly geofenceRadiusM: number;
  readonly id: string;
};

type ShiftSegmentRecord = {
  readonly earlyGraceMins: number;
  readonly endTime: string;
  readonly id: string;
  readonly lateGraceMins: number;
  readonly sequence: number;
  readonly shiftId: string;
  readonly startTime: string;
};

type ShiftRecord = {
  readonly id: string;
  readonly isDefault: boolean;
  readonly name: string;
  readonly projectId: string;
  readonly segments: readonly ShiftSegmentRecord[];
};

type ScheduleRecord = {
  readonly endsOn: Date | null;
  readonly id: string;
  readonly ownerId: string;
  readonly ownerType: string;
  readonly shift: ShiftRecord;
  readonly shiftId: string;
  readonly startsOn: Date;
  readonly workdayMask: number;
};

type AttendanceRecordRow = {
  readonly abnormalReason: string | null;
  readonly attendanceDate: Date;
  readonly facePassed: boolean;
  readonly faceScore: string | null;
  readonly geofenceDistanceM: string | null;
  readonly id: string;
  readonly latitude: string;
  readonly locationAccuracyM: string | null;
  readonly longitude: string;
  readonly occurredAt: Date;
  readonly participantId: string;
  readonly participantType: ProfileOwnerTypeValue;
  readonly pointCode: AttendancePointCodeValue;
  readonly projectId: string;
  readonly selfieHash: string;
  readonly selfieObjectKey: string;
  readonly sitePhotoHash: string;
  readonly sitePhotoObjectKey: string;
  readonly source: string;
  readonly status: AttendanceRecordStatusValue;
};

type AttendanceResultRow = {
  readonly attendanceDate: Date;
  readonly id: string;
  readonly isAbsent: boolean;
  readonly isEarlyLeave: boolean;
  readonly isLate: boolean;
  readonly isMissingPunch: boolean;
  readonly participantId: string;
  readonly participantType: ProfileOwnerTypeValue;
  readonly projectId: string;
  readonly workedMinutes: number;
};

class AttendanceTodayPrismaTestDouble {
  readonly sessions = new Map<string, SessionRecord>();
  workerProfileRow: WorkerProfileRecord | null = null;
  projectRow: ProjectRecord | null = null;
  readonly scheduleRows: ScheduleRecord[] = [];
  defaultShiftRow: ShiftRecord | null = null;
  readonly attendanceRecordRows: AttendanceRecordRow[] = [];
  attendanceResultRow: AttendanceResultRow | null = null;

  readonly userSession = {
    findUnique: async (args: { include?: { user?: boolean }; where: { id?: string } }): Promise<SessionRecord | null> =>
      args.where.id === undefined ? null : (this.sessions.get(args.where.id) ?? null)
  };

  readonly workerProfile = {
    findUnique: async (args: {
      include?: { projectMemberships?: { where?: { projectId?: string } } };
      where: { userId?: string | null };
    }): Promise<WorkerProfileRecord | null> => {
      const profile = this.workerProfileRow;
      if (profile === null || profile.userId !== args.where.userId) {
        return null;
      }
      const projectId = args.include?.projectMemberships?.where?.projectId;
      return {
        ...profile,
        projectMemberships: profile.projectMemberships.filter(
          (membership: WorkerMembershipRecord): boolean => projectId === undefined || membership.projectId === projectId
        )
      };
    }
  };

  readonly managerProfile = {
    findUnique: async (_args: unknown): Promise<null> => null
  };

  readonly project = {
    findUnique: async (args: { where: { id: string } }): Promise<ProjectRecord | null> =>
      this.projectRow !== null && this.projectRow.id === args.where.id ? this.projectRow : null
  };

  readonly schedule = {
    findMany: async (args: {
      include?: unknown;
      orderBy?: unknown;
      where: { ownerId?: string; ownerType?: string };
    }): Promise<ScheduleRecord[]> =>
      [...this.scheduleRows]
        .filter(
          (row: ScheduleRecord): boolean =>
            (args.where.ownerId === undefined || row.ownerId === args.where.ownerId) &&
            (args.where.ownerType === undefined || row.ownerType === args.where.ownerType)
        )
        .sort((left: ScheduleRecord, right: ScheduleRecord): number => right.startsOn.getTime() - left.startsOn.getTime())
  };

  readonly shift = {
    findFirst: async (args: {
      include?: unknown;
      where: { isDefault?: boolean; projectId?: string };
    }): Promise<ShiftRecord | null> =>
      this.defaultShiftRow !== null &&
      (args.where.projectId === undefined || this.defaultShiftRow.projectId === args.where.projectId) &&
      (args.where.isDefault === undefined || this.defaultShiftRow.isDefault === args.where.isDefault)
        ? this.defaultShiftRow
        : null
  };

  readonly attendanceRecord = {
    findMany: async (args: {
      orderBy?: unknown;
      where: {
        attendanceDate?: Date;
        participantId?: string;
        participantType?: ProfileOwnerTypeValue;
        projectId?: string;
      };
    }): Promise<AttendanceRecordRow[]> =>
      [...this.attendanceRecordRows]
        .filter(
          (row: AttendanceRecordRow): boolean =>
            (args.where.attendanceDate === undefined || row.attendanceDate.getTime() === args.where.attendanceDate.getTime()) &&
            (args.where.participantId === undefined || row.participantId === args.where.participantId) &&
            (args.where.participantType === undefined || row.participantType === args.where.participantType) &&
            (args.where.projectId === undefined || row.projectId === args.where.projectId)
        )
        .sort((left: AttendanceRecordRow, right: AttendanceRecordRow): number => left.occurredAt.getTime() - right.occurredAt.getTime())
  };

  readonly attendanceResult = {
    findUnique: async (_args: unknown): Promise<AttendanceResultRow | null> => this.attendanceResultRow
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

const createApp = async (prisma: AttendanceTodayPrismaTestDouble): Promise<INestApplication> => {
  const moduleRef = await Test.createTestingModule({
    imports: [AuthModule, MeModule]
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

const seedSession = (prisma: AttendanceTodayPrismaTestDouble, userId: string, sessionId: string): void => {
  const user: UserRecord = { id: userId, sessionVersion: 1, status: "ACTIVE" };
  prisma.sessions.set(sessionId, {
    expiresAt: new Date(Date.now() + 60_000),
    id: sessionId,
    revokedAt: null,
    user,
    userId
  });
};

const chinaTodayText = (): string =>
  new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone: "Asia/Shanghai", year: "numeric" }).format(
    new Date()
  );

const dateOnlyToDate = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

const seedWorkerParticipant = (prisma: AttendanceTodayPrismaTestDouble): void => {
  seedSession(prisma, "user-1", "session-1");
  prisma.workerProfileRow = {
    id: "worker-1",
    projectMemberships: [{ id: "member-1", projectId: "project-1", requiresAttendance: true, status: "ACTIVE" }],
    userId: "user-1"
  };
  prisma.projectRow = {
    centerLatitude: "31.2304",
    centerLongitude: "121.4737",
    geofenceRadiusM: 300,
    id: "project-1"
  };
};

const standardShift = (): ShiftRecord => ({
  id: "shift-1",
  isDefault: true,
  name: "标准两段班",
  projectId: "project-1",
  segments: [
    { earlyGraceMins: 10, endTime: "12:00", id: "seg-1", lateGraceMins: 10, sequence: 1, shiftId: "shift-1", startTime: "08:00" },
    { earlyGraceMins: 10, endTime: "17:30", id: "seg-2", lateGraceMins: 10, sequence: 2, shiftId: "shift-1", startTime: "13:30" }
  ]
});

const seedSchedule = (prisma: AttendanceTodayPrismaTestDouble, workdayMask: number): void => {
  prisma.scheduleRows.push({
    endsOn: null,
    id: "schedule-1",
    ownerId: "project-1",
    ownerType: "PROJECT",
    shift: standardShift(),
    shiftId: "shift-1",
    startsOn: new Date("2026-01-01T00:00:00.000Z"),
    workdayMask
  });
};

const makeRecordRow = (
  overrides: Partial<AttendanceRecordRow> & { id: string; occurredAt: Date; pointCode: AttendancePointCodeValue }
): AttendanceRecordRow => ({
  abnormalReason: null,
  attendanceDate: dateOnlyToDate(chinaTodayText()),
  facePassed: true,
  faceScore: null,
  geofenceDistanceM: null,
  latitude: "31.2304",
  locationAccuracyM: null,
  longitude: "121.4737",
  participantId: "worker-1",
  participantType: "WORKER",
  projectId: "project-1",
  selfieHash: "hash-selfie",
  selfieObjectKey: "selfie.jpg",
  sitePhotoHash: "hash-site",
  sitePhotoObjectKey: "site.jpg",
  source: "DEVICE",
  status: "VALID",
  ...overrides
});

describe("GET /me/projects/:projectId/attendance-today", (): void => {
  let app: INestApplication | undefined;
  let prisma: AttendanceTodayPrismaTestDouble;

  beforeEach((): void => {
    applyTestEnv();
    prisma = new AttendanceTodayPrismaTestDouble();
  });

  afterEach(async (): Promise<void> => {
    if (app !== undefined) {
      await app.close();
      app = undefined;
    }
  });

  test("returns configured:false when the project has no schedule and no default shift", async (): Promise<void> => {
    seedWorkerParticipant(prisma);
    app = await createApp(prisma);
    const token = await createAccessToken(app, "user-1", "session-1");

    const response = await request(app.getHttpServer())
      .get("/me/projects/project-1/attendance-today")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body).toMatchObject({
      attendanceDate: chinaTodayText(),
      configured: false,
      isWorkday: false,
      points: [],
      shiftName: null
    });
    expect(response.body.geofence).toEqual({ centerLatitude: "31.2304", centerLongitude: "121.4737", radiusM: 300 });
  });

  test("returns isWorkday:false when the schedule excludes today", async (): Promise<void> => {
    seedWorkerParticipant(prisma);
    seedSchedule(prisma, 0);
    app = await createApp(prisma);
    const token = await createAccessToken(app, "user-1", "session-1");

    const response = await request(app.getHttpServer())
      .get("/me/projects/project-1/attendance-today")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body).toMatchObject({ configured: true, isWorkday: false, points: [] });
  });

  test("returns the four ordered points with null records on an unpunched workday", async (): Promise<void> => {
    seedWorkerParticipant(prisma);
    seedSchedule(prisma, 127);
    app = await createApp(prisma);
    const token = await createAccessToken(app, "user-1", "session-1");

    const response = await request(app.getHttpServer())
      .get("/me/projects/project-1/attendance-today")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.configured).toBe(true);
    expect(response.body.isWorkday).toBe(true);
    expect(response.body.shiftName).toBe("标准两段班");
    expect(response.body.result).toBeNull();
    expect(response.body.points).toEqual([
      { graceMins: 10, pointCode: "SEGMENT_1_START", record: null, scheduledTime: "08:00" },
      { graceMins: 10, pointCode: "SEGMENT_1_END", record: null, scheduledTime: "12:00" },
      { graceMins: 10, pointCode: "SEGMENT_2_START", record: null, scheduledTime: "13:30" },
      { graceMins: 10, pointCode: "SEGMENT_2_END", record: null, scheduledTime: "17:30" }
    ]);
  });

  test("surfaces the latest record per point and today's result", async (): Promise<void> => {
    seedWorkerParticipant(prisma);
    seedSchedule(prisma, 127);
    const today = chinaTodayText();
    prisma.attendanceRecordRows.push(
      makeRecordRow({ id: "rec-early", occurredAt: new Date(`${today}T00:01:00.000Z`), pointCode: "SEGMENT_1_START" }),
      makeRecordRow({
        abnormalReason: "OUTSIDE_GEOFENCE",
        id: "rec-late",
        occurredAt: new Date(`${today}T00:05:00.000Z`),
        pointCode: "SEGMENT_1_START",
        status: "INVALID"
      }),
      makeRecordRow({ id: "rec-end", occurredAt: new Date(`${today}T04:00:00.000Z`), pointCode: "SEGMENT_1_END" })
    );
    prisma.attendanceResultRow = {
      attendanceDate: dateOnlyToDate(today),
      id: "result-1",
      isAbsent: false,
      isEarlyLeave: false,
      isLate: false,
      isMissingPunch: true,
      participantId: "worker-1",
      participantType: "WORKER",
      projectId: "project-1",
      workedMinutes: 240
    };
    app = await createApp(prisma);
    const token = await createAccessToken(app, "user-1", "session-1");

    const response = await request(app.getHttpServer())
      .get("/me/projects/project-1/attendance-today")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const points = response.body.points as ReadonlyArray<{
      pointCode: string;
      record: { abnormalReason: string | null; occurredAt: string; status: string } | null;
    }>;
    expect(points[0]?.record).toEqual({
      abnormalReason: "OUTSIDE_GEOFENCE",
      occurredAt: `${today}T00:05:00.000Z`,
      status: "INVALID"
    });
    expect(points[1]?.record?.status).toBe("VALID");
    expect(points[2]?.record).toBeNull();
    expect(points[3]?.record).toBeNull();
    expect(response.body.result).toMatchObject({ isMissingPunch: true, workedMinutes: 240 });
  });

  test("rejects a non-participant with 400 ATTENDANCE_PARTICIPANT_MEMBERSHIP_NOT_FOUND", async (): Promise<void> => {
    seedSession(prisma, "user-2", "session-2");
    prisma.projectRow = { centerLatitude: "31.2304", centerLongitude: "121.4737", geofenceRadiusM: 300, id: "project-1" };
    app = await createApp(prisma);
    const token = await createAccessToken(app, "user-2", "session-2");

    const response = await request(app.getHttpServer())
      .get("/me/projects/project-1/attendance-today")
      .set("Authorization", `Bearer ${token}`)
      .expect(400);

    expect(response.body.message).toBe("ATTENDANCE_PARTICIPANT_MEMBERSHIP_NOT_FOUND");
  });

  test("rejects a missing token with 401", async (): Promise<void> => {
    app = await createApp(prisma);
    await request(app.getHttpServer()).get("/me/projects/project-1/attendance-today").expect(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run test/attendance-today.e2e.test.ts`
Expected: FAIL — 404 on the route (route not defined yet).

- [ ] **Step 3: Append the response types**

Append to `apps/api/src/attendance/attendance.types.ts`:

```ts
export type AttendanceTodayPointRecord = {
  readonly abnormalReason: string | null;
  readonly occurredAt: string;
  readonly status: AttendanceRecordStatusValue;
};

export type AttendanceTodayPoint = {
  readonly graceMins: number;
  readonly pointCode: AttendancePointCode;
  readonly record: AttendanceTodayPointRecord | null;
  readonly scheduledTime: string;
};

export type AttendanceTodayGeofence = {
  readonly centerLatitude: string;
  readonly centerLongitude: string;
  readonly radiusM: number;
};

export type AttendanceTodayResponse = {
  readonly attendanceDate: string;
  readonly configured: boolean;
  readonly geofence: AttendanceTodayGeofence;
  readonly isWorkday: boolean;
  readonly points: readonly AttendanceTodayPoint[];
  readonly result: AttendanceResultResponse | null;
  readonly shiftName: string | null;
};
```

- [ ] **Step 4: Add the service helper + public method**

In `apps/api/src/attendance/attendance.service.ts`:

(a) Extend the domain import at the top to include the point-code type:

```ts
import {
  summarizeDailyAttendance,
  type AttendancePointCode,
  type AttendanceRecordInput,
  type ShiftRule
} from "@construction/domain/attendance.js";
```

(b) Extend the `./attendance.types.js` type import with `AttendanceTodayGeofence`, `AttendanceTodayPoint`, `AttendanceTodayResponse`.

(c) Add module-level helper after `getAbnormalReason` (before the `@Injectable()` class):

```ts
const attendancePointCodesInOrder: readonly AttendancePointCode[] = [
  "SEGMENT_1_START",
  "SEGMENT_1_END",
  "SEGMENT_2_START",
  "SEGMENT_2_END"
];

const createAttendanceTodayPoints = (
  shift: ShiftWithSegments,
  records: readonly AttendanceRecord[]
): readonly AttendanceTodayPoint[] => {
  const sortedSegments = toSortedSegments(shift.segments);
  const segment1 = sortedSegments[0];
  const segment2 = sortedSegments[1];

  if (segment1 === undefined || segment2 === undefined || segment1.sequence !== 1 || segment2.sequence !== 2) {
    throw new BadRequestException({
      message: "DEFAULT_SHIFT_REQUIRES_TWO_ORDERED_SEGMENTS",
      shiftId: shift.id
    });
  }

  const pointDefinitions: ReadonlyMap<AttendancePointCode, { readonly graceMins: number; readonly scheduledTime: string }> =
    new Map([
      ["SEGMENT_1_START", { graceMins: segment1.lateGraceMins, scheduledTime: segment1.startTime }],
      ["SEGMENT_1_END", { graceMins: segment1.earlyGraceMins, scheduledTime: segment1.endTime }],
      ["SEGMENT_2_START", { graceMins: segment2.lateGraceMins, scheduledTime: segment2.startTime }],
      ["SEGMENT_2_END", { graceMins: segment2.earlyGraceMins, scheduledTime: segment2.endTime }]
    ]);

  return attendancePointCodesInOrder.map((pointCode: AttendancePointCode): AttendanceTodayPoint => {
    const definition = pointDefinitions.get(pointCode);

    if (definition === undefined) {
      throw new BadRequestException({
        message: "ATTENDANCE_POINT_DEFINITION_MISSING",
        pointCode
      });
    }

    const matchingRecords = records.filter((record: AttendanceRecord): boolean => record.pointCode === pointCode);
    const latestRecord = matchingRecords[matchingRecords.length - 1];

    return {
      graceMins: definition.graceMins,
      pointCode,
      record:
        latestRecord === undefined
          ? null
          : {
              abnormalReason: latestRecord.abnormalReason,
              occurredAt: latestRecord.occurredAt.toISOString(),
              status: latestRecord.status as AttendanceRecordStatusValue
            },
      scheduledTime: definition.scheduledTime
    };
  });
};
```

(d) Add a public method to `AttendanceService` (place it after `submitAttendanceRecord`). The workday rule mirrors `getShiftForAttendanceSubmissionOrThrow`: no schedules + default shift → every day is a workday; schedules exist → only an active schedule's day is a workday.

```ts
  async getAttendanceToday(projectId: string, userId: string): Promise<AttendanceTodayResponse> {
    const project = await this.getProjectOrThrow(projectId);
    const participant = await this.resolveAttendanceParticipant(userId, projectId);
    const attendanceDateText = getChinaDateOnly(new Date());
    const attendanceDate = dateOnlyToDate(attendanceDateText);
    const geofence: AttendanceTodayGeofence = {
      centerLatitude: String(project.centerLatitude),
      centerLongitude: String(project.centerLongitude),
      radiusM: project.geofenceRadiusM
    };

    const [schedules, defaultShift] = await Promise.all([
      this.loadProjectSchedulesWithShift(projectId),
      this.prisma.shift.findFirst({
        include: {
          segments: true
        },
        where: {
          isDefault: true,
          projectId
        }
      })
    ]);

    if (schedules.length === 0 && defaultShift === null) {
      return {
        attendanceDate: attendanceDateText,
        configured: false,
        geofence,
        isWorkday: false,
        points: [],
        result: null,
        shiftName: null
      };
    }

    const activeSchedule = schedules.find(
      (schedule: ProjectScheduleWithShift): boolean =>
        isDateInScheduleRange(schedule, attendanceDate) && isDateEnabledBySchedule(schedule, attendanceDate)
    );
    const shift = activeSchedule?.shift ?? (schedules.length === 0 ? defaultShift : null);

    if (shift === null) {
      return {
        attendanceDate: attendanceDateText,
        configured: true,
        geofence,
        isWorkday: false,
        points: [],
        result: null,
        shiftName: null
      };
    }

    const [records, result] = await Promise.all([
      this.prisma.attendanceRecord.findMany({
        orderBy: {
          occurredAt: "asc"
        },
        where: {
          attendanceDate,
          participantId: participant.participantId,
          participantType: participant.participantType,
          projectId
        }
      }),
      this.prisma.attendanceResult.findUnique({
        where: {
          projectId_attendanceDate_participantType_participantId: {
            attendanceDate,
            participantId: participant.participantId,
            participantType: participant.participantType,
            projectId
          }
        }
      })
    ]);

    return {
      attendanceDate: attendanceDateText,
      configured: true,
      geofence,
      isWorkday: true,
      points: createAttendanceTodayPoints(shift, records),
      result: result === null ? null : createAttendanceResultResponse(result),
      shiftName: shift.name
    };
  }
```

- [ ] **Step 5: Expose the route on `MeController` and import `AttendanceModule`**

In `apps/api/src/me/me.controller.ts`:
- Add `Param` to the `@nestjs/common` import.
- Add imports:

```ts
import { AttendanceService } from "../attendance/attendance.service.js";
import type { AttendanceTodayResponse } from "../attendance/attendance.types.js";
```

- Extend the constructor:

```ts
  constructor(
    @Inject(AttendanceService) private readonly attendanceService: AttendanceService,
    @Inject(MeService) private readonly meService: MeService
  ) {}
```

- Add the route after `listMyProjects`:

```ts
  @Get("projects/:projectId/attendance-today")
  @UseGuards(AccessTokenGuard)
  async getMyAttendanceToday(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param("projectId") projectId: string
  ): Promise<AttendanceTodayResponse> {
    return this.attendanceService.getAttendanceToday(projectId, currentUser.userId);
  }
```

In `apps/api/src/me/me.module.ts`, add:

```ts
import { AttendanceModule } from "../attendance/attendance.module.js";
```

and change the imports array to `[AttendanceModule, AuthModule, PrismaModule]`.

- [ ] **Step 6: Run test to verify it passes**

Run: `cd apps/api && npx vitest run test/attendance-today.e2e.test.ts`
Expected: 6 passed.

- [ ] **Step 7: Typecheck and full test run**

Run: `cd apps/api && npm run typecheck && npx vitest run`
Expected: clean; all suites pass (the existing `personal.e2e.test.ts` still passes — its double lacks the new models but its tests never hit the new route).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/attendance apps/api/src/me apps/api/test/attendance-today.e2e.test.ts
git commit -m "feat(api): GET /me/projects/:projectId/attendance-today (workday, points, geofence, result)"
```

---

### Task 4: Miniprogram service wrappers

**Files:**
- Create: `apps/miniprogram/src/services/uploads.ts`
- Modify: `apps/miniprogram/src/services/me.types.ts` (append types)
- Modify: `apps/miniprogram/src/services/me.ts` (append two wrappers)

- [ ] **Step 1: Capture the typecheck baseline**

Run: `cd apps/miniprogram && npx tsc --noEmit -p tsconfig.json 2>&1 | tail -5`
Note the error count (expected: 0). Later steps must not add new errors.

- [ ] **Step 2: Create `apps/miniprogram/src/services/uploads.ts`**

`Taro.uploadFile` does not go through the shared `apiClient` (that wrapper only covers `Taro.request`), so the JWT header is attached manually; the punch page always calls `fetchAttendanceToday` (which refreshes a stale token via `apiClient`) before uploading, so a stale-token upload is not a practical path.

```ts
import Taro from "@tarojs/taro";

import { API_BASE_URL } from "../config/env";

export type UploadResult = {
  readonly contentType: string;
  readonly hash: string;
  readonly objectKey: string;
  readonly sizeBytes: number;
};

export const uploadImage = async (localFilePath: string): Promise<UploadResult> => {
  const accessToken = String(Taro.getStorageSync("accessToken") || "");
  const res = await Taro.uploadFile({
    filePath: localFilePath,
    header: accessToken.length > 0 ? { Authorization: `Bearer ${accessToken}` } : {},
    name: "file",
    url: `${API_BASE_URL}/uploads`
  });

  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`UPLOAD_FAILED_${res.statusCode}`);
  }

  const data = JSON.parse(res.data) as UploadResult;

  if (typeof data.objectKey !== "string" || typeof data.hash !== "string") {
    throw new Error("UPLOAD_RESPONSE_INVALID");
  }

  return data;
};
```

- [ ] **Step 3: Append types to `apps/miniprogram/src/services/me.types.ts`**

```ts
export type AttendanceTodayPointRecord = {
  readonly abnormalReason: string | null;
  readonly occurredAt: string;
  readonly status: AttendanceRecordStatus;
};

export type AttendanceTodayPoint = {
  readonly graceMins: number;
  readonly pointCode: AttendancePointCode;
  readonly record: AttendanceTodayPointRecord | null;
  readonly scheduledTime: string;
};

export type AttendanceTodayGeofence = {
  readonly centerLatitude: string;
  readonly centerLongitude: string;
  readonly radiusM: number;
};

export type AttendanceResultSummary = {
  readonly attendanceDate: string;
  readonly isAbsent: boolean;
  readonly isEarlyLeave: boolean;
  readonly isLate: boolean;
  readonly isMissingPunch: boolean;
  readonly participantId: string;
  readonly participantType: ParticipantType;
  readonly projectId: string;
  readonly workedMinutes: number;
};

export type AttendanceToday = {
  readonly attendanceDate: string;
  readonly configured: boolean;
  readonly geofence: AttendanceTodayGeofence;
  readonly isWorkday: boolean;
  readonly points: ReadonlyArray<AttendanceTodayPoint>;
  readonly result: AttendanceResultSummary | null;
  readonly shiftName: string | null;
};

export type SubmitAttendanceRecordBody = {
  readonly attendanceDate: string;
  readonly latitude: string;
  readonly locationAccuracyM: string | null;
  readonly longitude: string;
  readonly occurredAt: string;
  readonly pointCode: AttendancePointCode;
  readonly selfieHash: string;
  readonly selfieObjectKey: string;
  readonly sitePhotoHash: string;
  readonly sitePhotoObjectKey: string;
};

export type SubmitAttendanceRecordResult = {
  readonly record: AttendanceRecord;
  readonly result: AttendanceResultSummary;
};
```

- [ ] **Step 4: Append wrappers to `apps/miniprogram/src/services/me.ts`**

Extend the type-import line with `AttendanceToday`, `SubmitAttendanceRecordBody`, `SubmitAttendanceRecordResult`, then append:

```ts
export const fetchAttendanceToday = async (projectId: string): Promise<AttendanceToday> =>
  apiClient.request<AttendanceToday>(`/me/projects/${projectId}/attendance-today`, { method: "GET" });

export const submitAttendanceRecord = async (
  projectId: string,
  body: SubmitAttendanceRecordBody
): Promise<SubmitAttendanceRecordResult> =>
  apiClient.request<SubmitAttendanceRecordResult>(`/attendance/projects/${projectId}/records`, {
    data: body,
    method: "POST"
  });
```

- [ ] **Step 5: Verify typecheck**

Run: `cd apps/miniprogram && npx tsc --noEmit -p tsconfig.json`
Expected: same error count as the Step 1 baseline (0 new errors).

- [ ] **Step 6: Commit**

```bash
git add apps/miniprogram/src/services/uploads.ts apps/miniprogram/src/services/me.ts apps/miniprogram/src/services/me.types.ts
git commit -m "feat(miniprogram): upload + attendance-today + punch-submit service wrappers"
```

---

### Task 5: Punch page + registration + worker tile

**Files:**
- Create: `apps/miniprogram/src/pages/punch/index.tsx`
- Create: `apps/miniprogram/src/pages/punch/index.config.ts`
- Modify: `apps/miniprogram/src/app.config.ts`
- Modify: `apps/miniprogram/src/components/role-panels/index.tsx`

- [ ] **Step 1: Create `apps/miniprogram/src/pages/punch/index.config.ts`**

```ts
export default definePageConfig({ navigationBarTitleText: "打卡" });
```

- [ ] **Step 2: Create `apps/miniprogram/src/pages/punch/index.tsx`**

```tsx
import { Image, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useCallback, useEffect, useState } from "react";

import { Button, Field, ListItem, PageHeader, Screen, StateView, Subtitle } from "../../components/ui/index";
import { fetchAttendanceToday, fetchMyProjects, submitAttendanceRecord } from "../../services/me";
import { uploadImage } from "../../services/uploads";
import type { AttendancePointCode, AttendanceToday, MyProjectMembership } from "../../services/me.types";

const POINT_LABEL: Record<AttendancePointCode, string> = {
  SEGMENT_1_END: "上午下班",
  SEGMENT_1_START: "上午上班",
  SEGMENT_2_END: "下午下班",
  SEGMENT_2_START: "下午上班"
};

const REASON_LABEL: Record<string, string> = {
  FACE_NOT_PASSED: "人脸未通过",
  OUTSIDE_GEOFENCE: "超出围栏"
};

const toRadians = (value: number): number => (value * Math.PI) / 180;

const distanceMeters = (fromLat: number, fromLng: number, toLat: number, toLng: number): number => {
  const earthRadiusM = 6371000;
  const latDelta = toRadians(toLat - fromLat);
  const lngDelta = toRadians(toLng - fromLng);
  const haversine =
    Math.sin(latDelta / 2) ** 2 + Math.cos(toRadians(fromLat)) * Math.cos(toRadians(toLat)) * Math.sin(lngDelta / 2) ** 2;
  return 2 * earthRadiusM * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

const reasonText = (reason: string | null): string => {
  if (reason === null) return "正常";
  return REASON_LABEL[reason] ?? reason;
};

export default function Punch(): JSX.Element {
  const [projects, setProjects] = useState<ReadonlyArray<MyProjectMembership> | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [today, setToday] = useState<AttendanceToday | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<AttendancePointCode | null>(null);
  const [latitude, setLatitude] = useState<string>("");
  const [longitude, setLongitude] = useState<string>("");
  const [accuracy, setAccuracy] = useState<string | null>(null);
  const [selfiePath, setSelfiePath] = useState<string | null>(null);
  const [sitePhotoPath, setSitePhotoPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await fetchMyProjects();
        if (!cancelled) {
          setProjects(rows);
          if (rows.length > 0) {
            setProjectId(rows[0].projectId);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "REQUEST_FAILED");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const position = await Taro.getLocation({ type: "gcj02" });
        setLatitude(position.latitude.toFixed(7));
        setLongitude(position.longitude.toFixed(7));
        setAccuracy(position.accuracy === undefined ? null : String(position.accuracy));
      } catch {
        // H5 on non-HTTPS origins blocks geolocation — the manual fields below are the fallback.
      }
    })();
  }, []);

  const loadToday = useCallback(async (pid: string): Promise<void> => {
    setToday(null);
    setSelectedPoint(null);
    setError(null);
    try {
      const data = await fetchAttendanceToday(pid);
      setToday(data);
      const firstOpen = data.points.find((p) => p.record === null);
      setSelectedPoint(firstOpen === undefined ? null : firstOpen.pointCode);
    } catch (e) {
      setError(e instanceof Error ? e.message : "REQUEST_FAILED");
    }
  }, []);

  useEffect(() => {
    if (projectId !== null) {
      void loadToday(projectId);
    }
  }, [projectId, loadToday]);

  const pickImage = async (target: "selfie" | "site"): Promise<void> => {
    try {
      const res = await Taro.chooseImage({ count: 1, sizeType: ["compressed"], sourceType: ["album", "camera"] });
      const path = res.tempFilePaths[0];
      if (path === undefined) return;
      if (target === "selfie") {
        setSelfiePath(path);
      } else {
        setSitePhotoPath(path);
      }
    } catch {
      // user cancelled the picker
    }
  };

  const fillProjectCenter = (): void => {
    if (today === null) return;
    setLatitude(today.geofence.centerLatitude);
    setLongitude(today.geofence.centerLongitude);
  };

  const distanceHint = (): string | null => {
    if (today === null || latitude.trim().length === 0 || longitude.trim().length === 0) return null;
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const d = distanceMeters(Number(today.geofence.centerLatitude), Number(today.geofence.centerLongitude), lat, lng);
    return `距工地中心 ${Math.round(d)}m · ${d <= today.geofence.radiusM ? "围栏内" : "围栏外"}`;
  };

  const canSubmit =
    !busy &&
    selectedPoint !== null &&
    latitude.trim().length > 0 &&
    longitude.trim().length > 0 &&
    selfiePath !== null &&
    sitePhotoPath !== null;

  const submit = async (): Promise<void> => {
    if (projectId === null || today === null || selectedPoint === null || selfiePath === null || sitePhotoPath === null || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const selfie = await uploadImage(selfiePath);
      const sitePhoto = await uploadImage(sitePhotoPath);
      const response = await submitAttendanceRecord(projectId, {
        attendanceDate: today.attendanceDate,
        latitude: latitude.trim(),
        locationAccuracyM: accuracy,
        longitude: longitude.trim(),
        occurredAt: new Date().toISOString(),
        pointCode: selectedPoint,
        selfieHash: selfie.hash,
        selfieObjectKey: selfie.objectKey,
        sitePhotoHash: sitePhoto.hash,
        sitePhotoObjectKey: sitePhoto.objectKey
      });
      const reason = response.record.abnormalReason;
      await Taro.showToast({
        icon: reason === null ? "success" : "none",
        title: reason === null ? "打卡成功·正常" : `打卡成功·异常(${reasonText(reason)})`
      });
      setSelfiePath(null);
      setSitePhotoPath(null);
      await loadToday(projectId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "REQUEST_FAILED");
      await Taro.showToast({ icon: "none", title: "打卡失败" });
    } finally {
      setBusy(false);
    }
  };

  const pointChip = (pointCode: AttendancePointCode): string | undefined => {
    if (today === null) return undefined;
    const point = today.points.find((p) => p.pointCode === pointCode);
    if (point === undefined) return undefined;
    if (point.record !== null) {
      return point.record.status === "VALID" ? "正常" : "异常";
    }
    return pointCode === selectedPoint ? "已选" : undefined;
  };

  return (
    <Screen>
      <PageHeader title="打卡" />
      {projects === null && error === null ? <StateView title="加载中…" /> : null}
      {projects !== null && projects.length === 0 ? (
        <StateView title="尚未加入任何项目" sub="请等待管理员把你加入项目。" />
      ) : null}
      {projects !== null && projects.length > 1 ? (
        <View>
          {projects.map((p) => (
            <ListItem
              key={p.projectId}
              primary={p.projectName}
              secondary={`${p.projectRoleLabel} · ${p.teamName ?? "无班组"}`}
              chip={p.projectId === projectId ? "已选" : undefined}
              onClick={() => {
                setProjectId(p.projectId);
              }}
            />
          ))}
        </View>
      ) : null}
      {projectId !== null && today === null && error === null ? <StateView title="加载今日排班…" /> : null}
      {today !== null && !today.configured ? (
        <StateView title="项目未配置排班" sub="请联系项目管理员配置默认班次与作息。" />
      ) : null}
      {today !== null && today.configured && !today.isWorkday ? (
        <StateView title="今天休息" sub={`${today.attendanceDate} 不是工作日。`} />
      ) : null}
      {today !== null && today.configured && today.isWorkday ? (
        <View>
          <Subtitle>
            {today.attendanceDate} · {today.shiftName ?? ""}
          </Subtitle>
          {today.points.map((point) => (
            <ListItem
              key={point.pointCode}
              primary={`${POINT_LABEL[point.pointCode]} · ${point.scheduledTime}`}
              secondary={
                point.record !== null
                  ? `已打 ${point.record.occurredAt.slice(11, 16)} · ${reasonText(point.record.abnormalReason)}`
                  : `宽限 ${point.graceMins} 分钟`
              }
              chip={pointChip(point.pointCode)}
              onClick={
                point.record === null
                  ? () => {
                      setSelectedPoint(point.pointCode);
                    }
                  : undefined
              }
            />
          ))}
          <Field value={latitude} placeholder="纬度(定位失败时手动输入)" onInput={setLatitude} />
          <Field value={longitude} placeholder="经度(定位失败时手动输入)" onInput={setLongitude} />
          <Button variant="outline" onClick={fillProjectCenter}>
            填入项目中心
          </Button>
          {distanceHint() !== null ? <Subtitle>{distanceHint()}</Subtitle> : null}
          <Button variant="outline" onClick={() => void pickImage("selfie")}>
            {selfiePath === null ? "拍自拍照" : "重拍自拍照"}
          </Button>
          {selfiePath !== null ? <Image src={selfiePath} style={{ height: "160rpx", width: "160rpx" }} /> : null}
          <Button variant="outline" onClick={() => void pickImage("site")}>
            {sitePhotoPath === null ? "拍现场照" : "重拍现场照"}
          </Button>
          {sitePhotoPath !== null ? <Image src={sitePhotoPath} style={{ height: "160rpx", width: "160rpx" }} /> : null}
          <Button
            onClick={() => {
              if (canSubmit) {
                void submit();
              }
            }}
          >
            {busy ? "提交中…" : selectedPoint === null ? "今日已全部打卡" : `打卡 · ${POINT_LABEL[selectedPoint]}`}
          </Button>
        </View>
      ) : null}
      {error !== null ? <StateView title="错误" sub={error} /> : null}
    </Screen>
  );
}
```

- [ ] **Step 3: Register the page**

In `apps/miniprogram/src/app.config.ts`, append to the `pages` array:

```ts
    "pages/punch/index"
```

- [ ] **Step 4: Wire the worker tile**

In `apps/miniprogram/src/components/role-panels/index.tsx`, change the worker tiles entry

```ts
      { title: "打卡", sub: "四点考勤 · 拍照 + 定位" },
```

to

```ts
      { title: "打卡", sub: "四点考勤 · 拍照 + 定位", nav: { url: "/pages/punch/index" } },
```

- [ ] **Step 5: Typecheck and build**

Run: `cd apps/miniprogram && npx tsc --noEmit -p tsconfig.json && npx taro build --type h5`
Expected: no new type errors (vs Task 4 Step 1 baseline); H5 build succeeds into `dist/`.

- [ ] **Step 6: Commit**

```bash
git add apps/miniprogram/src/pages/punch apps/miniprogram/src/app.config.ts apps/miniprogram/src/components/role-panels/index.tsx
git commit -m "feat(miniprogram): worker punch page (geolocation + photos + point cards)"
```

---

### Task 6: Live end-to-end verification (no code changes)

Precondition: PostgreSQL up and dev DB seeded (`cd apps/api && npm run seed:dev` if unsure). Run these from the repo root. If the API is already running under watch, skip the start step.

- [ ] **Step 1: Build and start the API with the new code**

```bash
cd apps/api && set -a && . ./.env && set +a && npx nest build && (node dist/main.js > /tmp/api.log 2>&1 &) && sleep 2 && curl -s http://localhost:3000/health
```

Expected: a healthy response (existing health payload).

- [ ] **Step 2: Login as dev-worker and stash the token**

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/auth/wechat/login -H 'Content-Type: application/json' -d '{"code":"dev-worker"}' | python3 -c 'import json,sys; print(json.load(sys.stdin)["accessToken"])')
echo "$TOKEN" | head -c 20
```

Expected: a JWT prefix prints.

- [ ] **Step 3: Create a tiny valid PNG and upload it twice**

```bash
echo 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' | base64 -d > /tmp/punch-test.png
SELFIE=$(curl -s -X POST http://localhost:3000/uploads -H "Authorization: Bearer $TOKEN" -F 'file=@/tmp/punch-test.png;type=image/png')
SITE=$(curl -s -X POST http://localhost:3000/uploads -H "Authorization: Bearer $TOKEN" -F 'file=@/tmp/punch-test.png;type=image/png')
echo "$SELFIE"; echo "$SITE"
```

Expected: two JSON bodies, each `{"contentType":"image/png","hash":"<64 hex>","objectKey":"uploads/<date>/<uuid>.png","sizeBytes":68}` (same hash, different objectKey). Confirm the files landed: `ls apps/api/var/uploads/*/`.

- [ ] **Step 4: Check today's state, then punch inside the fence**

```bash
PROJECT=$(curl -s http://localhost:3000/me/projects -H "Authorization: Bearer $TOKEN" | python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["projectId"])')
TODAY=$(curl -s "http://localhost:3000/me/projects/$PROJECT/attendance-today" -H "Authorization: Bearer $TOKEN")
echo "$TODAY" | python3 -m json.tool
```

Expected: `configured: true`, `isWorkday: true` (Mon–Sat; on a Sunday expect `isWorkday: false` — stop here and re-run another day or widen the seed mask), four `points`, `geofence` with the seed center.

```bash
DATE=$(echo "$TODAY" | python3 -c 'import json,sys; print(json.load(sys.stdin)["attendanceDate"])')
SK=$(echo "$SELFIE" | python3 -c 'import json,sys; print(json.load(sys.stdin)["objectKey"])'); SH=$(echo "$SELFIE" | python3 -c 'import json,sys; print(json.load(sys.stdin)["hash"])')
PK=$(echo "$SITE" | python3 -c 'import json,sys; print(json.load(sys.stdin)["objectKey"])'); PH=$(echo "$SITE" | python3 -c 'import json,sys; print(json.load(sys.stdin)["hash"])')
NOW=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
curl -s -X POST "http://localhost:3000/attendance/projects/$PROJECT/records" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "{\"attendanceDate\":\"$DATE\",\"latitude\":\"31.2304000\",\"locationAccuracyM\":null,\"longitude\":\"121.4737000\",\"occurredAt\":\"$NOW\",\"pointCode\":\"SEGMENT_1_START\",\"selfieHash\":\"$SH\",\"selfieObjectKey\":\"$SK\",\"sitePhotoHash\":\"$PH\",\"sitePhotoObjectKey\":\"$PK\"}" | python3 -m json.tool
```

Expected: `record.status = "VALID"`, `record.abnormalReason = null`, plus a `result` object.

- [ ] **Step 5: Punch outside the fence and confirm the today view**

```bash
NOW=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
curl -s -X POST "http://localhost:3000/attendance/projects/$PROJECT/records" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "{\"attendanceDate\":\"$DATE\",\"latitude\":\"39.9000000\",\"locationAccuracyM\":null,\"longitude\":\"116.4000000\",\"occurredAt\":\"$NOW\",\"pointCode\":\"SEGMENT_1_END\",\"selfieHash\":\"$SH\",\"selfieObjectKey\":\"$SK\",\"sitePhotoHash\":\"$PH\",\"sitePhotoObjectKey\":\"$PK\"}" | python3 -m json.tool
curl -s "http://localhost:3000/me/projects/$PROJECT/attendance-today" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

Expected: second punch has `status = "INVALID"`, `abnormalReason = "OUTSIDE_GEOFENCE"`; the today view shows `SEGMENT_1_START.record.status = "VALID"` and `SEGMENT_1_END.record.status = "INVALID"`, the other two points `null`.

- [ ] **Step 6: Serve the H5 build for manual testing**

```bash
( cd apps/miniprogram && python3 -m http.server 8088 --bind 0.0.0.0 --directory dist > /tmp/h5.log 2>&1 ) &
```

Report to the user: open `http://<server-ip>:8088`, login with code `dev-worker`, tap 打卡 — the location fields need manual input (browser blocks geolocation on http), use 填入项目中心, pick two images, submit.

---

## Self-review notes (already applied)

- Spec coverage: uploads (Task 2), storage port + env (Task 1), attendance-today (Task 3), wrappers (Task 4), page/entry/registration (Task 5), curl end-to-end proof (Task 6). Photo-preservation-on-error: the page keeps `selfiePath`/`sitePhotoPath` state on failure (only cleared on success). Duplicate-point protection: punched points get `onClick: undefined`.
- Type consistency: `UploadResult` (client) mirrors `UploadResponse` (server); `AttendanceToday` (client) mirrors `AttendanceTodayResponse` (server); `graceMins`/`scheduledTime`/`record` field names identical on both sides.
- The oversize upload returns 413 (multer/Nest default), matching the amended spec.
