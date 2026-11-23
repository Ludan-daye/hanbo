import { Controller, Get, Param, Put, UseGuards } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import type { RoleCode } from "@construction/domain";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { AccessTokenGuard } from "../src/auth/access-token.guard.js";
import { AuthModule } from "../src/auth/auth.module.js";
import { ActiveCompanyGuard } from "../src/authorization/active-company.guard.js";
import { AuthorizationModule } from "../src/authorization/authorization.module.js";
import { PermissionsGuard } from "../src/authorization/permissions.guard.js";
import { RequireActiveCompany } from "../src/authorization/require-active-company.decorator.js";
import { RequirePermission } from "../src/authorization/require-permission.decorator.js";
import { PrismaService } from "../src/infrastructure/database/prisma.service.js";

type UserStatusValue = "ACTIVE" | "DISABLED";
type ScopeTypeValue = "GLOBAL" | "COMPANY" | "PROJECT" | "TEAM";

type UserRecord = {
  readonly openid: string;
  readonly isBound: boolean;
  readonly encryptedRealName: string;
  readonly phone: string;
  readonly nickname: string;
  readonly avatarObjectKey: string;
  id: string;
  sessionVersion: number;
  status: UserStatusValue;
};

type SessionRecord = {
  expiresAt: Date;
  id: string;
  revokedAt: Date | null;
  user: UserRecord;
  userId: string;
};

type ProjectRecord = {
  companyId: string;
  id: string;
};

type PermissionRecord = {
  code: string;
};

type RolePermissionRecord = {
  permission: PermissionRecord;
};

type RoleRecord = {
  code: RoleCode;
  id: string;
  permissions: RolePermissionRecord[];
};

type UserRoleRecord = {
  role: RoleRecord;
  scopeId: string;
  scopeType: ScopeTypeValue;
  userId: string;
};

type UserSessionFindUniqueArgs = {
  where: {
    id: string;
  };
};

type ProjectFindUniqueArgs = {
  where: {
    id: string;
  };
};

type UserRoleFindManyArgs = {
  where: {
    userId: string;
  };
};

class AuthorizationPrismaTestDouble {
  readonly users = new Map<string, UserRecord>();
  readonly sessions = new Map<string, SessionRecord>();
  readonly projects = new Map<string, ProjectRecord>();
  readonly companies = new Map<string, { id: string; status: string }>();
  readonly roles = new Map<RoleCode, RoleRecord>();
  readonly userRoles: UserRoleRecord[] = [];

  readonly userSession = {
    findUnique: async (args: UserSessionFindUniqueArgs): Promise<SessionRecord | null> =>
      this.sessions.get(args.where.id) ?? null
  };

  readonly project = {
    findUnique: async (args: ProjectFindUniqueArgs): Promise<ProjectRecord | null> =>
      this.projects.get(args.where.id) ?? null
  };

  readonly company = {
    findUnique: async (args: { where: { id: string } }): Promise<{ id: string; status: string } | null> =>
      this.companies.get(args.where.id) ?? null
  };

  readonly role = {
    findMany: async (): Promise<RoleRecord[]> => Array.from(this.roles.values())
  };

  readonly userRole = {
    findMany: async (args: UserRoleFindManyArgs): Promise<UserRoleRecord[]> =>
      this.userRoles.filter((userRole: UserRoleRecord): boolean => userRole.userId === args.where.userId)
  };

  seedRole(roleCode: RoleCode, permissionCodes: readonly string[]): void {
    this.roles.set(roleCode, {
      code: roleCode,
      id: `role-${roleCode}`,
      permissions: permissionCodes.map(
        (permissionCode: string): RolePermissionRecord => ({
          permission: {
            code: permissionCode
          }
        })
      )
    });
  }

  seedActiveSession(userId: string, sessionId: string): void {
    const user: UserRecord = {
      id: userId,
      openid: userId,
      isBound: true,
      encryptedRealName: "test-encrypted-name",
      phone: "13800000000",
      nickname: "Test",
      avatarObjectKey: "test/avatar.png",
      sessionVersion: 1,
      status: "ACTIVE"
    };
    this.users.set(userId, user);
    this.sessions.set(sessionId, {
      expiresAt: new Date(Date.now() + 60_000),
      id: sessionId,
      revokedAt: null,
      user,
      userId
    });
  }
}

@Controller("authorization-test/projects")
class AuthorizationTestController {
  @Get(":projectId")
  @RequirePermission({
    permissionCode: "project.manage",
    target: {
      paramName: "projectId",
      source: "projectParam"
    }
  })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  getProject(@Param("projectId") projectId: string): { readonly projectId: string; readonly status: "ok" } {
    return {
      projectId,
      status: "ok"
    };
  }

  @Put(":projectId")
  @RequirePermission({
    permissionCode: "project.manage",
    target: {
      paramName: "projectId",
      source: "projectParam"
    }
  })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  putProject(@Param("projectId") projectId: string): { readonly projectId: string; readonly status: "saved" } {
    return {
      projectId,
      status: "saved"
    };
  }

  // Permission checked in the service in the real routes; only the company is checked here.
  @Put(":projectId/punch")
  @RequireActiveCompany({
    paramName: "projectId",
    source: "projectParam"
  })
  @UseGuards(AccessTokenGuard, ActiveCompanyGuard)
  punch(@Param("projectId") projectId: string): { readonly projectId: string; readonly status: "punched" } {
    return {
      projectId,
      status: "punched"
    };
  }
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

const createApp = async (prisma: AuthorizationPrismaTestDouble): Promise<INestApplication> => {
  const moduleRef = await Test.createTestingModule({
    controllers: [AuthorizationTestController],
    imports: [AuthModule, AuthorizationModule]
  })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .compile();

  const app = moduleRef.createNestApplication();
  await app.listen(0, "127.0.0.1");
  return app;
};

const createAccessToken = async (app: INestApplication, userId: string, sessionId: string): Promise<string> => {
  const jwtService = app.get(JwtService);
  const secret = process.env.JWT_ACCESS_TOKEN_SECRET;

  if (secret === undefined) {
    throw new Error(
      JSON.stringify({
        message: "Missing JWT test secret"
      })
    );
  }

  return jwtService.signAsync(
    {
      sid: sessionId,
      sub: userId,
      sv: 1
    },
    {
      secret
    }
  );
};

const seedDirectRolePermissions = (prisma: AuthorizationPrismaTestDouble): void => {
  prisma.seedRole("SYSTEM_ADMIN", ["system.manage"]);
  prisma.seedRole("COMPANY_ADMIN", ["company.manage", "project.create"]);
  prisma.seedRole("PROJECT_ADMIN", ["project.manage"]);
  prisma.seedRole("TEAM_LEADER", ["makeup.approve"]);
  prisma.seedRole("WORKER", ["attendance.submit"]);
};

describe("PermissionsGuard", (): void => {
  let app: INestApplication | undefined;
  let prisma: AuthorizationPrismaTestDouble;

  beforeEach((): void => {
    applyTestEnv();
    prisma = new AuthorizationPrismaTestDouble();
    seedDirectRolePermissions(prisma);
    prisma.projects.set("project-1", { companyId: "company-1", id: "project-1" });
    prisma.projects.set("project-2", { companyId: "company-1", id: "project-2" });
  });

  afterEach(async (): Promise<void> => {
    if (app !== undefined) {
      await app.close();
      app = undefined;
    }
  });

  test("returns 401 without bearer token", async (): Promise<void> => {
    app = await createApp(prisma);

    await request(app.getHttpServer()).get("/authorization-test/projects/project-1").expect(401);
  });

  test("returns 403 for authenticated users without required permission", async (): Promise<void> => {
    prisma.seedActiveSession("user-1", "session-1");
    prisma.userRoles.push({
      role: prisma.roles.get("WORKER") as RoleRecord,
      scopeId: "project-1",
      scopeType: "PROJECT",
      userId: "user-1"
    });
    app = await createApp(prisma);
    const accessToken = await createAccessToken(app, "user-1", "session-1");

    await request(app.getHttpServer())
      .get("/authorization-test/projects/project-1")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(403);
  });

  test("allows matching project permission and scope", async (): Promise<void> => {
    prisma.seedActiveSession("user-1", "session-1");
    prisma.userRoles.push({
      role: prisma.roles.get("PROJECT_ADMIN") as RoleRecord,
      scopeId: "project-1",
      scopeType: "PROJECT",
      userId: "user-1"
    });
    app = await createApp(prisma);
    const accessToken = await createAccessToken(app, "user-1", "session-1");

    await request(app.getHttpServer())
      .get("/authorization-test/projects/project-1")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200)
      .expect({
        projectId: "project-1",
        status: "ok"
      });
  });

  test("does not combine permission from one role assignment with scope from another", async (): Promise<void> => {
    prisma.seedActiveSession("user-1", "session-1");
    prisma.userRoles.push(
      {
        role: prisma.roles.get("PROJECT_ADMIN") as RoleRecord,
        scopeId: "project-1",
        scopeType: "PROJECT",
        userId: "user-1"
      },
      {
        role: prisma.roles.get("WORKER") as RoleRecord,
        scopeId: "project-2",
        scopeType: "PROJECT",
        userId: "user-1"
      }
    );
    app = await createApp(prisma);
    const accessToken = await createAccessToken(app, "user-1", "session-1");

    await request(app.getHttpServer())
      .get("/authorization-test/projects/project-2")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(403);
  });
});

describe("a suspended company is read-only (system admin plan phase 3)", (): void => {
  let app: INestApplication | undefined;
  let prisma: AuthorizationPrismaTestDouble;

  const as = async (userId: string) => {
    const token = await createAccessToken(app!, userId, `session-${userId}`);
    return {
      get: (path: string) => request(app!.getHttpServer()).get(path).set("Authorization", `Bearer ${token}`),
      put: (path: string) => request(app!.getHttpServer()).put(path).set("Authorization", `Bearer ${token}`)
    };
  };

  const grant = (userId: string, roleCode: RoleCode, scopeType: ScopeTypeValue, scopeId: string): void => {
    prisma.seedActiveSession(userId, `session-${userId}`);
    prisma.userRoles.push({ role: prisma.roles.get(roleCode) as RoleRecord, scopeId, scopeType, userId });
  };

  beforeEach(async (): Promise<void> => {
    applyTestEnv();
    prisma = new AuthorizationPrismaTestDouble();
    seedDirectRolePermissions(prisma);
    prisma.projects.set("project-1", { companyId: "company-1", id: "project-1" });
    prisma.projects.set("project-2", { companyId: "company-2", id: "project-2" });
    prisma.companies.set("company-1", { id: "company-1", status: "SUSPENDED" });
    prisma.companies.set("company-2", { id: "company-2", status: "ACTIVE" });
    grant("user-company", "COMPANY_ADMIN", "COMPANY", "company-1");
    grant("user-company", "COMPANY_ADMIN", "COMPANY", "company-2");
    grant("user-system", "SYSTEM_ADMIN", "GLOBAL", "GLOBAL");
    grant("user-worker", "WORKER", "PROJECT", "project-1");
    app = await createApp(prisma);
  });

  afterEach(async (): Promise<void> => {
    await app?.close();
    app = undefined;
  });

  test("its administrator can read but not write; another company is unaffected", async (): Promise<void> => {
    const admin = await as("user-company");
    await admin.get("/authorization-test/projects/project-1").expect(200);
    const refused = await admin.put("/authorization-test/projects/project-1").expect(403);
    expect(refused.body).toMatchObject({ companyId: "company-1", message: "COMPANY_SUSPENDED" });
    await admin.put("/authorization-test/projects/project-2").expect(200);
  });

  test("a platform administrator is never held back", async (): Promise<void> => {
    const system = await as("user-system");
    await system.put("/authorization-test/projects/project-1").expect(200, { projectId: "project-1", status: "saved" });
    await system.put("/authorization-test/projects/project-1/punch").expect(200);
  });

  test("someone without the permission still gets PERMISSION_DENIED, not the company state", async (): Promise<void> => {
    const worker = await as("user-worker");
    expect((await worker.put("/authorization-test/projects/project-1").expect(403)).body.message).toBe("PERMISSION_DENIED");
  });

  test("ActiveCompanyGuard holds back service-checked writes, and lets them through after resuming", async (): Promise<void> => {
    const worker = await as("user-worker");
    expect((await worker.put("/authorization-test/projects/project-1/punch").expect(403)).body.message).toBe("COMPANY_SUSPENDED");
    await worker.put("/authorization-test/projects/project-2/punch").expect(200);
    prisma.companies.set("company-1", { id: "company-1", status: "ACTIVE" });
    await worker.put("/authorization-test/projects/project-1/punch").expect(200);
    expect((await worker.put("/authorization-test/projects/missing/punch").expect(404)).body.message).toBe("AUTHORIZATION_PROJECT_NOT_FOUND");
  });
});
