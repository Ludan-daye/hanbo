# Mini Program Backend Enablers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the minimal backend support the Mini Program skeleton needs — `GET /auth/me`, a development-only login path, CORS, and a development seed — without changing production behavior.

**Architecture:** Extend the existing NestJS API. Reuse `AuthorizationContextService` for role data and add a shared `getHighestRoleCode` to `@construction/domain`. Gate development login behind an env flag that cannot be enabled in production. Keep the production `/auth/wechat/login` path intact.

**Tech Stack:** NestJS 10, Prisma 6 (PostgreSQL), Zod, Vitest + Supertest, pnpm workspace. Tests use the existing in-memory Prisma test-double pattern (no database required).

This is the prerequisite plan. The frontend plan (`2026-06-09-miniprogram-all-role-skeleton-frontend.md`) depends on the endpoints built here.

---

## File Structure

- Modify `packages/domain/src/roles.ts`: add `getHighestRoleCode`.
- Modify `packages/domain/test/roles.test.ts`: tests for `getHighestRoleCode`.
- Modify `apps/api/src/auth/auth.types.ts`: add `MeResponse` types.
- Modify `apps/api/src/auth/auth.service.ts`: add `getMe`, inject `AuthorizationContextService`.
- Modify `apps/api/src/auth/auth.controller.ts`: add `GET /auth/me`.
- Modify `apps/api/src/auth/auth.module.ts`: import `AuthorizationModule`.
- Create `apps/api/test/me.e2e.test.ts`: e2e tests for `GET /auth/me`.
- Modify `apps/api/src/config/env.ts`: add `WECHAT_DEV_LOGIN`, `CORS_ALLOWED_ORIGINS`, production guard.
- Modify `apps/api/test/env.test.ts` (create): env parsing/guard tests.
- Modify `apps/api/src/infrastructure/wechat/wechat-code-session.connector.ts`: dev short-circuit.
- Modify `apps/api/test/wechat-code-session.connector.test.ts`: dev-login unit test.
- Modify `apps/api/src/auth/auth.module.ts`: pass `devLoginEnabled` to connector factory.
- Create `apps/api/src/main.cors.ts`: pure `parseAllowedOrigins` helper.
- Create `apps/api/test/main.cors.test.ts`: helper unit tests.
- Modify `apps/api/src/main.ts`: enable CORS from parsed origins.
- Create `apps/api/prisma/seed.dev.ts`: development demo data.
- Modify `apps/api/package.json`: add `seed:dev` script.

---

## Task 1: Local PostgreSQL Development Environment

No database is needed for the test suite (tests use in-memory doubles), but it is needed to run the API and the dev seed for manual verification and for the frontend plan.

**Files:** none (environment setup).

- [ ] **Step 1: Install PostgreSQL 16**

Run:
```bash
sudo apt-get update && sudo apt-get install -y postgresql postgresql-contrib
```
Expected: packages install; `ls /usr/lib/postgresql/16/bin/` shows `initdb`, `postgres`, `pg_ctl`.

- [ ] **Step 2: Start the cluster and create the role/database**

Run:
```bash
pg_ctlcluster 16 main start
sudo -u postgres psql -c "CREATE ROLE construction WITH LOGIN PASSWORD 'construction';"
sudo -u postgres psql -c "CREATE DATABASE construction_personnel OWNER construction;"
```
Expected: `CREATE ROLE`, `CREATE DATABASE`. If the cluster is missing, create it with `pg_createcluster 16 main --start` then retry.

- [ ] **Step 3: Create the API env file**

Create `apps/api/.env` (gitignored) by copying `.env.example` and confirming:
```bash
cp .env.example apps/api/.env
```
Ensure `DATABASE_URL=postgresql://construction:construction@localhost:5432/construction_personnel?schema=public`.

- [ ] **Step 4: Apply migrations and the base seed**

Run:
```bash
corepack pnpm --filter @construction/api exec prisma migrate deploy
corepack pnpm --filter @construction/api exec prisma db seed
```
Expected: migrations applied; base seed (roles/permissions) completes without error.

- [ ] **Step 5: Verify connectivity**

Run:
```bash
sudo -u postgres psql -d construction_personnel -c "SELECT code FROM roles ORDER BY level;"
```
Expected: five rows `SYSTEM_ADMIN, COMPANY_ADMIN, PROJECT_ADMIN, TEAM_LEADER, WORKER`.

No commit (environment only).

---

## Task 2: Domain `getHighestRoleCode`

**Files:**
- Modify: `packages/domain/src/roles.ts`
- Test: `packages/domain/test/roles.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `packages/domain/test/roles.test.ts` (keep existing imports; add `getHighestRoleCode` to the import from `../src/roles.js`):

```ts
import { getHighestRoleCode } from "../src/roles.js";

describe("getHighestRoleCode", () => {
  test("returns the higher-ranked role among assignments", () => {
    expect(
      getHighestRoleCode([{ roleCode: "WORKER" }, { roleCode: "TEAM_LEADER" }])
    ).toBe("TEAM_LEADER");
  });

  test("ranks SYSTEM_ADMIN above all others", () => {
    expect(
      getHighestRoleCode([{ roleCode: "PROJECT_ADMIN" }, { roleCode: "SYSTEM_ADMIN" }])
    ).toBe("SYSTEM_ADMIN");
  });

  test("returns null when there are no assignments", () => {
    expect(getHighestRoleCode([])).toBeNull();
  });
});
```

(If `describe`/`test`/`expect` are already imported at the top of the file, do not duplicate the import.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `corepack pnpm --filter @construction/domain test`
Expected: FAIL — `getHighestRoleCode is not a function` / not exported.

- [ ] **Step 3: Implement `getHighestRoleCode`**

Append to `packages/domain/src/roles.ts`:

```ts
export const getHighestRoleCode = (assignments: readonly RoleAssignment[]): RoleCode | null => {
  let highest: RoleCode | null = null;

  for (const assignment of assignments) {
    if (highest === null || ROLE_LEVEL[assignment.roleCode] < ROLE_LEVEL[highest]) {
      highest = assignment.roleCode;
    }
  }

  return highest;
};
```

(Lower `ROLE_LEVEL` number means higher rank: `SYSTEM_ADMIN` is 1.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `corepack pnpm --filter @construction/domain test`
Expected: PASS (existing tests plus the three new ones).

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/roles.ts packages/domain/test/roles.test.ts
git commit -m "feat(domain): add getHighestRoleCode for role-based routing"
```

---

## Task 3: `GET /auth/me`

**Files:**
- Modify: `apps/api/src/auth/auth.types.ts`
- Modify: `apps/api/src/auth/auth.service.ts`
- Modify: `apps/api/src/auth/auth.controller.ts`
- Modify: `apps/api/src/auth/auth.module.ts`
- Test: `apps/api/test/me.e2e.test.ts`

- [ ] **Step 1: Write the failing e2e test**

Create `apps/api/test/me.e2e.test.ts`:

```ts
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
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `corepack pnpm --filter @construction/api exec vitest run test/me.e2e.test.ts`
Expected: FAIL — 404 for `GET /auth/me` (route not defined yet).

- [ ] **Step 3: Add the `MeResponse` types**

Add to `apps/api/src/auth/auth.types.ts` (extend the existing `UserStatus` import to also import role types):

```ts
import type { RoleCode, ScopeType } from "@construction/domain/roles.js";

export type MeRoleAssignment = {
  readonly roleCode: RoleCode;
  readonly scope: {
    readonly scopeId: string;
    readonly scopeType: ScopeType;
  };
};

export type MeProfileSummary = {
  readonly id: string | null;
  readonly type: "MANAGER" | "WORKER" | null;
};

export type MeResponse = {
  readonly profile: MeProfileSummary;
  readonly roles: {
    readonly assignments: readonly MeRoleAssignment[];
    readonly highestRoleCode: RoleCode | null;
  };
  readonly user: {
    readonly id: string;
    readonly isBound: boolean;
    readonly status: UserStatus;
  };
};
```

- [ ] **Step 4: Implement `getMe` in the service**

In `apps/api/src/auth/auth.service.ts`:

1. Add imports near the existing domain/auth imports:
```ts
import { getHighestRoleCode } from "@construction/domain/roles.js";

import { AuthorizationContextService } from "../authorization/authorization-context.service.js";
```
2. Add `MeProfileSummary`, `MeResponse` to the `./auth.types.js` import list.
3. Add a constructor dependency (extend the existing constructor parameter list):
```ts
    @Inject(AuthorizationContextService) private readonly authorizationContext: AuthorizationContextService,
```
4. Add a module-level helper near the other `const create...` helpers:
```ts
const createProfileSummary = (user: {
  readonly managerProfile: { readonly id: string } | null;
  readonly workerProfile: { readonly id: string } | null;
}): MeProfileSummary => {
  if (user.workerProfile !== null) {
    return { id: user.workerProfile.id, type: "WORKER" };
  }

  if (user.managerProfile !== null) {
    return { id: user.managerProfile.id, type: "MANAGER" };
  }

  return { id: null, type: null };
};
```
5. Add the method to the `AuthService` class:
```ts
  async getMe(userId: string): Promise<MeResponse> {
    const user = await this.prisma.user.findUnique({
      include: {
        managerProfile: true,
        workerProfile: true
      },
      where: {
        id: userId
      }
    });

    if (user === null) {
      throw new UnauthorizedException({
        message: "CURRENT_USER_NOT_FOUND",
        userId
      });
    }

    const { assignments } = await this.authorizationContext.loadAuthorizationData(userId);

    return {
      profile: createProfileSummary(user),
      roles: {
        assignments: assignments.map((assignment) => ({
          roleCode: assignment.roleCode,
          scope: {
            scopeId: assignment.scope.scopeId,
            scopeType: assignment.scope.scopeType
          }
        })),
        highestRoleCode: getHighestRoleCode(assignments)
      },
      user: {
        id: user.id,
        isBound: user.isBound,
        status: user.status
      }
    };
  }
```

- [ ] **Step 5: Add the controller route**

In `apps/api/src/auth/auth.controller.ts`:
1. Add `Get` to the `@nestjs/common` import.
2. Add `MeResponse` to the `./auth.types.js` type import.
3. Add the route inside the class:
```ts
  @Get("me")
  @UseGuards(AccessTokenGuard)
  async me(@CurrentUser() currentUser: AuthenticatedUser): Promise<MeResponse> {
    return this.authService.getMe(currentUser.userId);
  }
```

- [ ] **Step 6: Wire `AuthorizationModule` into `AuthModule`**

In `apps/api/src/auth/auth.module.ts`:
1. Add the import:
```ts
import { AuthorizationModule } from "../authorization/authorization.module.js";
```
2. Add `AuthorizationModule` to the `imports` array:
```ts
  imports: [AuthorizationModule, EnvModule, JwtModule.register({}), PrismaModule],
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `corepack pnpm --filter @construction/api exec vitest run test/me.e2e.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 8: Run the full API suite (no regressions)**

Run: `corepack pnpm --filter @construction/api test`
Expected: PASS — all suites including the new `me.e2e.test.ts`.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/auth packages/domain apps/api/test/me.e2e.test.ts
git commit -m "feat(api): add GET /auth/me returning profile, roles, and highest role"
```

---

## Task 4: Development Login

**Files:**
- Modify: `apps/api/src/config/env.ts`
- Test: `apps/api/test/env.test.ts` (create)
- Modify: `apps/api/src/infrastructure/wechat/wechat-code-session.connector.ts`
- Test: `apps/api/test/wechat-code-session.connector.test.ts`
- Modify: `apps/api/src/auth/auth.module.ts`

- [ ] **Step 1: Write failing env tests**

Create `apps/api/test/env.test.ts`:

```ts
import { describe, expect, test } from "vitest";

import { loadEnv } from "../src/config/env.js";

const baseEnv = (): NodeJS.ProcessEnv => ({
  AUTH_REFRESH_TOKEN_TTL_SECONDS: "2592000",
  API_PORT: "3000",
  DATABASE_URL: "postgresql://construction:construction@localhost:5432/construction_personnel?schema=public",
  FACE_SERVICE_API_KEY: "face-service-key",
  FACE_SERVICE_BASE_URL: "http://localhost:8000",
  JWT_ACCESS_TOKEN_SECRET: "test-jwt-secret-with-at-least-32-characters",
  JWT_ACCESS_TOKEN_TTL_SECONDS: "900",
  NODE_ENV: "development",
  OBJECT_STORAGE_ACCESS_KEY: "object-storage-access-key",
  OBJECT_STORAGE_BUCKET: "construction-personnel",
  OBJECT_STORAGE_ENDPOINT: "http://localhost:9000",
  OBJECT_STORAGE_SECRET_KEY: "object-storage-secret-key",
  WECHAT_APP_ID: "wechat-app-id",
  WECHAT_APP_SECRET: "wechat-app-secret"
});

describe("loadEnv", () => {
  test("defaults WECHAT_DEV_LOGIN to false and CORS_ALLOWED_ORIGINS to empty", () => {
    const env = loadEnv(baseEnv());
    expect(env.WECHAT_DEV_LOGIN).toBe(false);
    expect(env.CORS_ALLOWED_ORIGINS).toBe("");
  });

  test("parses WECHAT_DEV_LOGIN=true in non-production", () => {
    const env = loadEnv({ ...baseEnv(), WECHAT_DEV_LOGIN: "true" });
    expect(env.WECHAT_DEV_LOGIN).toBe(true);
  });

  test("rejects WECHAT_DEV_LOGIN=true when NODE_ENV is production", () => {
    expect(() => loadEnv({ ...baseEnv(), NODE_ENV: "production", WECHAT_DEV_LOGIN: "true" })).toThrow();
  });
});
```

- [ ] **Step 2: Run the env tests to verify they fail**

Run: `corepack pnpm --filter @construction/api exec vitest run test/env.test.ts`
Expected: FAIL — `WECHAT_DEV_LOGIN` undefined / no production guard.

- [ ] **Step 3: Implement env changes**

Replace the body of `apps/api/src/config/env.ts` with:

```ts
import { z } from "zod";

const booleanStringSchema = z
  .enum(["true", "false"])
  .default("false")
  .transform((value): boolean => value === "true");

const envSchema = z
  .object({
    AUTH_REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive(),
    API_PORT: z.coerce.number().int().positive(),
    CORS_ALLOWED_ORIGINS: z.string().default(""),
    DATABASE_URL: z.string().min(1),
    FACE_SERVICE_API_KEY: z.string().min(1),
    FACE_SERVICE_BASE_URL: z.string().url(),
    JWT_ACCESS_TOKEN_SECRET: z.string().min(32),
    JWT_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive(),
    NODE_ENV: z.enum(["development", "test", "production"]),
    OBJECT_STORAGE_ACCESS_KEY: z.string().min(1),
    OBJECT_STORAGE_BUCKET: z.string().min(1),
    OBJECT_STORAGE_ENDPOINT: z.string().url(),
    OBJECT_STORAGE_SECRET_KEY: z.string().min(1),
    WECHAT_APP_ID: z.string().min(1),
    WECHAT_APP_SECRET: z.string().min(1),
    WECHAT_DEV_LOGIN: booleanStringSchema
  })
  .superRefine((env, ctx): void => {
    if (env.NODE_ENV === "production" && env.WECHAT_DEV_LOGIN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "WECHAT_DEV_LOGIN must be false in production",
        path: ["WECHAT_DEV_LOGIN"]
      });
    }
  });

export type ApiEnv = z.infer<typeof envSchema>;

export const loadEnv = (env: NodeJS.ProcessEnv): ApiEnv => {
  const result = envSchema.safeParse(env);

  if (!result.success) {
    throw new Error(
      JSON.stringify({
        issues: result.error.issues,
        message: "Invalid environment configuration"
      })
    );
  }

  return result.data;
};
```

- [ ] **Step 4: Run the env tests to verify they pass**

Run: `corepack pnpm --filter @construction/api exec vitest run test/env.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing connector dev-login test**

Add to `apps/api/test/wechat-code-session.connector.test.ts` a test that, with `devLoginEnabled: true`, `exchangeCode` returns the code as the openid without calling fetch. Use a fetch double that throws if called:

```ts
test("returns the code as openid without network when dev login is enabled", async () => {
  const connector = new WechatCodeSessionConnector({
    appId: "app-id",
    appSecret: "app-secret",
    devLoginEnabled: true,
    endpoint: WECHAT_CODE_SESSION_ENDPOINT,
    fetchImplementation: async () => {
      throw new Error("fetch must not be called in dev login");
    },
    logger: { warn: () => {} },
    maxAttempts: 3,
    retryDelayMs: 0,
    sleep: async () => {}
  });

  const session = await connector.exchangeCode("dev-worker");

  expect(session.openid).toBe("dev-worker");
});
```

(Match the construction style used by the existing tests in this file; add `devLoginEnabled: false` to any existing `new WechatCodeSessionConnector({...})` calls so they still type-check.)

- [ ] **Step 6: Run the connector test to verify it fails**

Run: `corepack pnpm --filter @construction/api exec vitest run test/wechat-code-session.connector.test.ts`
Expected: FAIL — `devLoginEnabled` not in config type / not honored.

- [ ] **Step 7: Implement the connector dev short-circuit**

In `apps/api/src/infrastructure/wechat/wechat-code-session.connector.ts`:
1. Add `readonly devLoginEnabled: boolean;` to `WechatCodeSessionConnectorConfig`.
2. At the very top of `exchangeCode`, before the retry loop:
```ts
    if (this.config.devLoginEnabled) {
      return {
        openid: jsCode,
        sessionKey: `dev-session-${jsCode}`
      };
    }
```

- [ ] **Step 8: Pass the flag from the module factory**

In `apps/api/src/auth/auth.module.ts`, inside the `WechatCodeSessionConnector` factory config object, add:
```ts
          devLoginEnabled: env.WECHAT_DEV_LOGIN,
```

- [ ] **Step 9: Run the connector test to verify it passes**

Run: `corepack pnpm --filter @construction/api exec vitest run test/wechat-code-session.connector.test.ts`
Expected: PASS.

- [ ] **Step 10: Typecheck and full suite**

Run:
```bash
corepack pnpm --filter @construction/api typecheck
corepack pnpm --filter @construction/api test
```
Expected: typecheck clean; all tests PASS.

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/config/env.ts apps/api/test/env.test.ts \
  apps/api/src/infrastructure/wechat/wechat-code-session.connector.ts \
  apps/api/test/wechat-code-session.connector.test.ts apps/api/src/auth/auth.module.ts
git commit -m "feat(api): add dev login (WECHAT_DEV_LOGIN) bypassing the WeChat code exchange"
```

---

## Task 5: CORS

**Files:**
- Create: `apps/api/src/main.cors.ts`
- Test: `apps/api/test/main.cors.test.ts`
- Modify: `apps/api/src/main.ts`

- [ ] **Step 1: Write the failing helper test**

Create `apps/api/test/main.cors.test.ts`:

```ts
import { describe, expect, test } from "vitest";

import { parseAllowedOrigins } from "../src/main.cors.js";

describe("parseAllowedOrigins", () => {
  test("returns an empty array for an empty string", () => {
    expect(parseAllowedOrigins("")).toEqual([]);
  });

  test("splits a comma-separated list and trims whitespace", () => {
    expect(parseAllowedOrigins("http://localhost:10086, https://example.com")).toEqual([
      "http://localhost:10086",
      "https://example.com"
    ]);
  });

  test("drops empty entries", () => {
    expect(parseAllowedOrigins("http://a.com,,http://b.com,")).toEqual(["http://a.com", "http://b.com"]);
  });
});
```

- [ ] **Step 2: Run the helper test to verify it fails**

Run: `corepack pnpm --filter @construction/api exec vitest run test/main.cors.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `apps/api/src/main.cors.ts`:

```ts
export const parseAllowedOrigins = (raw: string): string[] =>
  raw
    .split(",")
    .map((origin: string): string => origin.trim())
    .filter((origin: string): boolean => origin.length > 0);
```

- [ ] **Step 4: Run the helper test to verify it passes**

Run: `corepack pnpm --filter @construction/api exec vitest run test/main.cors.test.ts`
Expected: PASS.

- [ ] **Step 5: Enable CORS in bootstrap**

Replace `apps/api/src/main.ts` with:

```ts
import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module.js";
import { loadEnv } from "./config/env.js";
import { parseAllowedOrigins } from "./main.cors.js";

const bootstrap = async (): Promise<void> => {
  const env = loadEnv(process.env);
  const app = await NestFactory.create(AppModule);

  const allowedOrigins = parseAllowedOrigins(env.CORS_ALLOWED_ORIGINS);
  if (allowedOrigins.length > 0) {
    app.enableCors({ origin: allowedOrigins });
  }

  app.enableShutdownHooks();

  await app.listen(env.API_PORT);
};

await bootstrap();
```

- [ ] **Step 6: Typecheck and commit**

Run: `corepack pnpm --filter @construction/api typecheck`
Expected: clean.

```bash
git add apps/api/src/main.cors.ts apps/api/test/main.cors.test.ts apps/api/src/main.ts
git commit -m "feat(api): enable configurable CORS from CORS_ALLOWED_ORIGINS"
```

---

## Task 6: Development Seed

**Files:**
- Create: `apps/api/prisma/seed.dev.ts`
- Modify: `apps/api/package.json` (add `seed:dev` script)

This seed depends on a running database (Task 1). It is verified by running it, not by unit tests.

- [ ] **Step 1: Create the dev seed**

Create `apps/api/prisma/seed.dev.ts`:

```ts
import { createHash } from "node:crypto";

import { PrismaClient, type RoleCode, type UserRoleScopeType } from "@prisma/client";

const prisma = new PrismaClient();

const GLOBAL_SCOPE_ID = "GLOBAL";
const DEV_BIND_CODE = "DEV-BIND-CODE";

const hash = (value: string): string => createHash("sha256").update(value).digest("hex");

type DemoManager = {
  readonly openid: string;
  readonly name: string;
  readonly roleCode: RoleCode;
  readonly scopeType: UserRoleScopeType;
};

const upsertUser = async (openid: string, isBound: boolean): Promise<string> => {
  const user = await prisma.user.upsert({
    create: { isBound, openid, status: "ACTIVE" },
    update: { isBound, status: "ACTIVE" },
    where: { openid }
  });
  return user.id;
};

const upsertUserRole = async (
  userId: string,
  roleCode: RoleCode,
  scopeType: UserRoleScopeType,
  scopeId: string
): Promise<void> => {
  const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
  await prisma.userRole.upsert({
    create: { roleId: role.id, scopeId, scopeType, userId },
    update: {},
    where: {
      userId_roleId_scopeType_scopeId: { roleId: role.id, scopeId, scopeType, userId }
    }
  });
};

const main = async (): Promise<void> => {
  const company = await prisma.company.upsert({
    create: { id: "dev-company", name: "示例建筑公司", status: "ACTIVE" },
    update: { name: "示例建筑公司", status: "ACTIVE" },
    where: { id: "dev-company" }
  });
  const project = await prisma.project.upsert({
    create: {
      address: "示例市示例区示例路 1 号",
      centerLatitude: "31.2304000",
      centerLongitude: "121.4737000",
      companyId: company.id,
      geofenceRadiusM: 300,
      id: "dev-project",
      name: "示例工地一号",
      plannedStartDate: new Date("2026-01-01T00:00:00.000Z"),
      status: "ACTIVE"
    },
    update: { companyId: company.id, name: "示例工地一号", status: "ACTIVE" },
    where: { id: "dev-project" }
  });
  const team = await prisma.team.upsert({
    create: { id: "dev-team", name: "一号班组", projectId: project.id, status: "ACTIVE" },
    update: { name: "一号班组", projectId: project.id, status: "ACTIVE" },
    where: { id: "dev-team" }
  });

  // System / company / project / team managers.
  const managers: readonly DemoManager[] = [
    { name: "系统管理员", openid: "dev-system", roleCode: "SYSTEM_ADMIN", scopeType: "GLOBAL" },
    { name: "公司管理员", openid: "dev-company", roleCode: "COMPANY_ADMIN", scopeType: "COMPANY" },
    { name: "项目管理员", openid: "dev-project", roleCode: "PROJECT_ADMIN", scopeType: "PROJECT" },
    { name: "班组长", openid: "dev-team", roleCode: "TEAM_LEADER", scopeType: "TEAM" }
  ];
  const scopeIdFor = (scopeType: UserRoleScopeType): string =>
    scopeType === "GLOBAL"
      ? GLOBAL_SCOPE_ID
      : scopeType === "COMPANY"
        ? company.id
        : scopeType === "PROJECT"
          ? project.id
          : team.id;

  for (const manager of managers) {
    const userId = await upsertUser(manager.openid, true);
    const profile = await prisma.managerProfile.upsert({
      create: { name: manager.name, phone: `138${manager.openid}`, status: "ACTIVE", userId },
      update: { name: manager.name, userId },
      where: { userId }
    });
    void profile;
    await upsertUserRole(userId, manager.roleCode, manager.scopeType, scopeIdFor(manager.scopeType));
  }

  // Worker (bound, with WORKER role at the project scope).
  const workerUserId = await upsertUser("dev-worker", true);
  await prisma.workerProfile.upsert({
    create: {
      employmentStatus: "ACTIVE",
      encryptedIdNumber: "dev-encrypted-id",
      encryptedName: "dev-encrypted-name",
      faceProfileStatus: "PENDING",
      idNumberHash: hash("dev-worker-id"),
      phone: "13800000001",
      realNameStatus: "PENDING",
      userId: workerUserId,
      workType: "钢筋工"
    },
    update: { userId: workerUserId },
    where: { userId: workerUserId }
  });
  await upsertUserRole(workerUserId, "WORKER", "PROJECT", project.id);

  // Unbound user + an unbound worker profile + a pending invitation for the bind-flow demo.
  const creatorUserId = await upsertUser("dev-project", true); // project admin as inviter
  await upsertUser("dev-unbound", false);
  const unboundWorker = await prisma.workerProfile.upsert({
    create: {
      employmentStatus: "ACTIVE",
      encryptedIdNumber: "dev-encrypted-id-2",
      encryptedName: "dev-encrypted-name-2",
      faceProfileStatus: "PENDING",
      idNumberHash: hash("dev-unbound-worker-id"),
      phone: "13800000002",
      realNameStatus: "PENDING",
      workType: "木工"
    },
    update: {},
    where: { idNumberHash: hash("dev-unbound-worker-id") }
  });
  await prisma.bindingInvitation.upsert({
    create: {
      codeHash: hash(DEV_BIND_CODE),
      createdByUserId: creatorUserId,
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      status: "PENDING",
      targetType: "WORKER",
      workerProfileId: unboundWorker.id
    },
    update: {
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      status: "PENDING",
      workerProfileId: unboundWorker.id
    },
    where: { codeHash: hash(DEV_BIND_CODE) }
  });

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ devBindCode: DEV_BIND_CODE, message: "dev seed complete" }));
};

try {
  await main();
} finally {
  await prisma.$disconnect();
}
```

- [ ] **Step 2: Add the `seed:dev` script**

In `apps/api/package.json`, add to `scripts` (the `--env-file=.env` is required: unlike
`prisma db seed`, a direct `tsx` run does not load `.env`, so `DATABASE_URL` would be missing):
```json
    "seed:dev": "tsx --env-file=.env prisma/seed.dev.ts",
```

- [ ] **Step 3: Run the dev seed against the local database**

Run (requires Task 1 complete, base seed applied):
```bash
corepack pnpm --filter @construction/api seed:dev
```
Expected: prints `{"devBindCode":"DEV-BIND-CODE","message":"dev seed complete"}`. Re-running is safe (idempotent upserts).

- [ ] **Step 4: Verify the demo data**

Run:
```bash
sudo -u postgres psql -d construction_personnel -c \
  "SELECT u.openid, r.code, ur.scope_type FROM users u JOIN user_roles ur ON ur.\"userId\"=u.id JOIN roles r ON r.id=ur.\"roleId\" ORDER BY r.level;"
```
Expected: rows mapping `dev-system→SYSTEM_ADMIN(GLOBAL)`, `dev-company→COMPANY_ADMIN(COMPANY)`, `dev-project→PROJECT_ADMIN(PROJECT)`, `dev-team→TEAM_LEADER(TEAM)`, `dev-worker→WORKER(PROJECT)`.

(Note: column names follow Prisma's mapping; if the quoted camelCase columns differ, inspect with `\d user_roles`.)

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/seed.dev.ts apps/api/package.json
git commit -m "feat(api): add development seed with one demo user per role"
```

---

## Task 7: End-to-End Backend Smoke

**Files:** none (verification).

- [ ] **Step 1: Run the API with dev login + CORS**

Run (background):
```bash
cd apps/api
WECHAT_DEV_LOGIN=true CORS_ALLOWED_ORIGINS=http://localhost:10086 \
  corepack pnpm start:dev
```
Expected: Nest starts on port 3000 with no errors.

- [ ] **Step 2: Dev-login and call `/auth/me` as the worker**

Run:
```bash
TOKEN=$(curl -s -X POST localhost:3000/auth/wechat/login -H 'content-type: application/json' \
  -d '{"code":"dev-worker"}' | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).accessToken))')
curl -s localhost:3000/auth/me -H "Authorization: Bearer $TOKEN"
```
Expected: JSON with `profile.type:"WORKER"`, `roles.highestRoleCode:"WORKER"`, `user.isBound:true`.

- [ ] **Step 3: Confirm the full workspace suite is green**

Run: `corepack pnpm -r test`
Expected: domain + api suites all PASS.

- [ ] **Step 4: Stop the dev server**

Stop the backgrounded `start:dev` process.

No commit (verification only).

---

## Self-Review

- **Spec coverage:** `GET /auth/me` (Task 3) ✓; dev login (Task 4) ✓; CORS (Task 5) ✓; dev seed with one user per role + unbound bind-flow user (Task 6) ✓; local Postgres env (Task 1) ✓; `getHighestRoleCode` shared in domain (Task 2) ✓; production guard on dev login (Task 4) ✓.
- **Placeholders:** none — every code step shows full code; commands show expected output.
- **Type consistency:** `MeResponse` shape returned by `getMe` matches the e2e assertion in Task 3; `getHighestRoleCode` signature (`readonly RoleAssignment[]`) matches its call in `getMe` (assignments are `ScopedRoleAssignment[]`, which extends `RoleAssignment`); `WECHAT_DEV_LOGIN` is a boolean after transform and is read as a boolean in the connector factory and the production guard.
- **Note vs spec:** the spec's `/auth/me` example showed `companyId/projectId/teamId` inside `scope`; `loadAuthorizationData` only provides `{ scopeType, scopeId }`, so the implementation returns that minimal scope. The spec example is illustrative; the richer scope can be added later if a slice needs it.
