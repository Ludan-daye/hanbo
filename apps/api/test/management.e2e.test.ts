import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import type { RoleCode } from "@construction/domain";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { AuthModule } from "../src/auth/auth.module.js";
import { AuthorizationModule } from "../src/authorization/authorization.module.js";
import { PrismaService } from "../src/infrastructure/database/prisma.service.js";
import { ManagementModule } from "../src/management/management.module.js";

type UserStatusValue = "ACTIVE" | "DISABLED";
type ScopeTypeValue = "GLOBAL" | "COMPANY" | "PROJECT" | "TEAM";
type ProjectStatusValue = "PREPARING" | "ACTIVE" | "SUSPENDED" | "COMPLETED";
type MemberStatusValue = "ACTIVE" | "EXITED" | "SUSPENDED";

type UserRecord = {
  readonly openid: string;
  readonly isBound: boolean;
  readonly encryptedRealName: string;
  readonly phone: string;
  readonly nickname: string;
  readonly avatarObjectKey: string;
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

type CompanyRecord = {
  readonly createdAt: Date;
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly updatedAt: Date;
};

type ProjectRecord = {
  readonly address: string;
  readonly centerLatitude: string;
  readonly centerLongitude: string;
  readonly companyId: string;
  readonly createdAt: Date;
  readonly geofenceRadiusM: number;
  readonly id: string;
  readonly name: string;
  readonly plannedEndDate: Date | null;
  readonly plannedStartDate: Date;
  readonly status: ProjectStatusValue;
  readonly updatedAt: Date;
};

type TeamRecord = {
  readonly createdAt: Date;
  readonly id: string;
  readonly name: string;
  readonly project?: ProjectRecord;
  readonly projectId: string;
  readonly status: string;
  readonly updatedAt: Date;
};

type WorkerProfileRecord = {
  readonly encryptedIdNumber: string;
  readonly encryptedName: string;
  readonly employmentStatus: string;
  readonly faceProfileStatus: string;
  readonly id: string;
  readonly idNumberHash: string;
  readonly phone: string;
  readonly realNameStatus: string;
  readonly workType: string;
};

type ManagerProfileRecord = {
  readonly id: string;
  readonly name: string;
  readonly phone: string;
  readonly status: string;
};

type ProjectWorkerMemberRecord = {
  readonly enteredAt: Date;
  readonly exitedAt: Date | null;
  readonly id: string;
  readonly projectId: string;
  readonly projectRoleLabel: string;
  readonly requiresAttendance: boolean;
  readonly status: MemberStatusValue;
  readonly team: TeamRecord | null;
  readonly teamId: string | null;
  readonly worker: WorkerProfileRecord;
  readonly workerId: string;
};

type ProjectManagerMemberRecord = {
  readonly id: string;
  readonly manager: ManagerProfileRecord;
  readonly managerId: string;
  readonly projectId: string;
  readonly requiresAttendance: boolean;
  readonly roleCode: RoleCode;
  readonly status: MemberStatusValue;
  readonly teamScope: TeamRecord | null;
  readonly teamScopeId: string | null;
};

type BindingInvitationStatusValue = "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";
type BindingTargetTypeValue = "MANAGER" | "WORKER";

type BindingInvitationRecord = {
  readonly id: string;
  readonly targetType: BindingTargetTypeValue;
  readonly workerProfileId: string | null;
  readonly managerProfileId: string | null;
  readonly codeHash: string;
  readonly createdByUserId: string;
  readonly acceptedByUserId: string | null;
  status: BindingInvitationStatusValue;
  readonly expiresAt: Date;
  readonly createdAt: Date;
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
  readonly roleId: string;
  readonly scopeId: string;
  readonly scopeType: ScopeTypeValue;
  readonly userId: string;
};

type UserSessionFindUniqueArgs = {
  readonly where: {
    readonly id: string;
  };
};

type RoleFindUniqueArgs = {
  readonly where: {
    readonly code: RoleCode;
  };
};

type UserRoleFindManyArgs = {
  readonly where: {
    readonly userId: string;
  };
};

type UserRoleCreateArgs = {
  readonly data: {
    readonly roleId: string;
    readonly scopeId: string;
    readonly scopeType: ScopeTypeValue;
    readonly userId: string;
  };
};

type CompanyCreateArgs = {
  readonly data: {
    readonly name: string;
    readonly status: string;
  };
};

type CompanyFindUniqueArgs = {
  readonly where: {
    readonly id: string;
  };
};

type ProjectCreateArgs = {
  readonly data: {
    readonly address: string;
    readonly centerLatitude: string;
    readonly centerLongitude: string;
    readonly companyId: string;
    readonly geofenceRadiusM: number;
    readonly name: string;
    readonly plannedEndDate: Date | null;
    readonly plannedStartDate: Date;
    readonly status: ProjectStatusValue;
  };
};

type ProjectFindUniqueArgs = {
  readonly where: {
    readonly id: string;
  };
};

type ProjectFindManyArgs = {
  readonly orderBy?: {
    readonly createdAt?: "asc" | "desc";
  };
  readonly select?: {
    readonly id?: boolean;
    readonly name?: boolean;
  };
  readonly where: {
    readonly companyId: string;
  };
};

type TeamCreateArgs = {
  readonly data: {
    readonly name: string;
    readonly projectId: string;
    readonly status: string;
  };
};

type TeamFindUniqueArgs = {
  readonly include?: {
    readonly project?: boolean;
  };
  readonly where: {
    readonly id: string;
  };
};

type WorkerProfileCreateArgs = {
  readonly data: {
    readonly encryptedIdNumber: string;
    readonly encryptedName: string;
    readonly employmentStatus: string;
    readonly faceProfileStatus: string;
    readonly idNumberHash: string;
    readonly phone: string;
    readonly realNameStatus: string;
    readonly workType: string;
  };
};

type ManagerProfileCreateArgs = {
  readonly data: {
    readonly name: string;
    readonly phone: string;
    readonly status: string;
  };
};

type ProjectWorkerMemberCreateArgs = {
  readonly data: {
    readonly enteredAt: Date;
    readonly exitedAt: Date | null;
    readonly projectId: string;
    readonly projectRoleLabel: string;
    readonly requiresAttendance: boolean;
    readonly status: MemberStatusValue;
    readonly teamId: string | null;
    readonly workerId: string;
  };
};

type ProjectManagerMemberCreateArgs = {
  readonly data: {
    readonly managerId: string;
    readonly projectId: string;
    readonly requiresAttendance: boolean;
    readonly roleCode: RoleCode;
    readonly status: MemberStatusValue;
    readonly teamScopeId: string | null;
  };
};

type ProjectMemberFindManyArgs = {
  readonly include?: {
    readonly manager?: boolean;
    readonly team?: boolean;
    readonly teamScope?: boolean;
    readonly worker?: boolean;
  };
  readonly orderBy?: {
    readonly createdAt?: "asc" | "desc";
  };
  readonly select?: {
    readonly workerId?: boolean;
    readonly managerId?: boolean;
  };
  readonly where: {
    readonly projectId?: string | { readonly in: readonly string[] };
    readonly teamId?: string;
    readonly teamScopeId?: string;
  };
};

type TeamFindManyArgs = {
  readonly orderBy?: {
    readonly createdAt?: "asc" | "desc";
  };
  readonly where: {
    readonly projectId: string;
  };
};

type BindingInvitationFindManyArgs = {
  readonly orderBy?: {
    readonly createdAt?: "asc" | "desc";
  };
  readonly where: {
    readonly OR?: ReadonlyArray<{
      readonly workerProfileId?: { readonly in: readonly string[] };
      readonly managerProfileId?: { readonly in: readonly string[] };
    }>;
  };
};

type BindingInvitationFindUniqueArgs = {
  readonly where: {
    readonly id: string;
  };
};

type BindingInvitationUpdateArgs = {
  readonly data: {
    readonly status: BindingInvitationStatusValue;
  };
  readonly where: {
    readonly id: string;
  };
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

class ManagementPrismaTestDouble {
  readonly users = new Map<string, UserRecord>();
  readonly sessions = new Map<string, SessionRecord>();
  readonly companies = new Map<string, CompanyRecord>();
  readonly projects = new Map<string, ProjectRecord>();
  readonly teams = new Map<string, TeamRecord>();
  readonly workerProfiles = new Map<string, WorkerProfileRecord>();
  readonly managerProfiles = new Map<string, ManagerProfileRecord>();
  readonly workerMembers = new Map<string, ProjectWorkerMemberRecord>();
  readonly managerMembers = new Map<string, ProjectManagerMemberRecord>();
  readonly roles = new Map<RoleCode, RoleRecord>();
  readonly userRoles: UserRoleRecord[] = [];
  readonly bindingInvitations = new Map<string, BindingInvitationRecord>();

  private companySequence = 0;
  private projectSequence = 0;
  private teamSequence = 0;
  private workerSequence = 0;
  private managerSequence = 0;
  private workerMemberSequence = 0;
  private managerMemberSequence = 0;

  readonly userSession = {
    findUnique: async (args: UserSessionFindUniqueArgs): Promise<SessionRecord | null> =>
      this.sessions.get(args.where.id) ?? null
  };

  readonly role = {
    findMany: async (): Promise<RoleRecord[]> => Array.from(this.roles.values()),
    findUnique: async (args: RoleFindUniqueArgs): Promise<RoleRecord | null> => this.roles.get(args.where.code) ?? null
  };

  readonly userRole = {
    create: async (args: UserRoleCreateArgs): Promise<UserRoleRecord> => {
      const role = Array.from(this.roles.values()).find((roleRecord: RoleRecord): boolean => roleRecord.id === args.data.roleId);

      if (role === undefined) {
        throw new Error(
          JSON.stringify({
            message: "Role not found in test double",
            roleId: args.data.roleId
          })
        );
      }

      const userRole: UserRoleRecord = {
        role,
        roleId: args.data.roleId,
        scopeId: args.data.scopeId,
        scopeType: args.data.scopeType,
        userId: args.data.userId
      };
      this.userRoles.push(userRole);
      return userRole;
    },
    findMany: async (args: UserRoleFindManyArgs): Promise<UserRoleRecord[]> =>
      this.userRoles.filter((userRole: UserRoleRecord): boolean => userRole.userId === args.where.userId)
  };

  readonly company = {
    create: async (args: CompanyCreateArgs): Promise<CompanyRecord> => {
      this.companySequence += 1;
      const now = new Date("2026-06-03T00:00:00.000Z");
      const company: CompanyRecord = {
        createdAt: now,
        id: `company-created-${this.companySequence}`,
        name: args.data.name,
        status: args.data.status,
        updatedAt: now
      };
      this.companies.set(company.id, company);
      return company;
    },
    findUnique: async (args: CompanyFindUniqueArgs): Promise<CompanyRecord | null> =>
      this.companies.get(args.where.id) ?? null
  };

  readonly project = {
    create: async (args: ProjectCreateArgs): Promise<ProjectRecord> => {
      this.projectSequence += 1;
      const now = new Date("2026-06-03T00:00:00.000Z");
      const project: ProjectRecord = {
        address: args.data.address,
        centerLatitude: args.data.centerLatitude,
        centerLongitude: args.data.centerLongitude,
        companyId: args.data.companyId,
        createdAt: now,
        geofenceRadiusM: args.data.geofenceRadiusM,
        id: `project-${this.projectSequence}`,
        name: args.data.name,
        plannedEndDate: args.data.plannedEndDate,
        plannedStartDate: args.data.plannedStartDate,
        status: args.data.status,
        updatedAt: now
      };
      this.projects.set(project.id, project);
      return project;
    },
    findMany: async (args: ProjectFindManyArgs): Promise<ProjectRecord[]> =>
      Array.from(this.projects.values())
        .filter((project: ProjectRecord): boolean => project.companyId === args.where.companyId)
        .sort((a: ProjectRecord, b: ProjectRecord): number => a.createdAt.getTime() - b.createdAt.getTime()),
    findUnique: async (args: ProjectFindUniqueArgs): Promise<ProjectRecord | null> => this.projects.get(args.where.id) ?? null
  };

  readonly team = {
    create: async (args: TeamCreateArgs): Promise<TeamRecord> => {
      this.teamSequence += 1;
      const now = new Date("2026-06-03T00:00:00.000Z");
      const team: TeamRecord = {
        createdAt: now,
        id: `team-${this.teamSequence}`,
        name: args.data.name,
        projectId: args.data.projectId,
        status: args.data.status,
        updatedAt: now
      };
      this.teams.set(team.id, team);
      return team;
    },
    findMany: async (args: TeamFindManyArgs): Promise<TeamRecord[]> => {
      const results = Array.from(this.teams.values()).filter(
        (team: TeamRecord): boolean => team.projectId === args.where.projectId
      );
      if (args.orderBy?.createdAt === "asc") {
        results.sort((a: TeamRecord, b: TeamRecord): number => a.createdAt.getTime() - b.createdAt.getTime());
      } else if (args.orderBy?.createdAt === "desc") {
        results.sort((a: TeamRecord, b: TeamRecord): number => b.createdAt.getTime() - a.createdAt.getTime());
      }
      return results;
    },
    findUnique: async (args: TeamFindUniqueArgs): Promise<TeamRecord | null> => {
      const team = this.teams.get(args.where.id);

      if (team === undefined) {
        return null;
      }

      if (args.include?.project === true) {
        const project = this.projects.get(team.projectId);

        if (project === undefined) {
          throw new Error(
            JSON.stringify({
              message: "Team project not found in test double",
              projectId: team.projectId,
              teamId: team.id
            })
          );
        }

        return {
          ...team,
          project
        };
      }

      return team;
    }
  };

  readonly workerProfile = {
    create: async (args: WorkerProfileCreateArgs): Promise<WorkerProfileRecord> => {
      this.workerSequence += 1;
      const worker: WorkerProfileRecord = {
        encryptedIdNumber: args.data.encryptedIdNumber,
        encryptedName: args.data.encryptedName,
        employmentStatus: args.data.employmentStatus,
        faceProfileStatus: args.data.faceProfileStatus,
        id: `worker-${this.workerSequence}`,
        idNumberHash: args.data.idNumberHash,
        phone: args.data.phone,
        realNameStatus: args.data.realNameStatus,
        workType: args.data.workType
      };
      this.workerProfiles.set(worker.id, worker);
      return worker;
    }
  };

  readonly managerProfile = {
    create: async (args: ManagerProfileCreateArgs): Promise<ManagerProfileRecord> => {
      this.managerSequence += 1;
      const manager: ManagerProfileRecord = {
        id: `manager-${this.managerSequence}`,
        name: args.data.name,
        phone: args.data.phone,
        status: args.data.status
      };
      this.managerProfiles.set(manager.id, manager);
      return manager;
    }
  };

  readonly projectWorkerMember = {
    create: async (args: ProjectWorkerMemberCreateArgs): Promise<ProjectWorkerMemberRecord> => {
      this.workerMemberSequence += 1;
      const worker = this.workerProfiles.get(args.data.workerId);

      if (worker === undefined) {
        throw new Error(
          JSON.stringify({
            message: "Worker profile not found in test double",
            workerId: args.data.workerId
          })
        );
      }

      const member: ProjectWorkerMemberRecord = {
        enteredAt: args.data.enteredAt,
        exitedAt: args.data.exitedAt,
        id: `worker-member-${this.workerMemberSequence}`,
        projectId: args.data.projectId,
        projectRoleLabel: args.data.projectRoleLabel,
        requiresAttendance: args.data.requiresAttendance,
        status: args.data.status,
        team: args.data.teamId === null ? null : this.teams.get(args.data.teamId) ?? null,
        teamId: args.data.teamId,
        worker,
        workerId: args.data.workerId
      };
      this.workerMembers.set(member.id, member);
      return member;
    },
    findMany: async (args: ProjectMemberFindManyArgs): Promise<ProjectWorkerMemberRecord[] | Array<{ workerId: string }>> => {
      const filtered = Array.from(this.workerMembers.values()).filter(
        (member: ProjectWorkerMemberRecord): boolean => {
          const projectIdFilter = args.where.projectId;
          const projectMatch =
            projectIdFilter === undefined
              ? true
              : typeof projectIdFilter === "string"
                ? member.projectId === projectIdFilter
                : projectIdFilter.in.includes(member.projectId);
          return projectMatch && (args.where.teamId === undefined || member.teamId === args.where.teamId);
        }
      ).sort((a: ProjectWorkerMemberRecord, b: ProjectWorkerMemberRecord): number => a.enteredAt.getTime() - b.enteredAt.getTime());
      if (args.select?.workerId === true) {
        return filtered.map((m): { workerId: string } => ({ workerId: m.workerId }));
      }
      return filtered;
    }
  };

  readonly projectManagerMember = {
    create: async (args: ProjectManagerMemberCreateArgs): Promise<ProjectManagerMemberRecord> => {
      this.managerMemberSequence += 1;
      const manager = this.managerProfiles.get(args.data.managerId);

      if (manager === undefined) {
        throw new Error(
          JSON.stringify({
            message: "Manager profile not found in test double",
            managerId: args.data.managerId
          })
        );
      }

      const member: ProjectManagerMemberRecord = {
        id: `manager-member-${this.managerMemberSequence}`,
        manager,
        managerId: args.data.managerId,
        projectId: args.data.projectId,
        requiresAttendance: args.data.requiresAttendance,
        roleCode: args.data.roleCode,
        status: args.data.status,
        teamScope: args.data.teamScopeId === null ? null : this.teams.get(args.data.teamScopeId) ?? null,
        teamScopeId: args.data.teamScopeId
      };
      this.managerMembers.set(member.id, member);
      return member;
    },
    findMany: async (args: ProjectMemberFindManyArgs): Promise<ProjectManagerMemberRecord[] | Array<{ managerId: string }>> => {
      const filtered = Array.from(this.managerMembers.values()).filter(
        (member: ProjectManagerMemberRecord): boolean => {
          const projectIdFilter = args.where.projectId;
          const projectMatch =
            projectIdFilter === undefined
              ? true
              : typeof projectIdFilter === "string"
                ? member.projectId === projectIdFilter
                : projectIdFilter.in.includes(member.projectId);
          return projectMatch && (args.where.teamScopeId === undefined || member.teamScopeId === args.where.teamScopeId);
        }
      ).sort((a: ProjectManagerMemberRecord, b: ProjectManagerMemberRecord): number => {
        // manager members don't have enteredAt — use stable insertion-order fallback via id
        return a.id.localeCompare(b.id);
      });
      if (args.select?.managerId === true) {
        return filtered.map((m): { managerId: string } => ({ managerId: m.managerId }));
      }
      return filtered;
    }
  };

  readonly bindingInvitation = {
    findMany: async (args: BindingInvitationFindManyArgs): Promise<BindingInvitationRecord[]> => {
      const orFilters = args.where.OR ?? [];
      const filtered = Array.from(this.bindingInvitations.values()).filter(
        (inv: BindingInvitationRecord): boolean => {
          if (orFilters.length === 0) {
            return true;
          }
          return orFilters.some((orClause): boolean => {
            const workerMatch =
              orClause.workerProfileId !== undefined && inv.workerProfileId !== null
                ? orClause.workerProfileId.in.includes(inv.workerProfileId)
                : false;
            const managerMatch =
              orClause.managerProfileId !== undefined && inv.managerProfileId !== null
                ? orClause.managerProfileId.in.includes(inv.managerProfileId)
                : false;
            return workerMatch || managerMatch;
          });
        }
      );
      if (args.orderBy?.createdAt === "desc") {
        filtered.sort((a: BindingInvitationRecord, b: BindingInvitationRecord): number => b.createdAt.getTime() - a.createdAt.getTime());
      } else if (args.orderBy?.createdAt === "asc") {
        filtered.sort((a: BindingInvitationRecord, b: BindingInvitationRecord): number => a.createdAt.getTime() - b.createdAt.getTime());
      }
      return filtered;
    },
    findUnique: async (args: BindingInvitationFindUniqueArgs): Promise<BindingInvitationRecord | null> =>
      this.bindingInvitations.get(args.where.id) ?? null,
    update: async (args: BindingInvitationUpdateArgs): Promise<BindingInvitationRecord> => {
      const inv = this.bindingInvitations.get(args.where.id);
      if (inv === undefined) {
        throw new Error(JSON.stringify({ message: "BindingInvitation not found in test double", id: args.where.id }));
      }
      const updated: BindingInvitationRecord = { ...inv, status: args.data.status };
      this.bindingInvitations.set(updated.id, updated);
      return updated;
    }
  };

  async $transaction<T>(callback: (transaction: ManagementPrismaTestDouble) => Promise<T>): Promise<T> {
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

const seedDirectRolePermissions = (prisma: ManagementPrismaTestDouble): void => {
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

const createApp = async (prisma: ManagementPrismaTestDouble): Promise<INestApplication> => {
  const moduleRef = await Test.createTestingModule({
    imports: [AuthModule, AuthorizationModule, ManagementModule]
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

describe("ManagementModule", (): void => {
  let app: INestApplication | undefined;
  let prisma: ManagementPrismaTestDouble;

  beforeEach((): void => {
    applyTestEnv();
    prisma = new ManagementPrismaTestDouble();
    seedDirectRolePermissions(prisma);
    prisma.seedActiveSession("user-1", "session-1");
    const now = new Date("2026-06-03T00:00:00.000Z");
    prisma.companies.set("company-1", {
      createdAt: now,
      id: "company-1",
      name: "Existing Company",
      status: "ACTIVE",
      updatedAt: now
    });
    prisma.userRoles.push({
      role: prisma.roles.get("COMPANY_ADMIN") as RoleRecord,
      roleId: "role-COMPANY_ADMIN",
      scopeId: "company-1",
      scopeType: "COMPANY",
      userId: "user-1"
    });
  });

  afterEach(async (): Promise<void> => {
    if (app !== undefined) {
      await app.close();
      app = undefined;
    }
  });

  test("creates a project and team and retires obsolete personnel creation routes", async (): Promise<void> => {
    app = await createApp(prisma);
    const accessToken = await createAccessToken(app, "user-1", "session-1");

    const projectResponse = await request(app.getHttpServer())
      .post("/management/companies/company-1/projects")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        address: "No. 1 Site Road",
        centerLatitude: "31.2304000",
        centerLongitude: "121.4737000",
        geofenceRadiusM: 300,
        name: "North Gate Site",
        plannedEndDate: "2026-12-31",
        plannedStartDate: "2026-06-03",
        status: "ACTIVE"
      })
      .expect(201);

    expect(projectResponse.body).toMatchObject({
      address: "No. 1 Site Road",
      centerLatitude: "31.2304000",
      centerLongitude: "121.4737000",
      companyId: "company-1",
      geofenceRadiusM: 300,
      id: "project-1",
      name: "North Gate Site",
      plannedEndDate: "2026-12-31",
      plannedStartDate: "2026-06-03",
      status: "ACTIVE"
    });
    expect(prisma.userRoles).toContainEqual(
      expect.objectContaining({
        roleId: "role-PROJECT_ADMIN",
        scopeId: "project-1",
        scopeType: "PROJECT",
        userId: "user-1"
      })
    );

    const teamResponse = await request(app.getHttpServer())
      .post("/management/projects/project-1/teams")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Steel Team",
        status: "ACTIVE"
      })
      .expect(201);

    expect(teamResponse.body).toMatchObject({
      id: "team-1",
      name: "Steel Team",
      projectId: "project-1",
      status: "ACTIVE"
    });

    for (const route of ["workers", "managers"]) await request(app.getHttpServer()).post(`/management/projects/project-1/${route}`)
      .set("Authorization", `Bearer ${accessToken}`).send({}).expect(410);
  });

  test("GET /management/teams/:teamId/participants returns only team participants", async (): Promise<void> => {
    const now = new Date("2026-06-03T00:00:00.000Z");

    // Seed project-1
    prisma.projects.set("project-1", {
      address: "No. 1 Site Road",
      centerLatitude: "31.2304000",
      centerLongitude: "121.4737000",
      companyId: "company-1",
      createdAt: now,
      geofenceRadiusM: 300,
      id: "project-1",
      name: "North Gate Site",
      plannedEndDate: null,
      plannedStartDate: new Date("2026-06-03T00:00:00.000Z"),
      status: "ACTIVE",
      updatedAt: now
    });

    // Seed team-1 and team-2
    prisma.teams.set("team-1", {
      createdAt: now,
      id: "team-1",
      name: "Team One",
      projectId: "project-1",
      status: "ACTIVE",
      updatedAt: now
    });
    prisma.teams.set("team-2", {
      createdAt: now,
      id: "team-2",
      name: "Team Two",
      projectId: "project-1",
      status: "ACTIVE",
      updatedAt: now
    });

    // Seed worker-1 (team-1) and worker-2 (team-2)
    prisma.workerProfiles.set("worker-1", {
      employmentStatus: "ACTIVE",
      encryptedIdNumber: "enc-id-1",
      encryptedName: "enc-name-1",
      faceProfileStatus: "PENDING",
      id: "worker-1",
      idNumberHash: "hash-1",
      phone: "13800000001",
      realNameStatus: "VERIFIED",
      workType: "Steel"
    });
    prisma.workerProfiles.set("worker-2", {
      employmentStatus: "ACTIVE",
      encryptedIdNumber: "enc-id-2",
      encryptedName: "enc-name-2",
      faceProfileStatus: "PENDING",
      id: "worker-2",
      idNumberHash: "hash-2",
      phone: "13800000002",
      realNameStatus: "VERIFIED",
      workType: "Concrete"
    });

    prisma.workerMembers.set("worker-member-1", {
      enteredAt: now,
      exitedAt: null,
      id: "worker-member-1",
      projectId: "project-1",
      projectRoleLabel: "Welder",
      requiresAttendance: true,
      status: "ACTIVE",
      team: prisma.teams.get("team-1") ?? null,
      teamId: "team-1",
      worker: prisma.workerProfiles.get("worker-1") as WorkerProfileRecord,
      workerId: "worker-1"
    });
    prisma.workerMembers.set("worker-member-2", {
      enteredAt: now,
      exitedAt: null,
      id: "worker-member-2",
      projectId: "project-1",
      projectRoleLabel: "Mason",
      requiresAttendance: true,
      status: "ACTIVE",
      team: prisma.teams.get("team-2") ?? null,
      teamId: "team-2",
      worker: prisma.workerProfiles.get("worker-2") as WorkerProfileRecord,
      workerId: "worker-2"
    });

    // Seed manager-1 with teamScopeId=team-1
    prisma.managerProfiles.set("manager-1", {
      id: "manager-1",
      name: "Team Lead Zhang",
      phone: "13800000003",
      status: "ACTIVE"
    });
    prisma.managerMembers.set("manager-member-1", {
      id: "manager-member-1",
      manager: prisma.managerProfiles.get("manager-1") as ManagerProfileRecord,
      managerId: "manager-1",
      projectId: "project-1",
      requiresAttendance: true,
      roleCode: "TEAM_LEADER",
      status: "ACTIVE",
      teamScope: prisma.teams.get("team-1") ?? null,
      teamScopeId: "team-1"
    });

    // User has TEAM_LEADER role scoped to TEAM:team-1 (attendance.view)
    prisma.userRoles.push({
      role: prisma.roles.get("TEAM_LEADER") as RoleRecord,
      roleId: "role-TEAM_LEADER",
      scopeId: "team-1",
      scopeType: "TEAM",
      userId: "user-1"
    });

    app = await createApp(prisma);
    const accessToken = await createAccessToken(app, "user-1", "session-1");

    const response = await request(app.getHttpServer())
      .get("/management/teams/team-1/participants")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body).toHaveLength(2);

    const workerRow = (response.body as readonly Record<string, unknown>[]).find(
      (row): boolean => row["participantType"] === "WORKER"
    );
    const managerRow = (response.body as readonly Record<string, unknown>[]).find(
      (row): boolean => row["participantType"] === "MANAGER"
    );

    expect(workerRow).toMatchObject({
      participantType: "WORKER",
      teamId: "team-1",
      teamName: "Team One"
    });
    expect(managerRow).toMatchObject({
      participantType: "MANAGER",
      teamId: "team-1",
      teamName: "Team One"
    });

    // worker-2 (team-2) must not appear
    const team2Rows = (response.body as readonly Record<string, unknown>[]).filter(
      (row): boolean => row["teamId"] === "team-2"
    );
    expect(team2Rows).toHaveLength(0);
  });

  test("GET /management/teams/:teamId/participants returns 403 without attendance.view at team scope", async (): Promise<void> => {
    const now = new Date("2026-06-03T00:00:00.000Z");

    prisma.projects.set("project-1", {
      address: "No. 1 Site Road",
      centerLatitude: "31.2304000",
      centerLongitude: "121.4737000",
      companyId: "company-1",
      createdAt: now,
      geofenceRadiusM: 300,
      id: "project-1",
      name: "North Gate Site",
      plannedEndDate: null,
      plannedStartDate: new Date("2026-06-03T00:00:00.000Z"),
      status: "ACTIVE",
      updatedAt: now
    });
    prisma.teams.set("team-1", {
      createdAt: now,
      id: "team-1",
      name: "Team One",
      projectId: "project-1",
      status: "ACTIVE",
      updatedAt: now
    });
    prisma.teams.set("team-2", {
      createdAt: now,
      id: "team-2",
      name: "Team Two",
      projectId: "project-1",
      status: "ACTIVE",
      updatedAt: now
    });

    // Seed a separate user (user-2) who has TEAM_LEADER only at team-2 — no company-level role.
    // user-1 (from beforeEach) has COMPANY_ADMIN@COMPANY(company-1) which would grant attendance.view
    // company-wide, so we use user-2 to exercise the scope-mismatch 403 path.
    prisma.seedActiveSession("user-2", "session-2");
    prisma.userRoles.push({
      role: prisma.roles.get("TEAM_LEADER") as RoleRecord,
      roleId: "role-TEAM_LEADER",
      scopeId: "team-2",
      scopeType: "TEAM",
      userId: "user-2"
    });

    app = await createApp(prisma);
    const accessToken = await createAccessToken(app, "user-2", "session-2");

    await request(app.getHttpServer())
      .get("/management/teams/team-1/participants")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(403);
  });

  test("GET /management/companies/:companyId/projects returns projects of that company only", async (): Promise<void> => {
    const now = new Date("2026-06-03T00:00:00.000Z");

    // Seed company-1 (already seeded in beforeEach) and company-2
    prisma.companies.set("company-2", {
      createdAt: now,
      id: "company-2",
      name: "Other Company",
      status: "ACTIVE",
      updatedAt: now
    });

    // Seed project-A and project-B under company-1
    prisma.projects.set("project-A", {
      address: "Site A Road",
      centerLatitude: "31.2304000",
      centerLongitude: "121.4737000",
      companyId: "company-1",
      createdAt: now,
      geofenceRadiusM: 200,
      id: "project-A",
      name: "Project Alpha",
      plannedEndDate: null,
      plannedStartDate: new Date("2026-06-03T00:00:00.000Z"),
      status: "ACTIVE",
      updatedAt: now
    });
    prisma.projects.set("project-B", {
      address: "Site B Road",
      centerLatitude: "31.2400000",
      centerLongitude: "121.4800000",
      companyId: "company-1",
      createdAt: now,
      geofenceRadiusM: 300,
      id: "project-B",
      name: "Project Beta",
      plannedEndDate: new Date("2026-12-31T00:00:00.000Z"),
      plannedStartDate: new Date("2026-06-03T00:00:00.000Z"),
      status: "PREPARING",
      updatedAt: now
    });

    // Seed project-C under company-2
    prisma.projects.set("project-C", {
      address: "Site C Road",
      centerLatitude: "30.0000000",
      centerLongitude: "120.0000000",
      companyId: "company-2",
      createdAt: now,
      geofenceRadiusM: 150,
      id: "project-C",
      name: "Project Gamma",
      plannedEndDate: null,
      plannedStartDate: new Date("2026-06-03T00:00:00.000Z"),
      status: "ACTIVE",
      updatedAt: now
    });

    // user-1 already has COMPANY_ADMIN@COMPANY(company-1) from beforeEach.
    // COMPANY_ADMIN inherits attendance.view via PROJECT_ADMIN in the role hierarchy.

    app = await createApp(prisma);
    const accessToken = await createAccessToken(app, "user-1", "session-1");

    const response = await request(app.getHttpServer())
      .get("/management/companies/company-1/projects")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    const body = response.body as readonly Record<string, unknown>[];
    expect(body).toHaveLength(2);

    const ids = body.map((row): unknown => row["id"]);
    expect(ids).toContain("project-A");
    expect(ids).toContain("project-B");
    expect(ids).not.toContain("project-C");

    for (const row of body) {
      expect(row).toMatchObject({
        address: expect.any(String),
        centerLatitude: expect.any(String),
        centerLongitude: expect.any(String),
        companyId: "company-1",
        geofenceRadiusM: expect.any(Number),
        id: expect.any(String),
        name: expect.any(String),
        plannedStartDate: expect.any(String),
        status: expect.any(String)
      });
      expect("plannedEndDate" in row).toBe(true);
    }
  });

  test("GET /management/companies/:companyId/projects returns 403 without attendance.view at the company scope", async (): Promise<void> => {
    const now = new Date("2026-06-03T00:00:00.000Z");

    // Seed company-2 and project-C (belonging to company-2)
    prisma.companies.set("company-2", {
      createdAt: now,
      id: "company-2",
      name: "Other Company",
      status: "ACTIVE",
      updatedAt: now
    });
    prisma.projects.set("project-C", {
      address: "Site C Road",
      centerLatitude: "30.0000000",
      centerLongitude: "120.0000000",
      companyId: "company-2",
      createdAt: now,
      geofenceRadiusM: 150,
      id: "project-C",
      name: "Project Gamma",
      plannedEndDate: null,
      plannedStartDate: new Date("2026-06-03T00:00:00.000Z"),
      status: "ACTIVE",
      updatedAt: now
    });

    // Seed user-2 who has WORKER@PROJECT(project-C) — no role at company-1.
    prisma.seedActiveSession("user-2", "session-2");
    prisma.userRoles.push({
      role: prisma.roles.get("WORKER") as RoleRecord,
      roleId: "role-WORKER",
      scopeId: "project-C",
      scopeType: "PROJECT",
      userId: "user-2"
    });

    app = await createApp(prisma);
    const accessToken = await createAccessToken(app, "user-2", "session-2");

    await request(app.getHttpServer())
      .get("/management/companies/company-1/projects")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(403);
  });

  test("GET /management/companies/:companyId/participants returns all participants across the company's projects", async (): Promise<void> => {
    const now = new Date("2026-06-03T00:00:00.000Z");

    // Seed company-2
    prisma.companies.set("company-2", {
      createdAt: now,
      id: "company-2",
      name: "Other Company",
      status: "ACTIVE",
      updatedAt: now
    });

    // Seed project-A and project-B under company-1; project-C under company-2
    prisma.projects.set("project-A", {
      address: "Site A Road",
      centerLatitude: "31.2304000",
      centerLongitude: "121.4737000",
      companyId: "company-1",
      createdAt: now,
      geofenceRadiusM: 200,
      id: "project-A",
      name: "Project Alpha",
      plannedEndDate: null,
      plannedStartDate: new Date("2026-06-03T00:00:00.000Z"),
      status: "ACTIVE",
      updatedAt: now
    });
    prisma.projects.set("project-B", {
      address: "Site B Road",
      centerLatitude: "31.2400000",
      centerLongitude: "121.4800000",
      companyId: "company-1",
      createdAt: now,
      geofenceRadiusM: 300,
      id: "project-B",
      name: "Project Beta",
      plannedEndDate: null,
      plannedStartDate: new Date("2026-06-03T00:00:00.000Z"),
      status: "ACTIVE",
      updatedAt: now
    });
    prisma.projects.set("project-C", {
      address: "Site C Road",
      centerLatitude: "30.0000000",
      centerLongitude: "120.0000000",
      companyId: "company-2",
      createdAt: now,
      geofenceRadiusM: 150,
      id: "project-C",
      name: "Project Gamma",
      plannedEndDate: null,
      plannedStartDate: new Date("2026-06-03T00:00:00.000Z"),
      status: "ACTIVE",
      updatedAt: now
    });

    // Seed teams
    prisma.teams.set("team-A1", {
      createdAt: now,
      id: "team-A1",
      name: "Team A One",
      projectId: "project-A",
      status: "ACTIVE",
      updatedAt: now
    });
    prisma.teams.set("team-B1", {
      createdAt: now,
      id: "team-B1",
      name: "Team B One",
      projectId: "project-B",
      status: "ACTIVE",
      updatedAt: now
    });
    prisma.teams.set("team-C1", {
      createdAt: now,
      id: "team-C1",
      name: "Team C One",
      projectId: "project-C",
      status: "ACTIVE",
      updatedAt: now
    });

    // Seed worker profiles
    prisma.workerProfiles.set("worker-A1-profile", {
      employmentStatus: "ACTIVE",
      encryptedIdNumber: "enc-id-A1",
      encryptedName: "enc-name-A1",
      faceProfileStatus: "PENDING",
      id: "worker-A1-profile",
      idNumberHash: "hash-A1",
      phone: "13800000011",
      realNameStatus: "VERIFIED",
      workType: "Steel"
    });
    prisma.workerProfiles.set("worker-B1-profile", {
      employmentStatus: "ACTIVE",
      encryptedIdNumber: "enc-id-B1",
      encryptedName: "enc-name-B1",
      faceProfileStatus: "PENDING",
      id: "worker-B1-profile",
      idNumberHash: "hash-B1",
      phone: "13800000012",
      realNameStatus: "VERIFIED",
      workType: "Concrete"
    });
    prisma.workerProfiles.set("worker-C1-profile", {
      employmentStatus: "ACTIVE",
      encryptedIdNumber: "enc-id-C1",
      encryptedName: "enc-name-C1",
      faceProfileStatus: "PENDING",
      id: "worker-C1-profile",
      idNumberHash: "hash-C1",
      phone: "13800000013",
      realNameStatus: "VERIFIED",
      workType: "Mason"
    });

    // Seed manager profile
    prisma.managerProfiles.set("manager-A1-profile", {
      id: "manager-A1-profile",
      name: "Manager A One",
      phone: "13800000014",
      status: "ACTIVE"
    });

    // Seed worker members
    prisma.workerMembers.set("worker-member-A1", {
      enteredAt: now,
      exitedAt: null,
      id: "worker-member-A1",
      projectId: "project-A",
      projectRoleLabel: "Welder",
      requiresAttendance: true,
      status: "ACTIVE",
      team: prisma.teams.get("team-A1") ?? null,
      teamId: "team-A1",
      worker: prisma.workerProfiles.get("worker-A1-profile") as WorkerProfileRecord,
      workerId: "worker-A1-profile"
    });
    prisma.workerMembers.set("worker-member-B1", {
      enteredAt: now,
      exitedAt: null,
      id: "worker-member-B1",
      projectId: "project-B",
      projectRoleLabel: "Mason",
      requiresAttendance: true,
      status: "ACTIVE",
      team: prisma.teams.get("team-B1") ?? null,
      teamId: "team-B1",
      worker: prisma.workerProfiles.get("worker-B1-profile") as WorkerProfileRecord,
      workerId: "worker-B1-profile"
    });
    prisma.workerMembers.set("worker-member-C1", {
      enteredAt: now,
      exitedAt: null,
      id: "worker-member-C1",
      projectId: "project-C",
      projectRoleLabel: "Electrician",
      requiresAttendance: true,
      status: "ACTIVE",
      team: prisma.teams.get("team-C1") ?? null,
      teamId: "team-C1",
      worker: prisma.workerProfiles.get("worker-C1-profile") as WorkerProfileRecord,
      workerId: "worker-C1-profile"
    });

    // Seed manager member in project-A
    prisma.managerMembers.set("manager-member-A1", {
      id: "manager-member-A1",
      manager: prisma.managerProfiles.get("manager-A1-profile") as ManagerProfileRecord,
      managerId: "manager-A1-profile",
      projectId: "project-A",
      requiresAttendance: true,
      roleCode: "PROJECT_ADMIN",
      status: "ACTIVE",
      teamScope: null,
      teamScopeId: null
    });

    // user-1 already has COMPANY_ADMIN@COMPANY(company-1) from beforeEach.
    // COMPANY_ADMIN needs attendance.view — add it to COMPANY_ADMIN role
    prisma.seedRole("COMPANY_ADMIN", ["attendance.view", "company.manage", "project.create"]);

    app = await createApp(prisma);
    const accessToken = await createAccessToken(app, "user-1", "session-1");

    const response = await request(app.getHttpServer())
      .get("/management/companies/company-1/participants")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    const body = response.body as readonly Record<string, unknown>[];
    expect(body).toHaveLength(3);

    const memberIds = body.map((row): unknown => row["memberId"]);
    expect(memberIds).toContain("worker-member-A1");
    expect(memberIds).toContain("worker-member-B1");
    expect(memberIds).toContain("manager-member-A1");
    expect(memberIds).not.toContain("worker-member-C1");

    for (const row of body) {
      expect(typeof row["projectName"]).toBe("string");
      expect((row["projectName"] as string).length).toBeGreaterThan(0);
    }

    const workerA1Row = body.find((row): boolean => row["memberId"] === "worker-member-A1");
    const workerB1Row = body.find((row): boolean => row["memberId"] === "worker-member-B1");
    const managerA1Row = body.find((row): boolean => row["memberId"] === "manager-member-A1");

    expect(workerA1Row).toMatchObject({ projectName: "Project Alpha" });
    expect(workerB1Row).toMatchObject({ projectName: "Project Beta" });
    expect(managerA1Row).toMatchObject({ projectName: "Project Alpha" });
  });

  test("GET /management/companies/:companyId/participants returns 403 without permission at the company scope", async (): Promise<void> => {
    const now = new Date("2026-06-03T00:00:00.000Z");

    prisma.companies.set("company-2", {
      createdAt: now,
      id: "company-2",
      name: "Other Company",
      status: "ACTIVE",
      updatedAt: now
    });
    prisma.projects.set("project-C", {
      address: "Site C Road",
      centerLatitude: "30.0000000",
      centerLongitude: "120.0000000",
      companyId: "company-2",
      createdAt: now,
      geofenceRadiusM: 150,
      id: "project-C",
      name: "Project Gamma",
      plannedEndDate: null,
      plannedStartDate: new Date("2026-06-03T00:00:00.000Z"),
      status: "ACTIVE",
      updatedAt: now
    });

    // user-2 has WORKER@PROJECT(project-C) — no role at company-1
    prisma.seedActiveSession("user-2", "session-2");
    prisma.userRoles.push({
      role: prisma.roles.get("WORKER") as RoleRecord,
      roleId: "role-WORKER",
      scopeId: "project-C",
      scopeType: "PROJECT",
      userId: "user-2"
    });

    app = await createApp(prisma);
    const accessToken = await createAccessToken(app, "user-2", "session-2");

    await request(app.getHttpServer())
      .get("/management/companies/company-1/participants")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(403);
  });

  test("GET /management/projects/:projectId/teams returns the project's teams oldest-first", async (): Promise<void> => {
    const now = new Date("2026-06-03T00:00:00.000Z");
    const later = new Date("2026-06-04T00:00:00.000Z");

    prisma.projects.set("project-1", {
      address: "Site Road",
      centerLatitude: "31.2304000",
      centerLongitude: "121.4737000",
      companyId: "company-1",
      createdAt: now,
      geofenceRadiusM: 300,
      id: "project-1",
      name: "Project One",
      plannedEndDate: null,
      plannedStartDate: now,
      status: "ACTIVE",
      updatedAt: now
    });
    prisma.projects.set("project-2", {
      address: "Site Road 2",
      centerLatitude: "31.2304000",
      centerLongitude: "121.4737000",
      companyId: "company-1",
      createdAt: now,
      geofenceRadiusM: 300,
      id: "project-2",
      name: "Project Two",
      plannedEndDate: null,
      plannedStartDate: now,
      status: "ACTIVE",
      updatedAt: now
    });

    // team-1 is older (now), team-2 is newer (later) — both in project-1
    prisma.teams.set("team-1", {
      createdAt: now,
      id: "team-1",
      name: "Team One",
      projectId: "project-1",
      status: "ACTIVE",
      updatedAt: now
    });
    prisma.teams.set("team-2", {
      createdAt: later,
      id: "team-2",
      name: "Team Two",
      projectId: "project-1",
      status: "ACTIVE",
      updatedAt: later
    });
    // team-3 belongs to project-2 — must not appear
    prisma.teams.set("team-3", {
      createdAt: now,
      id: "team-3",
      name: "Team Three",
      projectId: "project-2",
      status: "ACTIVE",
      updatedAt: now
    });

    // Grant PROJECT_ADMIN@PROJECT(project-1) to user-1
    prisma.userRoles.push({
      role: prisma.roles.get("PROJECT_ADMIN") as RoleRecord,
      roleId: "role-PROJECT_ADMIN",
      scopeId: "project-1",
      scopeType: "PROJECT",
      userId: "user-1"
    });

    app = await createApp(prisma);
    const accessToken = await createAccessToken(app, "user-1", "session-1");

    const response = await request(app.getHttpServer())
      .get("/management/projects/project-1/teams")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    const body = response.body as readonly Record<string, unknown>[];
    expect(body).toHaveLength(2);
    expect(body[0]?.["id"]).toBe("team-1");
    expect(body[1]?.["id"]).toBe("team-2");

    const ids = body.map((row): unknown => row["id"]);
    expect(ids).not.toContain("team-3");

    for (const row of body) {
      expect(row).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        projectId: "project-1",
        status: expect.any(String)
      });
    }
  });

  test("GET /management/projects/:projectId/teams returns 403 without team.manage at the project scope", async (): Promise<void> => {
    const now = new Date("2026-06-03T00:00:00.000Z");

    prisma.projects.set("project-1", {
      address: "Site Road",
      centerLatitude: "31.2304000",
      centerLongitude: "121.4737000",
      companyId: "company-1",
      createdAt: now,
      geofenceRadiusM: 300,
      id: "project-1",
      name: "Project One",
      plannedEndDate: null,
      plannedStartDate: now,
      status: "ACTIVE",
      updatedAt: now
    });

    // user-2 has no role at project-1
    prisma.seedActiveSession("user-2", "session-2");

    app = await createApp(prisma);
    const accessToken = await createAccessToken(app, "user-2", "session-2");

    await request(app.getHttpServer())
      .get("/management/projects/project-1/teams")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(403);
  });

  test("GET /management/projects/:projectId/invitations returns the project's invitations WITHOUT plaintext code", async (): Promise<void> => {
    const now = new Date("2026-06-03T00:00:00.000Z");
    const expires = new Date("2026-06-10T00:00:00.000Z");

    prisma.projects.set("project-1", {
      address: "Site Road",
      centerLatitude: "31.2304000",
      centerLongitude: "121.4737000",
      companyId: "company-1",
      createdAt: now,
      geofenceRadiusM: 300,
      id: "project-1",
      name: "Project One",
      plannedEndDate: null,
      plannedStartDate: now,
      status: "ACTIVE",
      updatedAt: now
    });
    prisma.projects.set("project-2", {
      address: "Site Road 2",
      centerLatitude: "31.2304000",
      centerLongitude: "121.4737000",
      companyId: "company-1",
      createdAt: now,
      geofenceRadiusM: 300,
      id: "project-2",
      name: "Project Two",
      plannedEndDate: null,
      plannedStartDate: now,
      status: "ACTIVE",
      updatedAt: now
    });

    // Seed a worker profile and member in project-1 (invite-1 and invite-2 target worker-1)
    prisma.workerProfiles.set("worker-1", {
      employmentStatus: "ACTIVE",
      encryptedIdNumber: "enc-id-1",
      encryptedName: "enc-name-1",
      faceProfileStatus: "PENDING",
      id: "worker-1",
      idNumberHash: "hash-1",
      phone: "13800000001",
      realNameStatus: "VERIFIED",
      workType: "Steel"
    });
    prisma.workerMembers.set("worker-member-1", {
      enteredAt: now,
      exitedAt: null,
      id: "worker-member-1",
      projectId: "project-1",
      projectRoleLabel: "Welder",
      requiresAttendance: true,
      status: "ACTIVE",
      team: null,
      teamId: null,
      worker: prisma.workerProfiles.get("worker-1") as WorkerProfileRecord,
      workerId: "worker-1"
    });

    // Seed a worker profile and member in project-2 (invite-3 targets worker-2)
    prisma.workerProfiles.set("worker-2", {
      employmentStatus: "ACTIVE",
      encryptedIdNumber: "enc-id-2",
      encryptedName: "enc-name-2",
      faceProfileStatus: "PENDING",
      id: "worker-2",
      idNumberHash: "hash-2",
      phone: "13800000002",
      realNameStatus: "VERIFIED",
      workType: "Concrete"
    });
    prisma.workerMembers.set("worker-member-2", {
      enteredAt: now,
      exitedAt: null,
      id: "worker-member-2",
      projectId: "project-2",
      projectRoleLabel: "Mason",
      requiresAttendance: true,
      status: "ACTIVE",
      team: null,
      teamId: null,
      worker: prisma.workerProfiles.get("worker-2") as WorkerProfileRecord,
      workerId: "worker-2"
    });

    // invite-1: PENDING for worker-1 (project-1)
    prisma.bindingInvitations.set("invite-1", {
      id: "invite-1",
      targetType: "WORKER",
      workerProfileId: "worker-1",
      managerProfileId: null,
      codeHash: "hash-of-code-1",
      createdByUserId: "user-1",
      acceptedByUserId: null,
      status: "PENDING",
      expiresAt: expires,
      createdAt: now
    });
    // invite-2: ACCEPTED for worker-1 (project-1)
    prisma.bindingInvitations.set("invite-2", {
      id: "invite-2",
      targetType: "WORKER",
      workerProfileId: "worker-1",
      managerProfileId: null,
      codeHash: "hash-of-code-2",
      createdByUserId: "user-1",
      acceptedByUserId: "user-binding",
      status: "ACCEPTED",
      expiresAt: expires,
      createdAt: now
    });
    // invite-3: PENDING for worker-2 (project-2) — must NOT appear
    prisma.bindingInvitations.set("invite-3", {
      id: "invite-3",
      targetType: "WORKER",
      workerProfileId: "worker-2",
      managerProfileId: null,
      codeHash: "hash-of-code-3",
      createdByUserId: "user-1",
      acceptedByUserId: null,
      status: "PENDING",
      expiresAt: expires,
      createdAt: now
    });

    // Grant PROJECT_ADMIN@PROJECT(project-1) to user-1
    prisma.userRoles.push({
      role: prisma.roles.get("PROJECT_ADMIN") as RoleRecord,
      roleId: "role-PROJECT_ADMIN",
      scopeId: "project-1",
      scopeType: "PROJECT",
      userId: "user-1"
    });

    app = await createApp(prisma);
    const accessToken = await createAccessToken(app, "user-1", "session-1");

    const response = await request(app.getHttpServer())
      .get("/management/projects/project-1/invitations")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    const body = response.body as readonly Record<string, unknown>[];
    expect(body).toHaveLength(2);

    const ids = body.map((row): unknown => row["id"]);
    expect(ids).toContain("invite-1");
    expect(ids).toContain("invite-2");
    expect(ids).not.toContain("invite-3");

    // Verify shape — NO `code` field
    for (const row of body) {
      expect(row).not.toHaveProperty("code");
      expect(row).toMatchObject({
        id: expect.any(String),
        targetType: expect.any(String),
        profileId: expect.any(String),
        projectId: "project-1",
        status: expect.any(String),
        expiresAt: expect.any(String),
        createdAt: expect.any(String)
      });
      expect("acceptedByUserId" in row).toBe(true);
    }
  });

  test("GET /management/projects/:projectId/invitations returns 403 without binding.invitation.create", async (): Promise<void> => {
    const now = new Date("2026-06-03T00:00:00.000Z");

    prisma.projects.set("project-1", {
      address: "Site Road",
      centerLatitude: "31.2304000",
      centerLongitude: "121.4737000",
      companyId: "company-1",
      createdAt: now,
      geofenceRadiusM: 300,
      id: "project-1",
      name: "Project One",
      plannedEndDate: null,
      plannedStartDate: now,
      status: "ACTIVE",
      updatedAt: now
    });

    // user-2 has no role
    prisma.seedActiveSession("user-2", "session-2");

    app = await createApp(prisma);
    const accessToken = await createAccessToken(app, "user-2", "session-2");

    await request(app.getHttpServer())
      .get("/management/projects/project-1/invitations")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(403);
  });

  test("POST /management/projects/:projectId/invitations/:invitationId/revoke updates a PENDING invitation to REVOKED", async (): Promise<void> => {
    const now = new Date("2026-06-03T00:00:00.000Z");
    const expires = new Date("2026-06-10T00:00:00.000Z");

    prisma.projects.set("project-1", {
      address: "Site Road",
      centerLatitude: "31.2304000",
      centerLongitude: "121.4737000",
      companyId: "company-1",
      createdAt: now,
      geofenceRadiusM: 300,
      id: "project-1",
      name: "Project One",
      plannedEndDate: null,
      plannedStartDate: now,
      status: "ACTIVE",
      updatedAt: now
    });

    prisma.workerProfiles.set("worker-1", {
      employmentStatus: "ACTIVE",
      encryptedIdNumber: "enc-id-1",
      encryptedName: "enc-name-1",
      faceProfileStatus: "PENDING",
      id: "worker-1",
      idNumberHash: "hash-1",
      phone: "13800000001",
      realNameStatus: "VERIFIED",
      workType: "Steel"
    });
    prisma.workerMembers.set("worker-member-1", {
      enteredAt: now,
      exitedAt: null,
      id: "worker-member-1",
      projectId: "project-1",
      projectRoleLabel: "Welder",
      requiresAttendance: true,
      status: "ACTIVE",
      team: null,
      teamId: null,
      worker: prisma.workerProfiles.get("worker-1") as WorkerProfileRecord,
      workerId: "worker-1"
    });

    prisma.bindingInvitations.set("invite-1", {
      id: "invite-1",
      targetType: "WORKER",
      workerProfileId: "worker-1",
      managerProfileId: null,
      codeHash: "hash-of-code-1",
      createdByUserId: "user-1",
      acceptedByUserId: null,
      status: "PENDING",
      expiresAt: expires,
      createdAt: now
    });

    // Grant PROJECT_ADMIN@PROJECT(project-1) to user-1
    prisma.userRoles.push({
      role: prisma.roles.get("PROJECT_ADMIN") as RoleRecord,
      roleId: "role-PROJECT_ADMIN",
      scopeId: "project-1",
      scopeType: "PROJECT",
      userId: "user-1"
    });

    app = await createApp(prisma);
    const accessToken = await createAccessToken(app, "user-1", "session-1");

    const response = await request(app.getHttpServer())
      .post("/management/projects/project-1/invitations/invite-1/revoke")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(201);

    const body = response.body as Record<string, unknown>;
    expect(body["status"]).toBe("REVOKED");
    expect(body["id"]).toBe("invite-1");
    expect(body).not.toHaveProperty("code");
    expect(body).toMatchObject({
      id: "invite-1",
      targetType: "WORKER",
      profileId: "worker-1",
      projectId: "project-1",
      status: "REVOKED",
      expiresAt: expect.any(String),
      createdAt: expect.any(String)
    });
    expect("acceptedByUserId" in body).toBe(true);

    // Verify the in-memory record was mutated
    expect(prisma.bindingInvitations.get("invite-1")?.status).toBe("REVOKED");
  });

  test("POST /management/projects/:projectId/invitations/:invitationId/revoke returns 409 for non-PENDING invitations", async (): Promise<void> => {
    const now = new Date("2026-06-03T00:00:00.000Z");
    const expires = new Date("2026-06-10T00:00:00.000Z");

    prisma.projects.set("project-1", {
      address: "Site Road",
      centerLatitude: "31.2304000",
      centerLongitude: "121.4737000",
      companyId: "company-1",
      createdAt: now,
      geofenceRadiusM: 300,
      id: "project-1",
      name: "Project One",
      plannedEndDate: null,
      plannedStartDate: now,
      status: "ACTIVE",
      updatedAt: now
    });

    prisma.bindingInvitations.set("invite-1", {
      id: "invite-1",
      targetType: "WORKER",
      workerProfileId: "worker-1",
      managerProfileId: null,
      codeHash: "hash-of-code-1",
      createdByUserId: "user-1",
      acceptedByUserId: "user-binding",
      status: "ACCEPTED",
      expiresAt: expires,
      createdAt: now
    });

    // Grant PROJECT_ADMIN@PROJECT(project-1) to user-1
    prisma.userRoles.push({
      role: prisma.roles.get("PROJECT_ADMIN") as RoleRecord,
      roleId: "role-PROJECT_ADMIN",
      scopeId: "project-1",
      scopeType: "PROJECT",
      userId: "user-1"
    });

    app = await createApp(prisma);
    const accessToken = await createAccessToken(app, "user-1", "session-1");

    const response = await request(app.getHttpServer())
      .post("/management/projects/project-1/invitations/invite-1/revoke")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(409);

    const body = response.body as Record<string, unknown>;
    expect(body["message"]).toBe("INVITATION_NOT_PENDING");
  });

  test("POST /management/projects/:projectId/invitations/:invitationId/revoke returns 403 without binding.invitation.create", async (): Promise<void> => {
    const now = new Date("2026-06-03T00:00:00.000Z");

    prisma.projects.set("project-1", {
      address: "Site Road",
      centerLatitude: "31.2304000",
      centerLongitude: "121.4737000",
      companyId: "company-1",
      createdAt: now,
      geofenceRadiusM: 300,
      id: "project-1",
      name: "Project One",
      plannedEndDate: null,
      plannedStartDate: now,
      status: "ACTIVE",
      updatedAt: now
    });

    // user-2 has no role
    prisma.seedActiveSession("user-2", "session-2");

    app = await createApp(prisma);
    const accessToken = await createAccessToken(app, "user-2", "session-2");

    await request(app.getHttpServer())
      .post("/management/projects/project-1/invitations/invite-1/revoke")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(403);
  });

  test("only global system administrators create companies", async (): Promise<void> => {
    prisma.seedActiveSession("company-admin-user", "session-company-admin");
    prisma.seedActiveSession("system-admin-user", "session-system-admin");
    prisma.userRoles.push(
      {
        role: prisma.roles.get("COMPANY_ADMIN") as RoleRecord,
        roleId: "role-COMPANY_ADMIN",
        scopeId: "GLOBAL",
        scopeType: "GLOBAL",
        userId: "company-admin-user"
      },
      {
        role: prisma.roles.get("SYSTEM_ADMIN") as RoleRecord,
        roleId: "role-SYSTEM_ADMIN",
        scopeId: "GLOBAL",
        scopeType: "GLOBAL",
        userId: "system-admin-user"
      }
    );
    app = await createApp(prisma);
    const companyAdminAccessToken = await createAccessToken(app, "company-admin-user", "session-company-admin");
    const systemAdminAccessToken = await createAccessToken(app, "system-admin-user", "session-system-admin");

    await request(app.getHttpServer())
      .post("/management/companies")
      .set("Authorization", `Bearer ${companyAdminAccessToken}`)
      .send({
        name: "Unauthorized Company",
        status: "ACTIVE"
      })
      .expect(403);

    const response = await request(app.getHttpServer())
      .post("/management/companies")
      .set("Authorization", `Bearer ${systemAdminAccessToken}`)
      .send({
        name: "New Company",
        status: "ACTIVE"
      })
      .expect(201);

    expect(response.body).toEqual({
      id: "company-created-1",
      name: "New Company",
      status: "ACTIVE"
    });
  });
});
