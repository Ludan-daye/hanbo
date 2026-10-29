import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import type { AttendancePointCode, AttendanceRecordSource } from "@construction/domain";
import type { RoleCode } from "@construction/domain";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { AttendanceModule } from "../src/attendance/attendance.module.js";
import { AuthModule } from "../src/auth/auth.module.js";
import { AuthorizationModule } from "../src/authorization/authorization.module.js";
import { PrismaService } from "../src/infrastructure/database/prisma.service.js";
import { MakeupModule } from "../src/makeup/makeup.module.js";

type UserStatusValue = "ACTIVE" | "DISABLED";
type ScopeTypeValue = "GLOBAL" | "COMPANY" | "PROJECT" | "TEAM";
type ProfileOwnerTypeValue = "WORKER" | "MANAGER";
type MemberStatusValue = "ACTIVE" | "EXITED" | "SUSPENDED";
type MakeupStatusValue = "PENDING" | "APPROVED" | "REJECTED";
type AttendanceRecordStatusValue = "VALID" | "INVALID";

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

type ProjectRecord = {
  readonly centerLatitude: string;
  readonly centerLongitude: string;
  readonly companyId: string;
  readonly geofenceRadiusM: number;
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

type ShiftRecord = {
  readonly id: string;
  readonly isDefault: boolean;
  readonly name: string;
  readonly projectId: string;
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

type ShiftWithSegments = ShiftRecord & {
  readonly segments: readonly ShiftSegmentRecord[];
};

type ProjectWorkerMemberRecord = {
  readonly id: string;
  readonly projectId: string;
  readonly requiresAttendance: boolean;
  readonly status: MemberStatusValue;
  readonly teamId: string | null;
  readonly workerId: string;
};

type ProjectManagerMemberRecord = {
  readonly id: string;
  readonly managerId: string;
  readonly projectId: string;
  readonly requiresAttendance: boolean;
  readonly roleCode: RoleCode;
  readonly status: MemberStatusValue;
  readonly teamScopeId: string | null;
};

type WorkerProfileRecord = {
  readonly id: string;
  readonly phone: string;
  readonly projectMemberships: readonly ProjectWorkerMemberRecord[];
  readonly userId: string | null;
};

type ManagerProfileRecord = {
  readonly id: string;
  readonly name: string;
  readonly phone: string;
  readonly projectMemberships: readonly ProjectManagerMemberRecord[];
  readonly userId: string | null;
};

type MakeupRequestRecord = {
  readonly approvalReason: string | null;
  readonly approvedAt: Date | null;
  readonly approverUserId: string | null;
  readonly attendanceDate: Date;
  readonly id: string;
  readonly participantId: string;
  readonly participantType: ProfileOwnerTypeValue;
  readonly pointCode: AttendancePointCode;
  readonly projectId: string;
  readonly reason: string;
  readonly requestedOccurredAt: Date;
  readonly requesterUserId: string;
  readonly status: MakeupStatusValue;
};

type AttendanceRecordRecord = {
  readonly attendanceDate: Date;
  readonly id: string;
  readonly occurredAt: Date;
  readonly participantId: string;
  readonly participantType: ProfileOwnerTypeValue;
  readonly pointCode: AttendancePointCode;
  readonly projectId: string;
  readonly source: AttendanceRecordSource;
  readonly status: AttendanceRecordStatusValue;
};

type AttendanceResultRecord = {
  readonly abnormalRecordCount: number;
  readonly approvedMakeupCount: number;
  readonly attendanceDate: Date;
  readonly calculatedAt: Date;
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

type ShiftFindFirstArgs = {
  readonly include?: {
    readonly segments?: boolean;
  };
  readonly where: {
    readonly isDefault: boolean;
    readonly projectId: string;
  };
};

type ScheduleFindManyArgs = {
  readonly where: {
    readonly ownerId: string;
    readonly ownerType: string;
  };
};

type WorkerProfileFindUniqueArgs = {
  readonly include?: {
    readonly projectMemberships?: {
      readonly where: {
        readonly projectId: string;
      };
    };
  };
  readonly where: {
    readonly userId: string;
  };
};

type ManagerProfileFindUniqueArgs = {
  readonly include?: {
    readonly projectMemberships?: {
      readonly where: {
        readonly projectId: string;
      };
    };
  };
  readonly where: {
    readonly userId: string;
  };
};

type ProjectWorkerMemberFindUniqueArgs = {
  readonly where: {
    readonly projectId_workerId: {
      readonly projectId: string;
      readonly workerId: string;
    };
  };
};

type ProjectManagerMemberFindUniqueArgs = {
  readonly where: {
    readonly projectId_managerId: {
      readonly managerId: string;
      readonly projectId: string;
    };
  };
};

type MakeupRequestCreateArgs = {
  readonly data: Omit<MakeupRequestRecord, "approvalReason" | "approvedAt" | "approverUserId" | "id">;
};

type MakeupRequestFindUniqueArgs = {
  readonly where: {
    readonly id: string;
  };
};

type MakeupRequestUpdateManyArgs = {
  readonly data: {
    readonly approvalReason: string;
    readonly approvedAt?: Date;
    readonly approverUserId: string;
    readonly status: "APPROVED" | "REJECTED";
  };
  readonly where: {
    readonly id: string;
    readonly status: "PENDING";
  };
};

type MakeupRequestFindManyByDateArgs = {
  readonly where: {
    readonly attendanceDate: Date;
    readonly participantId: string;
    readonly participantType: ProfileOwnerTypeValue;
    readonly projectId: string;
    readonly status: "APPROVED";
  };
};

type MakeupParticipantOrClause = {
  readonly participantId: { readonly in: readonly string[] };
  readonly participantType: ProfileOwnerTypeValue;
};

type MakeupRequestFindManyByTeamArgs = {
  readonly orderBy?: { readonly createdAt: "asc" | "desc" };
  readonly where: {
    readonly OR: readonly MakeupParticipantOrClause[];
    readonly projectId: string;
    readonly status: "PENDING";
  };
};

type MakeupRequestFindManyArgs = MakeupRequestFindManyByDateArgs | MakeupRequestFindManyByTeamArgs;

type TeamRecord = {
  readonly id: string;
  readonly name: string;
  readonly projectId: string;
};

type TeamFindUniqueArgs = {
  readonly include?: {
    readonly project?: boolean;
  };
  readonly where: {
    readonly id: string;
  };
};

type ProjectWorkerMemberFindManyArgs = {
  readonly select?: { readonly workerId?: boolean };
  readonly where: {
    readonly projectId: string;
    readonly status: string;
    readonly teamId: string;
  };
};

type ProjectManagerMemberFindManyArgs = {
  readonly select?: { readonly managerId?: boolean };
  readonly where: {
    readonly projectId: string;
    readonly status: string;
    readonly teamScopeId: string;
  };
};

type AttendanceRecordFindManyArgs = {
  readonly where: {
    readonly attendanceDate: Date;
    readonly participantId: string;
    readonly participantType: ProfileOwnerTypeValue;
    readonly projectId: string;
  };
};

type AttendanceResultUpsertArgs = {
  readonly create: Omit<AttendanceResultRecord, "id">;
  readonly update: Omit<AttendanceResultRecord, "id" | "attendanceDate" | "participantId" | "participantType" | "projectId">;
  readonly where: {
    readonly projectId_attendanceDate_participantType_participantId: {
      readonly attendanceDate: Date;
      readonly participantId: string;
      readonly participantType: ProfileOwnerTypeValue;
      readonly projectId: string;
    };
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

class MakeupPrismaTestDouble {
  async $executeRaw(): Promise<number> { return 1; }
  async $transaction<T>(callback: (transaction: MakeupPrismaTestDouble) => Promise<T>): Promise<T> { return callback(this); }
  readonly attendancePlan = { findMany: async (): Promise<[]> => [] };
  readonly projectMemberHistory = { findMany: async (): Promise<[]> => [] };

  readonly users = new Map<string, UserRecord>();
  readonly sessions = new Map<string, SessionRecord>();
  readonly projects = new Map<string, ProjectRecord>();
  readonly teams = new Map<string, TeamRecord>();
  readonly roles = new Map<RoleCode, RoleRecord>();
  readonly userRoles: UserRoleRecord[] = [];
  readonly shifts = new Map<string, ShiftRecord>();
  readonly shiftSegments = new Map<string, ShiftSegmentRecord>();
  readonly workerProfiles = new Map<string, WorkerProfileRecord>();
  readonly managerProfiles = new Map<string, ManagerProfileRecord>();
  readonly workerMembers = new Map<string, ProjectWorkerMemberRecord>();
  readonly managerMembers = new Map<string, ProjectManagerMemberRecord>();
  readonly makeupRequests = new Map<string, MakeupRequestRecord>();
  readonly attendanceRecords = new Map<string, AttendanceRecordRecord>();
  readonly attendanceResults = new Map<string, AttendanceResultRecord>();

  private makeupSequence = 0;
  private resultSequence = 0;

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

  readonly team = {
    findUnique: async (args: TeamFindUniqueArgs): Promise<(TeamRecord & { readonly project?: ProjectRecord }) | null> => {
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

        return { ...team, project };
      }

      return team;
    }
  };

  readonly shift = {
    findMany: async (args: { where: { projectId: { in: string[] }; isDefault: boolean } }): Promise<ShiftWithSegments[]> => Array.from(this.shifts.values()).filter((row) => args.where.projectId.in.includes(row.projectId) && row.isDefault === args.where.isDefault).map((row) => ({ ...row, segments: Array.from(this.shiftSegments.values()).filter((segment) => segment.shiftId === row.id) })),
    findFirst: async (args: ShiftFindFirstArgs): Promise<ShiftWithSegments | ShiftRecord | null> => {
      const shift = Array.from(this.shifts.values()).find(
        (shiftRecord: ShiftRecord): boolean =>
          shiftRecord.projectId === args.where.projectId && shiftRecord.isDefault === args.where.isDefault
      );

      if (shift === undefined) {
        return null;
      }

      if (args.include?.segments === true) {
        return {
          ...shift,
          segments: Array.from(this.shiftSegments.values()).filter(
            (segment: ShiftSegmentRecord): boolean => segment.shiftId === shift.id
          )
        };
      }

      return shift;
    }
  };

  readonly schedule = {
    findMany: async (args: ScheduleFindManyArgs): Promise<[]> => {
      if (args.where.ownerId.length === 0 || args.where.ownerType.length === 0) {
        throw new Error(
          JSON.stringify({
            message: "Schedule owner query must include ownerType and ownerId"
          })
        );
      }

      return [];
    }
  };

  readonly workerProfile = {
    findUnique: async (args: WorkerProfileFindUniqueArgs): Promise<WorkerProfileRecord | null> => {
      const profile = Array.from(this.workerProfiles.values()).find(
        (workerProfile: WorkerProfileRecord): boolean => workerProfile.userId === args.where.userId
      );

      if (profile === undefined) {
        return null;
      }

      if (args.include?.projectMemberships !== undefined) {
        return {
          ...profile,
          projectMemberships: profile.projectMemberships.map((member) => ({ enteredAt: new Date("2020-01-01"), exitedAt: null, projectRoleLabel: "WORKER", ...member })).filter(
            (member: ProjectWorkerMemberRecord): boolean =>
              member.projectId === args.include?.projectMemberships?.where.projectId
          )
        };
      }

      return profile;
    }
  };

  readonly managerProfile = {
    findUnique: async (args: ManagerProfileFindUniqueArgs): Promise<ManagerProfileRecord | null> => {
      const profile = Array.from(this.managerProfiles.values()).find(
        (managerProfile: ManagerProfileRecord): boolean => managerProfile.userId === args.where.userId
      );

      if (profile === undefined) {
        return null;
      }

      if (args.include?.projectMemberships !== undefined) {
        return {
          ...profile,
          projectMemberships: profile.projectMemberships.map((member) => ({ enteredAt: new Date("2020-01-01"), exitedAt: null, projectRoleLabel: "WORKER", ...member })).filter(
            (member: ProjectManagerMemberRecord): boolean =>
              member.projectId === args.include?.projectMemberships?.where.projectId
          )
        };
      }

      return profile;
    }
  };

  readonly projectWorkerMember = {
    findMany: async (args: ProjectWorkerMemberFindManyArgs): Promise<Pick<ProjectWorkerMemberRecord, "workerId">[]> =>
      Array.from(this.workerMembers.values())
        .filter(
          (m: ProjectWorkerMemberRecord): boolean =>
            m.projectId === args.where.projectId &&
            m.status === args.where.status &&
            m.teamId === args.where.teamId
        )
        .map((m: ProjectWorkerMemberRecord) => ({ workerId: m.workerId })),
    findUnique: async (args: ProjectWorkerMemberFindUniqueArgs): Promise<(ProjectWorkerMemberRecord & { worker: WorkerProfileRecord; enteredAt: Date; exitedAt: null; projectRoleLabel: string }) | null> => {
      const member = this.workerMembers.get(`${args.where.projectId_workerId.projectId}:${args.where.projectId_workerId.workerId}`);
      const worker = member === undefined ? undefined : this.workerProfiles.get(member.workerId);
      return member === undefined || worker === undefined ? null : { enteredAt: new Date("2020-01-01"), exitedAt: null, projectRoleLabel: "WORKER", ...member, worker };
    }
  };

  readonly projectManagerMember = {
    findMany: async (args: ProjectManagerMemberFindManyArgs): Promise<Pick<ProjectManagerMemberRecord, "managerId">[]> =>
      Array.from(this.managerMembers.values())
        .filter(
          (m: ProjectManagerMemberRecord): boolean =>
            m.projectId === args.where.projectId &&
            m.status === args.where.status &&
            m.teamScopeId === args.where.teamScopeId
        )
        .map((m: ProjectManagerMemberRecord) => ({ managerId: m.managerId })),
    findUnique: async (args: ProjectManagerMemberFindUniqueArgs): Promise<ProjectManagerMemberRecord | null> =>
      this.managerMembers.get(`${args.where.projectId_managerId.projectId}:${args.where.projectId_managerId.managerId}`) ?? null
  };

  readonly makeupRequest = {
    findFirst: async (): Promise<null> => null,
    findUniqueOrThrow: async (args: MakeupRequestFindUniqueArgs): Promise<MakeupRequestRecord> => { const row = this.makeupRequests.get(args.where.id); if (!row) throw new Error("Missing makeup fixture"); return row; },
    create: async (args: MakeupRequestCreateArgs): Promise<MakeupRequestRecord> => {
      this.makeupSequence += 1;
      const requestRecord: MakeupRequestRecord = {
        ...args.data,
        approvalReason: null,
        approvedAt: null,
        approverUserId: null,
        id: `makeup-request-${this.makeupSequence}`
      };
      this.makeupRequests.set(requestRecord.id, requestRecord);
      return requestRecord;
    },
    findMany: async (args: MakeupRequestFindManyArgs): Promise<MakeupRequestRecord[]> => {
      const all = Array.from(this.makeupRequests.values());

      if ("OR" in args.where) {
        const byTeam = args as MakeupRequestFindManyByTeamArgs;
        return all
          .filter(
            (r: MakeupRequestRecord): boolean =>
              r.projectId === byTeam.where.projectId &&
              r.status === byTeam.where.status &&
              byTeam.where.OR.some(
                (clause: MakeupParticipantOrClause): boolean =>
                  r.participantType === clause.participantType &&
                  clause.participantId.in.includes(r.participantId)
              )
          )
          .sort((a: MakeupRequestRecord, b: MakeupRequestRecord): number => a.id.localeCompare(b.id));
      }

      const byDate = args as MakeupRequestFindManyByDateArgs;
      return all.filter(
        (r: MakeupRequestRecord): boolean =>
          r.projectId === byDate.where.projectId &&
          r.participantType === byDate.where.participantType &&
          r.participantId === byDate.where.participantId &&
          r.status === byDate.where.status &&
          r.attendanceDate.getTime() === byDate.where.attendanceDate.getTime()
      );
    },
    findUnique: async (args: MakeupRequestFindUniqueArgs): Promise<MakeupRequestRecord | null> =>
      this.makeupRequests.get(args.where.id) ?? null,
    updateMany: async (args: MakeupRequestUpdateManyArgs): Promise<{ readonly count: number }> => {
      const existing = this.makeupRequests.get(args.where.id);

      if (existing === undefined || existing.status !== args.where.status) {
        return { count: 0 };
      }

      const updated: MakeupRequestRecord = {
        ...existing,
        approvalReason: args.data.approvalReason,
        approvedAt: args.data.approvedAt ?? null,
        approverUserId: args.data.approverUserId,
        status: args.data.status
      };
      this.makeupRequests.set(updated.id, updated);
      return { count: 1 };
    }
  };

  readonly attendanceRecord = {
    findFirst: async (): Promise<null> => null,
    findMany: async (args: AttendanceRecordFindManyArgs): Promise<AttendanceRecordRecord[]> =>
      Array.from(this.attendanceRecords.values()).filter(
        (record: AttendanceRecordRecord): boolean =>
          record.projectId === args.where.projectId &&
          record.participantType === args.where.participantType &&
          record.participantId === args.where.participantId &&
          record.attendanceDate.getTime() === args.where.attendanceDate.getTime()
      )
  };

  readonly attendanceResult = {
    upsert: async (args: AttendanceResultUpsertArgs): Promise<AttendanceResultRecord> => {
      const unique = args.where.projectId_attendanceDate_participantType_participantId;
      const key = `${unique.projectId}:${unique.attendanceDate.toISOString()}:${unique.participantType}:${unique.participantId}`;
      const existing = this.attendanceResults.get(key);

      if (existing === undefined) {
        this.resultSequence += 1;
        const created: AttendanceResultRecord = {
          ...args.create,
          id: `attendance-result-${this.resultSequence}`
        };
        this.attendanceResults.set(key, created);
        return created;
      }

      const updated: AttendanceResultRecord = {
        ...existing,
        ...args.update
      };
      this.attendanceResults.set(key, updated);
      return updated;
    }
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

const seedDirectRolePermissions = (prisma: MakeupPrismaTestDouble): void => {
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

const createApp = async (prisma: MakeupPrismaTestDouble): Promise<INestApplication> => {
  const moduleRef = await Test.createTestingModule({
    imports: [AuthModule, AuthorizationModule, AttendanceModule, MakeupModule]
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

const createMakeupBody = (attendanceDate: string, pointCode: AttendancePointCode, occurredAt: string): Record<string, unknown> => ({
  attendanceDate,
  pointCode,
  reason: "Forgot to punch because of site entry queue",
  requestedOccurredAt: occurredAt
});

describe("MakeupModule", (): void => {
  let app: INestApplication | undefined;
  let prisma: MakeupPrismaTestDouble;

  beforeEach((): void => {
    applyTestEnv();
    prisma = new MakeupPrismaTestDouble();
    seedDirectRolePermissions(prisma);
    prisma.projects.set("project-1", {
      centerLatitude: "31.2304000",
      centerLongitude: "121.4737000",
      companyId: "company-1",
      geofenceRadiusM: 300,
      id: "project-1"
    });
    prisma.shifts.set("shift-1", {
      id: "shift-1",
      isDefault: true,
      name: "Standard Day",
      projectId: "project-1"
    });
    prisma.shiftSegments.set("shift-segment-1", {
      earlyGraceMins: 0,
      endTime: "12:00",
      id: "shift-segment-1",
      lateGraceMins: 5,
      sequence: 1,
      shiftId: "shift-1",
      startTime: "08:00"
    });
    prisma.shiftSegments.set("shift-segment-2", {
      earlyGraceMins: 5,
      endTime: "18:00",
      id: "shift-segment-2",
      lateGraceMins: 0,
      sequence: 2,
      shiftId: "shift-1",
      startTime: "13:30"
    });
    prisma.seedActiveSession("worker-user", "session-worker");
    prisma.seedActiveSession("team-leader-user", "session-team-leader");
    prisma.seedActiveSession("other-team-leader-user", "session-other-team-leader");
    prisma.workerProfiles.set("worker-1", {
      id: "worker-1",
      phone: "13800000001",
      projectMemberships: [
        {
          id: "worker-member-1",
          projectId: "project-1",
          requiresAttendance: true,
          status: "ACTIVE",
          teamId: "team-1",
          workerId: "worker-1"
        }
      ],
      userId: "worker-user"
    });
    prisma.workerMembers.set("project-1:worker-1", {
      id: "worker-member-1",
      projectId: "project-1",
      requiresAttendance: true,
      status: "ACTIVE",
      teamId: "team-1",
      workerId: "worker-1"
    });
    prisma.userRoles.push(
      {
        role: prisma.roles.get("WORKER") as RoleRecord,
        scopeId: "project-1",
        scopeType: "PROJECT",
        userId: "worker-user"
      },
      {
        role: prisma.roles.get("TEAM_LEADER") as RoleRecord,
        scopeId: "team-1",
        scopeType: "TEAM",
        userId: "team-leader-user"
      },
      {
        role: prisma.roles.get("TEAM_LEADER") as RoleRecord,
        scopeId: "team-2",
        scopeType: "TEAM",
        userId: "other-team-leader-user"
      }
    );
    prisma.attendanceRecords.set("device-end", {
      attendanceDate: new Date("2026-06-03T00:00:00.000Z"),
      id: "device-end",
      occurredAt: new Date("2026-06-03T12:00:00.000+08:00"),
      participantId: "worker-1",
      participantType: "WORKER",
      pointCode: "SEGMENT_1_END",
      projectId: "project-1",
      source: "DEVICE",
      status: "VALID"
    });
    prisma.attendanceResults.set("project-1:2026-06-03T00:00:00.000Z:WORKER:worker-1", {
      abnormalRecordCount: 0,
      approvedMakeupCount: 0,
      attendanceDate: new Date("2026-06-03T00:00:00.000Z"),
      calculatedAt: new Date("2026-06-03T12:01:00.000+08:00"),
      id: "attendance-result-existing",
      isAbsent: false,
      isEarlyLeave: false,
      isLate: false,
      isMissingPunch: true,
      participantId: "worker-1",
      participantType: "WORKER",
      projectId: "project-1",
      workedMinutes: 0
    });
  });

  afterEach(async (): Promise<void> => {
    if (app !== undefined) {
      await app.close();
      app = undefined;
    }
  });

  test("team leader approves worker makeup and recalculates daily result", async (): Promise<void> => {
    app = await createApp(prisma);
    const workerAccessToken = await createAccessToken(app, "worker-user", "session-worker");
    const leaderAccessToken = await createAccessToken(app, "team-leader-user", "session-team-leader");

    const createResponse = await request(app.getHttpServer())
      .post("/makeups/projects/project-1/requests")
      .set("Authorization", `Bearer ${workerAccessToken}`)
      .send(createMakeupBody("2026-06-03", "SEGMENT_1_START", "2026-06-03T08:00:00.000+08:00"))
      .expect(201);

    expect(createResponse.body).toMatchObject({
      attendanceDate: "2026-06-03",
      id: "makeup-request-1",
      participantId: "worker-1",
      participantType: "WORKER",
      pointCode: "SEGMENT_1_START",
      projectId: "project-1",
      requesterUserId: "worker-user",
      status: "PENDING"
    });

    const approveResponse = await request(app.getHttpServer())
      .post("/makeups/requests/makeup-request-1/approve")
      .set("Authorization", `Bearer ${leaderAccessToken}`)
      .send({
        approvalReason: "Queue delay confirmed"
      })
      .expect(201);

    expect(approveResponse.body.request).toMatchObject({
      approvalReason: "Queue delay confirmed",
      approverUserId: "team-leader-user",
      id: "makeup-request-1",
      status: "APPROVED"
    });
    expect(approveResponse.body.result).toMatchObject({
      attendanceDate: "2026-06-03",
      isAbsent: false,
      isMissingPunch: true,
      participantId: "worker-1",
      participantType: "WORKER",
      projectId: "project-1",
      workedMinutes: 240
    });
    expect(prisma.attendanceResults.get("project-1:2026-06-03T00:00:00.000Z:WORKER:worker-1")).toMatchObject({
      approvedMakeupCount: 1,
      id: "attendance-result-existing",
      workedMinutes: 240
    });
  });

  test("blocks self approval and sibling team approval", async (): Promise<void> => {
    app = await createApp(prisma);
    const workerAccessToken = await createAccessToken(app, "worker-user", "session-worker");
    const otherLeaderAccessToken = await createAccessToken(app, "other-team-leader-user", "session-other-team-leader");

    await request(app.getHttpServer())
      .post("/makeups/projects/project-1/requests")
      .set("Authorization", `Bearer ${workerAccessToken}`)
      .send(createMakeupBody("2026-06-03", "SEGMENT_1_START", "2026-06-03T08:00:00.000+08:00"))
      .expect(201);

    await request(app.getHttpServer())
      .post("/makeups/requests/makeup-request-1/approve")
      .set("Authorization", `Bearer ${workerAccessToken}`)
      .send({
        approvalReason: "Self approval attempt"
      })
      .expect(403);

    await request(app.getHttpServer())
      .post("/makeups/requests/makeup-request-1/approve")
      .set("Authorization", `Bearer ${otherLeaderAccessToken}`)
      .send({
        approvalReason: "Wrong team attempt"
      })
      .expect(403);

    expect(prisma.makeupRequests.get("makeup-request-1")?.status).toBe("PENDING");
  });

  test("team leader rejects pending makeup without recalculated result", async (): Promise<void> => {
    app = await createApp(prisma);
    const workerAccessToken = await createAccessToken(app, "worker-user", "session-worker");
    const leaderAccessToken = await createAccessToken(app, "team-leader-user", "session-team-leader");

    await request(app.getHttpServer())
      .post("/makeups/projects/project-1/requests")
      .set("Authorization", `Bearer ${workerAccessToken}`)
      .send(createMakeupBody("2026-06-03", "SEGMENT_1_START", "2026-06-03T08:00:00.000+08:00"))
      .expect(201);

    const rejectResponse = await request(app.getHttpServer())
      .post("/makeups/requests/makeup-request-1/reject")
      .set("Authorization", `Bearer ${leaderAccessToken}`)
      .send({
        approvalReason: "No matching supervisor confirmation"
      })
      .expect(201);

    expect(rejectResponse.body).toEqual({
      request: expect.objectContaining({
        approvalReason: "No matching supervisor confirmation",
        approverUserId: "team-leader-user",
        id: "makeup-request-1",
        status: "REJECTED"
      }),
      result: null
    });
  });

  test("GET /makeups/teams/:teamId/pending returns only PENDING requests for that team", async (): Promise<void> => {
    // Seed teams
    prisma.teams.set("team-1", { id: "team-1", name: "Team One", projectId: "project-1" });
    prisma.teams.set("team-2", { id: "team-2", name: "Team Two", projectId: "project-1" });

    // Seed worker-2 as an active member of team-2 (worker-1 is already in team-1 via beforeEach)
    prisma.workerProfiles.set("worker-2", {
      id: "worker-2",
      phone: "13800000002",
      projectMemberships: [
        {
          id: "worker-member-2",
          projectId: "project-1",
          requiresAttendance: true,
          status: "ACTIVE",
          teamId: "team-2",
          workerId: "worker-2"
        }
      ],
      userId: null
    });
    prisma.workerMembers.set("project-1:worker-2", {
      id: "worker-member-2",
      projectId: "project-1",
      requiresAttendance: true,
      status: "ACTIVE",
      teamId: "team-2",
      workerId: "worker-2"
    });

    // Seed makeup requests: PENDING for worker-1 (team-1), PENDING for worker-2 (team-2), APPROVED for worker-1
    prisma.makeupRequests.set("makeup-pending-w1", {
      approvalReason: null,
      approvedAt: null,
      approverUserId: null,
      attendanceDate: new Date("2026-06-03T00:00:00.000Z"),
      id: "makeup-pending-w1",
      participantId: "worker-1",
      participantType: "WORKER",
      pointCode: "SEGMENT_1_START",
      projectId: "project-1",
      reason: "Forgot to punch",
      requestedOccurredAt: new Date("2026-06-03T00:00:00.000+08:00"),
      requesterUserId: "worker-user",
      status: "PENDING"
    });
    prisma.makeupRequests.set("makeup-pending-w2", {
      approvalReason: null,
      approvedAt: null,
      approverUserId: null,
      attendanceDate: new Date("2026-06-03T00:00:00.000Z"),
      id: "makeup-pending-w2",
      participantId: "worker-2",
      participantType: "WORKER",
      pointCode: "SEGMENT_1_START",
      projectId: "project-1",
      reason: "Gate queue delay",
      requestedOccurredAt: new Date("2026-06-03T00:00:00.000+08:00"),
      requesterUserId: "worker-user",
      status: "PENDING"
    });
    prisma.makeupRequests.set("makeup-approved-w1", {
      approvalReason: "Confirmed",
      approvedAt: new Date("2026-06-03T10:00:00.000Z"),
      approverUserId: "team-leader-user",
      attendanceDate: new Date("2026-06-02T00:00:00.000Z"),
      id: "makeup-approved-w1",
      participantId: "worker-1",
      participantType: "WORKER",
      pointCode: "SEGMENT_1_END",
      projectId: "project-1",
      reason: "Left early",
      requestedOccurredAt: new Date("2026-06-02T00:00:00.000+08:00"),
      requesterUserId: "worker-user",
      status: "APPROVED"
    });

    app = await createApp(prisma);
    const leaderAccessToken = await createAccessToken(app, "team-leader-user", "session-team-leader");

    const response = await request(app.getHttpServer())
      .get("/makeups/teams/team-1/pending")
      .set("Authorization", `Bearer ${leaderAccessToken}`)
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      participantId: "worker-1",
      participantType: "WORKER",
      status: "PENDING"
    });
  });

  test("GET /makeups/teams/:teamId/pending returns 403 without makeup.approve at the team scope", async (): Promise<void> => {
    prisma.teams.set("team-1", { id: "team-1", name: "Team One", projectId: "project-1" });

    app = await createApp(prisma);
    // other-team-leader-user has TEAM_LEADER role at team-2, NOT team-1
    const otherLeaderAccessToken = await createAccessToken(app, "other-team-leader-user", "session-other-team-leader");

    await request(app.getHttpServer())
      .get("/makeups/teams/team-1/pending")
      .set("Authorization", `Bearer ${otherLeaderAccessToken}`)
      .expect(403);
  });

  test("POST /makeups/projects/:projectId/requests rejects accounts without membership", async (): Promise<void> => {
    // Seed a user with TEAM_LEADER role at a different team (team-other), giving them no makeup.request
    // permission at project-1 scope.
    prisma.seedActiveSession("no-permission-user", "session-no-permission");
    prisma.userRoles.push({
      role: prisma.roles.get("TEAM_LEADER") as RoleRecord,
      scopeId: "team-other-project",
      scopeType: "TEAM",
      userId: "no-permission-user"
    });
    // no-permission-user has no worker/manager profile bound, but the permission guard runs
    // before the service resolves the participant — so we expect 403, not 400/404.

    app = await createApp(prisma);
    const noPermissionToken = await createAccessToken(app, "no-permission-user", "session-no-permission");

    await request(app.getHttpServer())
      .post("/makeups/projects/project-1/requests")
      .set("Authorization", `Bearer ${noPermissionToken}`)
      .send(createMakeupBody("2026-06-03", "SEGMENT_1_START", "2026-06-03T08:00:00.000+08:00"))
      .expect(400);
  });
});
