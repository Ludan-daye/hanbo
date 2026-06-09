import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import type { RoleCode } from "@construction/domain";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { AccessTokenGuard } from "../src/auth/access-token.guard.js";
import { AuthModule } from "../src/auth/auth.module.js";
import { AuthorizationModule } from "../src/authorization/authorization.module.js";
import { PermissionsGuard } from "../src/authorization/permissions.guard.js";
import { RequirePermission } from "../src/authorization/require-permission.decorator.js";
import { PrismaService } from "../src/infrastructure/database/prisma.service.js";

type UserStatusValue = "ACTIVE" | "DISABLED";
type ScopeTypeValue = "GLOBAL" | "COMPANY" | "PROJECT" | "TEAM";

type UserRecord = {
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
  await app.init();
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
