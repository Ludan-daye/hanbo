import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import type { RoleCode } from "@construction/domain";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { AuthModule } from "../src/auth/auth.module.js";
import { hashSensitiveToken } from "../src/auth/auth.service.js";
import { AuthorizationModule } from "../src/authorization/authorization.module.js";
import { BindingsModule } from "../src/bindings/bindings.module.js";
import { PrismaService } from "../src/infrastructure/database/prisma.service.js";

type UserStatusValue = "ACTIVE" | "DISABLED";
type ScopeTypeValue = "GLOBAL" | "COMPANY" | "PROJECT" | "TEAM";
type BindingTargetTypeValue = "WORKER" | "MANAGER";
type BindingInvitationStatusValue = "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";
type MemberStatusValue = "ACTIVE" | "EXITED" | "SUSPENDED";

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

type ProjectRecord = {
  readonly companyId: string;
  readonly id: string;
};

type RolePermissionRecord = {
  readonly permission: {
    readonly code: string;
  };
};

type RoleRecord = {
  readonly code: RoleCode;
  readonly id: string;
  readonly permissions: readonly RolePermissionRecord[];
};

type UserRoleRecord = {
  readonly role: RoleRecord;
  readonly scopeId: string;
  readonly scopeType: ScopeTypeValue;
  readonly userId: string;
};

type WorkerProfileRecord = {
  readonly id: string;
  readonly phone: string;
  readonly userId: string | null;
};

type ManagerProfileRecord = {
  readonly id: string;
  readonly phone: string;
  readonly userId: string | null;
};

type ProjectWorkerMemberRecord = {
  readonly id: string;
  readonly projectId: string;
  readonly status: MemberStatusValue;
  readonly worker: WorkerProfileRecord;
  readonly workerId: string;
};

type ProjectManagerMemberRecord = {
  readonly id: string;
  readonly manager: ManagerProfileRecord;
  readonly managerId: string;
  readonly projectId: string;
  readonly status: MemberStatusValue;
};

type BindingInvitationRecord = {
  readonly acceptedByUserId: string | null;
  readonly codeHash: string;
  readonly createdAt: Date;
  readonly createdByUserId: string;
  readonly expiresAt: Date;
  readonly id: string;
  readonly managerProfileId: string | null;
  readonly status: BindingInvitationStatusValue;
  readonly targetType: BindingTargetTypeValue;
  readonly usedAt: Date | null;
  readonly workerProfileId: string | null;
};

type AuditLogRecord = {
  readonly action: string;
  readonly actorUserId: string | null;
  readonly entityId: string;
  readonly entityType: string;
  readonly metadata: unknown;
};

type UserSessionFindUniqueArgs = {
  readonly where: {
    readonly id: string;
  };
};

type UserRoleFindManyArgs = {
  readonly where: {
    readonly userId: string;
  };
};

type ProjectFindUniqueArgs = {
  readonly where: {
    readonly id: string;
  };
};

type ProjectWorkerMemberFindUniqueArgs = {
  readonly include: {
    readonly worker: boolean;
  };
  readonly where: {
    readonly projectId_workerId: {
      readonly projectId: string;
      readonly workerId: string;
    };
  };
};

type ProjectManagerMemberFindUniqueArgs = {
  readonly include: {
    readonly manager: boolean;
  };
  readonly where: {
    readonly projectId_managerId: {
      readonly managerId: string;
      readonly projectId: string;
    };
  };
};

type BindingInvitationCreateArgs = {
  readonly data: Omit<BindingInvitationRecord, "createdAt" | "id" | "status"> & {
    readonly status?: BindingInvitationStatusValue;
  };
};

type AuditLogCreateArgs = {
  readonly data: AuditLogRecord;
};

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

class BindingsPrismaTestDouble {
  readonly users = new Map<string, UserRecord>();
  readonly sessions = new Map<string, SessionRecord>();
  readonly projects = new Map<string, ProjectRecord>();
  readonly roles = new Map<RoleCode, RoleRecord>();
  readonly userRoles: UserRoleRecord[] = [];
  readonly workerMembers = new Map<string, ProjectWorkerMemberRecord>();
  readonly managerMembers = new Map<string, ProjectManagerMemberRecord>();
  readonly bindingInvitations = new Map<string, BindingInvitationRecord>();
  readonly auditLogs: AuditLogRecord[] = [];

  private invitationSequence = 0;

  readonly userSession = {
    findUnique: async (args: UserSessionFindUniqueArgs): Promise<SessionRecord | null> =>
      this.sessions.get(args.where.id) ?? null
  };

  readonly role = {
    findMany: async (): Promise<RoleRecord[]> => Array.from(this.roles.values())
  };

  readonly userRole = {
    findMany: async (args: UserRoleFindManyArgs): Promise<UserRoleRecord[]> =>
      this.userRoles.filter((userRole: UserRoleRecord): boolean => userRole.userId === args.where.userId)
  };

  readonly project = {
    findUnique: async (args: ProjectFindUniqueArgs): Promise<ProjectRecord | null> => this.projects.get(args.where.id) ?? null
  };

  readonly projectWorkerMember = {
    findUnique: async (args: ProjectWorkerMemberFindUniqueArgs): Promise<ProjectWorkerMemberRecord | null> =>
      this.workerMembers.get(`${args.where.projectId_workerId.projectId}:${args.where.projectId_workerId.workerId}`) ?? null
  };

  readonly projectManagerMember = {
    findUnique: async (args: ProjectManagerMemberFindUniqueArgs): Promise<ProjectManagerMemberRecord | null> =>
      this.managerMembers.get(`${args.where.projectId_managerId.projectId}:${args.where.projectId_managerId.managerId}`) ?? null
  };

  readonly bindingInvitation = {
    create: async (args: BindingInvitationCreateArgs): Promise<BindingInvitationRecord> => {
      this.invitationSequence += 1;
      const invitation: BindingInvitationRecord = {
        ...args.data,
        createdAt: new Date("2026-06-04T00:00:00.000Z"),
        id: `binding-invitation-${this.invitationSequence}`,
        status: args.data.status ?? "PENDING"
      };
      this.bindingInvitations.set(invitation.id, invitation);
      return invitation;
    }
  };

  readonly auditLog = {
    create: async (args: AuditLogCreateArgs): Promise<AuditLogRecord> => {
      this.auditLogs.push(args.data);
      return args.data;
    }
  };

  async $transaction<T>(callback: (transaction: BindingsPrismaTestDouble) => Promise<T>): Promise<T> {
    return callback(this);
  }

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

const seedDirectRolePermissions = (prisma: BindingsPrismaTestDouble): void => {
  prisma.seedRole("SYSTEM_ADMIN", ["system.manage"]);
  prisma.seedRole("COMPANY_ADMIN", ["company.manage", "project.create"]);
  prisma.seedRole("PROJECT_ADMIN", [
    "attendance.view",
    "binding.invitation.create",
    "project.manage",
    "team.manage",
    "worker.manage"
  ]);
  prisma.seedRole("TEAM_LEADER", ["attendance.view", "makeup.approve"]);
  prisma.seedRole("WORKER", ["attendance.submit", "makeup.request"]);
};

const createApp = async (prisma: BindingsPrismaTestDouble): Promise<INestApplication> => {
  const moduleRef = await Test.createTestingModule({
    imports: [AuthModule, AuthorizationModule, BindingsModule]
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

describe("BindingsModule", (): void => {
  let app: INestApplication | undefined;
  let prisma: BindingsPrismaTestDouble;

  beforeEach((): void => {
    applyTestEnv();
    prisma = new BindingsPrismaTestDouble();
    seedDirectRolePermissions(prisma);
    prisma.projects.set("project-1", {
      companyId: "company-1",
      id: "project-1"
    });
    prisma.seedActiveSession("project-admin-user", "session-project-admin");
    prisma.seedActiveSession("worker-user", "session-worker");
    prisma.userRoles.push({
      role: prisma.roles.get("PROJECT_ADMIN") as RoleRecord,
      scopeId: "project-1",
      scopeType: "PROJECT",
      userId: "project-admin-user"
    });
    prisma.workerMembers.set("project-1:worker-1", {
      id: "worker-member-1",
      projectId: "project-1",
      status: "ACTIVE",
      worker: {
        id: "worker-1",
        phone: "13800000001",
        userId: null
      },
      workerId: "worker-1"
    });
    prisma.managerMembers.set("project-1:manager-1", {
      id: "manager-member-1",
      manager: {
        id: "manager-1",
        phone: "13800000002",
        userId: null
      },
      managerId: "manager-1",
      projectId: "project-1",
      status: "ACTIVE"
    });
    prisma.workerMembers.set("project-1:worker-bound", {
      id: "worker-member-bound",
      projectId: "project-1",
      status: "ACTIVE",
      worker: {
        id: "worker-bound",
        phone: "13800000003",
        userId: "already-bound-user"
      },
      workerId: "worker-bound"
    });
  });

  afterEach(async (): Promise<void> => {
    if (app !== undefined) {
      await app.close();
      app = undefined;
    }
  });

  test("project admin creates worker invitation without storing plain code", async (): Promise<void> => {
    app = await createApp(prisma);
    const projectAdminAccessToken = await createAccessToken(app, "project-admin-user", "session-project-admin");
    const workerAccessToken = await createAccessToken(app, "worker-user", "session-worker");

    await request(app.getHttpServer())
      .post("/bindings/projects/project-1/invitations")
      .set("Authorization", `Bearer ${workerAccessToken}`)
      .send({
        profileId: "worker-1",
        targetType: "WORKER"
      })
      .expect(403);

    const response = await request(app.getHttpServer())
      .post("/bindings/projects/project-1/invitations")
      .set("Authorization", `Bearer ${projectAdminAccessToken}`)
      .send({
        profileId: "worker-1",
        targetType: "WORKER"
      })
      .expect(201);

    expect(response.body).toMatchObject({
      id: "binding-invitation-1",
      profileId: "worker-1",
      projectId: "project-1",
      targetType: "WORKER"
    });
    expect(response.body.code).toEqual(expect.any(String));
    expect(response.body.code.length).toBeGreaterThanOrEqual(32);
    expect(Date.parse(response.body.expiresAt)).toBeGreaterThan(Date.now());

    const storedInvitation = prisma.bindingInvitations.get("binding-invitation-1");
    expect(storedInvitation).toMatchObject({
      acceptedByUserId: null,
      createdByUserId: "project-admin-user",
      managerProfileId: null,
      status: "PENDING",
      targetType: "WORKER",
      usedAt: null,
      workerProfileId: "worker-1"
    });
    expect(storedInvitation?.codeHash).toBe(hashSensitiveToken(response.body.code as string));
    expect(storedInvitation?.codeHash).not.toBe(response.body.code);
    expect(prisma.auditLogs).toEqual([
      expect.objectContaining({
        action: "binding.invitation.create",
        actorUserId: "project-admin-user",
        entityId: "binding-invitation-1",
        entityType: "binding_invitation"
      })
    ]);
  });

  test("validates manager targets, project membership, and bound profiles", async (): Promise<void> => {
    app = await createApp(prisma);
    const projectAdminAccessToken = await createAccessToken(app, "project-admin-user", "session-project-admin");

    const managerResponse = await request(app.getHttpServer())
      .post("/bindings/projects/project-1/invitations")
      .set("Authorization", `Bearer ${projectAdminAccessToken}`)
      .send({
        profileId: "manager-1",
        targetType: "MANAGER"
      })
      .expect(201);

    expect(managerResponse.body).toMatchObject({
      id: "binding-invitation-1",
      profileId: "manager-1",
      projectId: "project-1",
      targetType: "MANAGER"
    });
    expect(prisma.bindingInvitations.get("binding-invitation-1")).toMatchObject({
      managerProfileId: "manager-1",
      targetType: "MANAGER",
      workerProfileId: null
    });

    await request(app.getHttpServer())
      .post("/bindings/projects/project-1/invitations")
      .set("Authorization", `Bearer ${projectAdminAccessToken}`)
      .send({
        profileId: "worker-missing",
        targetType: "WORKER"
      })
      .expect(404);

    await request(app.getHttpServer())
      .post("/bindings/projects/project-1/invitations")
      .set("Authorization", `Bearer ${projectAdminAccessToken}`)
      .send({
        profileId: "worker-bound",
        targetType: "WORKER"
      })
      .expect(409);
  });
});
