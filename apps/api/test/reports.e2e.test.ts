import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import type { RoleCode } from "@construction/domain";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { AuthModule } from "../src/auth/auth.module.js";
import { AuthorizationModule } from "../src/authorization/authorization.module.js";
import { PrismaService } from "../src/infrastructure/database/prisma.service.js";
import { ReportsModule } from "../src/reports/reports.module.js";

type UserStatusValue = "ACTIVE" | "DISABLED";
type ScopeTypeValue = "GLOBAL" | "COMPANY" | "PROJECT" | "TEAM";
type ProfileOwnerTypeValue = "WORKER" | "MANAGER";
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

type TeamRecord = {
  readonly id: string;
  readonly name: string;
  readonly projectId: string;
};

type WorkerProfileRecord = {
  readonly id: string;
  readonly phone: string;
  readonly workType: string;
};

type ManagerProfileRecord = {
  readonly id: string;
  readonly name: string;
  readonly phone: string;
};

type ProjectWorkerMemberRecord = {
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

type AttendanceResultRecord = {
  readonly abnormalRecordCount: number;
  readonly approvedMakeupCount: number;
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

type ScheduleRecord = {
  readonly endsOn: Date | null;
  readonly id: string;
  readonly ownerId: string;
  readonly ownerType: string;
  readonly shiftId: string;
  readonly startsOn: Date;
  readonly workdayMask: number;
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

type CompanyRecord = {
  readonly id: string;
};

type ProjectFindUniqueArgs = {
  readonly where: {
    readonly id: string;
  };
};

type ProjectFindManyArgs = {
  readonly select?: {
    readonly id?: boolean;
  };
  readonly where: {
    readonly companyId?: string;
  };
};

type CompanyFindUniqueArgs = {
  readonly where: {
    readonly id: string;
  };
};

type TeamFindUniqueArgs = {
  readonly where: {
    readonly id: string;
  };
};

type ProjectMemberFindManyArgs = {
  readonly include: {
    readonly manager?: boolean;
    readonly team?: boolean;
    readonly teamScope?: boolean;
    readonly worker?: boolean;
  };
  readonly where: {
    readonly projectId: string | { readonly in: readonly string[] };
    readonly requiresAttendance: boolean;
    readonly status: "ACTIVE";
    readonly teamId?: string;
    readonly teamScopeId?: string;
  };
};

type AttendanceResultFindManyArgs = {
  readonly where: {
    readonly attendanceDate: {
      readonly gte: Date;
      readonly lte: Date;
    };
    readonly OR: readonly { readonly projectId: string }[];
  };
};

type ScheduleFindManyArgs = {
  readonly where: {
    readonly OR?: readonly [
      {
        readonly endsOn: null;
      },
      {
        readonly endsOn: {
          readonly gte: Date;
        };
      }
    ];
    readonly ownerId: string | { readonly in: readonly string[] };
    readonly ownerType: string;
    readonly startsOn?: {
      readonly lte: Date;
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

const matchesProjectIdFilter = (projectId: string, filter: string | { readonly in: readonly string[] }): boolean => {
  if (typeof filter === "string") {
    return projectId === filter;
  }
  return filter.in.includes(projectId);
};

const matchesOwnerIdFilter = (ownerId: string, filter: string | { readonly in: readonly string[] }): boolean => {
  if (typeof filter === "string") {
    return ownerId === filter;
  }
  return filter.in.includes(ownerId);
};

class ReportsPrismaTestDouble {
  readonly shift = { findMany: async (): Promise<readonly { projectId: string; segments: readonly { sequence: number; startTime: string; endTime: string; lateGraceMins: number; earlyGraceMins: number }[] }[]> => Array.from(this.projects.values()).map((project) => ({ projectId: project.id, segments: [{ sequence: 1, startTime: "08:00", endTime: "12:00", lateGraceMins: 0, earlyGraceMins: 0 }, { sequence: 2, startTime: "13:30", endTime: "17:30", lateGraceMins: 0, earlyGraceMins: 0 }] })) };
  readonly attendancePlan = { findMany: async (): Promise<[]> => [] };
  readonly attendanceRecord = { findMany: async (): Promise<[]> => [] };
  readonly makeupRequest = { findMany: async (): Promise<[]> => [] };
  readonly projectMemberHistory = { findMany: async (): Promise<[]> => [] };

  readonly users = new Map<string, UserRecord>();
  readonly sessions = new Map<string, SessionRecord>();
  readonly companies = new Map<string, CompanyRecord>();
  readonly projects = new Map<string, ProjectRecord>();
  readonly teams = new Map<string, TeamRecord>();
  readonly roles = new Map<RoleCode, RoleRecord>();
  readonly userRoles: UserRoleRecord[] = [];
  readonly workerMembers: ProjectWorkerMemberRecord[] = [];
  readonly managerMembers: ProjectManagerMemberRecord[] = [];
  readonly attendanceResults: AttendanceResultRecord[] = [];
  readonly schedules: ScheduleRecord[] = [];

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

  readonly company = {
    findUnique: async (args: CompanyFindUniqueArgs): Promise<CompanyRecord | null> =>
      this.companies.get(args.where.id) ?? null
  };

  readonly project = {
    findUnique: async (args: ProjectFindUniqueArgs): Promise<ProjectRecord | null> => this.projects.get(args.where.id) ?? null,
    findMany: async (args: ProjectFindManyArgs): Promise<ProjectRecord[]> => {
      const allProjects = Array.from(this.projects.values());
      if (args.where.companyId !== undefined) {
        return allProjects.filter((p: ProjectRecord): boolean => p.companyId === args.where.companyId);
      }
      return allProjects;
    }
  };

  readonly team = {
    findMany: async (): Promise<TeamRecord[]> => [...this.teams.values(), ...this.workerMembers.flatMap((m) => m.team === null ? [] : [m.team])],
    findUnique: async (args: TeamFindUniqueArgs): Promise<(TeamRecord & { readonly project: ProjectRecord }) | null> => {
      const teamRecord = this.teams.get(args.where.id);
      if (teamRecord === undefined) {
        return null;
      }
      const projectRecord = this.projects.get(teamRecord.projectId);
      if (projectRecord === undefined) {
        return null;
      }
      return { ...teamRecord, project: projectRecord };
    }
  };

  readonly projectWorkerMember = {
    findMany: async (args: ProjectMemberFindManyArgs): Promise<ProjectWorkerMemberRecord[]> =>
      this.workerMembers.filter(
        (member: ProjectWorkerMemberRecord): boolean =>
          matchesProjectIdFilter(member.projectId, args.where.projectId) &&
          (args.where.status === undefined || member.status === args.where.status) &&
          (args.where.requiresAttendance === undefined || member.requiresAttendance === args.where.requiresAttendance) &&
          (args.where.teamId === undefined || member.teamId === args.where.teamId)
      ).map((member) => ({ ...member, project: { name: member.projectId }, evaluation: null, enteredAt: new Date("2020-01-01"), exitedAt: member.status === "EXITED" ? new Date("2020-01-02") : null, worker: { encryptedName: "legacy-name", userId: null, ...member.worker } }))
  };

  readonly projectManagerMember = {
    findMany: async (args: ProjectMemberFindManyArgs): Promise<ProjectManagerMemberRecord[]> =>
      this.managerMembers.filter(
        (member: ProjectManagerMemberRecord): boolean =>
          matchesProjectIdFilter(member.projectId, args.where.projectId) &&
          (args.where.status === undefined || member.status === args.where.status) &&
          (args.where.requiresAttendance === undefined || member.requiresAttendance === args.where.requiresAttendance) &&
          (args.where.teamScopeId === undefined || member.teamScopeId === args.where.teamScopeId)
      ).map((member) => ({ ...member, project: { name: member.projectId }, evaluation: null, enteredAt: new Date("2020-01-01"), exitedAt: member.status === "EXITED" ? new Date("2020-01-02") : null, manager: { workType: null, userId: null, ...member.manager } }))
  };

  readonly attendanceResult = {
    findMany: async (args: AttendanceResultFindManyArgs): Promise<AttendanceResultRecord[]> =>
      this.attendanceResults.filter(
        (result: AttendanceResultRecord): boolean =>
          args.where.OR.some((owner) => owner.projectId === result.projectId) &&
          result.attendanceDate.getTime() >= args.where.attendanceDate.gte.getTime() &&
          result.attendanceDate.getTime() <= args.where.attendanceDate.lte.getTime()
      )
  };

  readonly schedule = {
    findMany: async (args: ScheduleFindManyArgs): Promise<ScheduleRecord[]> =>
      this.schedules.filter((schedule: ScheduleRecord): boolean => {
        const isOwnerMatched = matchesOwnerIdFilter(schedule.ownerId, args.where.ownerId) && schedule.ownerType === args.where.ownerType;
        const isStarted = args.where.startsOn === undefined || schedule.startsOn.getTime() <= args.where.startsOn.lte.getTime();
        const rangeStartDate = args.where.OR?.[1].endsOn.gte;
        const isNotEnded = rangeStartDate === undefined || schedule.endsOn === null || schedule.endsOn.getTime() >= rangeStartDate.getTime();

        return isOwnerMatched && isStarted && isNotEnded;
      }).map((row) => ({ ...row, shift: { name: "Legacy test shift", segments: [{ sequence: 1, startTime: "08:00", endTime: "12:00", lateGraceMins: 0, earlyGraceMins: 0 }, { sequence: 2, startTime: "13:30", endTime: "17:30", lateGraceMins: 0, earlyGraceMins: 0 }] } }))
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

const seedDirectRolePermissions = (prisma: ReportsPrismaTestDouble): void => {
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

const createApp = async (prisma: ReportsPrismaTestDouble): Promise<INestApplication> => {
  const moduleRef = await Test.createTestingModule({
    imports: [AuthModule, AuthorizationModule, ReportsModule]
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

describe("ReportsModule", (): void => {
  let app: INestApplication | undefined;
  let prisma: ReportsPrismaTestDouble;

  beforeEach((): void => {
    applyTestEnv();
    prisma = new ReportsPrismaTestDouble();
    seedDirectRolePermissions(prisma);
    prisma.seedActiveSession("viewer-user", "session-viewer");
    prisma.seedActiveSession("worker-user", "session-worker");
    prisma.projects.set("project-1", {
      companyId: "company-1",
      id: "project-1"
    });
    prisma.userRoles.push({
      role: prisma.roles.get("PROJECT_ADMIN") as RoleRecord,
      scopeId: "project-1",
      scopeType: "PROJECT",
      userId: "viewer-user"
    });
    const team: TeamRecord = {
      id: "team-1",
      name: "Steel Team",
      projectId: "project-1"
    };
    prisma.workerMembers.push({
      id: "worker-member-1",
      projectId: "project-1",
      projectRoleLabel: "Welder",
      requiresAttendance: true,
      status: "ACTIVE",
      team,
      teamId: "team-1",
      worker: {
        id: "worker-1",
        phone: "13800000001",
        workType: "Steel"
      },
      workerId: "worker-1"
    });
    prisma.workerMembers.push({
      id: "worker-member-2",
      projectId: "project-1",
      projectRoleLabel: "Carpenter",
      requiresAttendance: true,
      status: "ACTIVE",
      team,
      teamId: "team-1",
      worker: {
        id: "worker-2",
        phone: "13800000003",
        workType: "Woodwork"
      },
      workerId: "worker-2"
    });
    prisma.managerMembers.push({
      id: "manager-member-1",
      manager: {
        id: "manager-1",
        name: "Team Lead Zhang",
        phone: "13800000002"
      },
      managerId: "manager-1",
      projectId: "project-1",
      requiresAttendance: true,
      roleCode: "TEAM_LEADER",
      status: "ACTIVE",
      teamScope: team,
      teamScopeId: "team-1"
    });
    prisma.attendanceResults.push(
      {
        abnormalRecordCount: 1,
        approvedMakeupCount: 1,
        attendanceDate: new Date("2026-06-03T00:00:00.000Z"),
        id: "result-worker-day",
        isAbsent: false,
        isEarlyLeave: false,
        isLate: true,
        isMissingPunch: false,
        participantId: "worker-1",
        participantType: "WORKER",
        projectId: "project-1",
        workedMinutes: 480
      },
      {
        abnormalRecordCount: 0,
        approvedMakeupCount: 0,
        attendanceDate: new Date("2026-06-04T00:00:00.000Z"),
        id: "result-worker-second-day",
        isAbsent: false,
        isEarlyLeave: true,
        isLate: false,
        isMissingPunch: true,
        participantId: "worker-1",
        participantType: "WORKER",
        projectId: "project-1",
        workedMinutes: 300
      },
      {
        abnormalRecordCount: 0,
        approvedMakeupCount: 0,
        attendanceDate: new Date("2026-06-03T00:00:00.000Z"),
        id: "result-manager-day",
        isAbsent: false,
        isEarlyLeave: false,
        isLate: false,
        isMissingPunch: false,
        participantId: "manager-1",
        participantType: "MANAGER",
        projectId: "project-1",
        workedMinutes: 515
      }
    );
  });

  afterEach(async (): Promise<void> => {
    if (app !== undefined) {
      await app.close();
      app = undefined;
    }
  });

  test("daily report requires attendance view and includes absent participants without results", async (): Promise<void> => {
    app = await createApp(prisma);
    const workerAccessToken = await createAccessToken(app, "worker-user", "session-worker");
    const viewerAccessToken = await createAccessToken(app, "viewer-user", "session-viewer");

    await request(app.getHttpServer())
      .get("/reports/projects/project-1/daily?date=2026-06-03")
      .set("Authorization", `Bearer ${workerAccessToken}`)
      .expect(403);

    const response = await request(app.getHttpServer())
      .get("/reports/projects/project-1/daily?date=2026-06-03")
      .set("Authorization", `Bearer ${viewerAccessToken}`)
      .expect(200);

    expect(response.body).toEqual({
      endDate: "2026-06-03",
      participants: [
        {
          abnormalRecordCount: 1,
          approvedMakeupCount: 1,
          displayName: null,
          isAbsent: false,
          isEarlyLeave: false,
          isLate: true,
          isMissingPunch: false,
          memberId: "worker-member-1",
          memberStatus: "ACTIVE",
          participantId: "worker-1",
          participantType: "WORKER",
          phone: "13800000001",
          projectId: "project-1",
          projectName: "project-1",
          evaluation: null,
          projectRoleLabel: "Welder",
          requiresAttendance: true,
          teamId: "team-1",
          teamName: "Steel Team",
          workType: "Steel",
          workedMinutes: 480
        },
        {
          abnormalRecordCount: 0,
          approvedMakeupCount: 0,
          displayName: null,
          isAbsent: true,
          isEarlyLeave: false,
          isLate: false,
          isMissingPunch: true,
          memberId: "worker-member-2",
          memberStatus: "ACTIVE",
          participantId: "worker-2",
          participantType: "WORKER",
          phone: "13800000003",
          projectId: "project-1",
          projectName: "project-1",
          evaluation: null,
          projectRoleLabel: "Carpenter",
          requiresAttendance: true,
          teamId: "team-1",
          teamName: "Steel Team",
          workType: "Woodwork",
          workedMinutes: 0
        },
        {
          abnormalRecordCount: 0,
          approvedMakeupCount: 0,
          displayName: "Team Lead Zhang",
          isAbsent: false,
          isEarlyLeave: false,
          isLate: false,
          isMissingPunch: false,
          memberId: "manager-member-1",
          memberStatus: "ACTIVE",
          participantId: "manager-1",
          participantType: "MANAGER",
          phone: "13800000002",
          projectId: "project-1",
          projectName: "project-1",
          evaluation: null,
          projectRoleLabel: "TEAM_LEADER",
          requiresAttendance: true,
          teamId: "team-1",
          teamName: "Steel Team",
          workType: null,
          workedMinutes: 515
        }
      ],
      periodType: "DAILY",
      projectId: "project-1",
      startDate: "2026-06-03",
      totals: {
        abnormalRecordCount: 1,
        absenceCount: 1,
        actualAttendedDays: 2,
        approvedMakeupCount: 1,
        earlyLeaveCount: 0,
        lateCount: 1,
        missingPunchCount: 1,
        participantCount: 3,
        scheduledDays: 3,
        workedMinutes: 995
      }
    });
  });

  test("weekly and monthly reports aggregate natural day ranges", async (): Promise<void> => {
    app = await createApp(prisma);
    const viewerAccessToken = await createAccessToken(app, "viewer-user", "session-viewer");

    const weeklyResponse = await request(app.getHttpServer())
      .get("/reports/projects/project-1/weekly?weekStartDate=2026-06-01")
      .set("Authorization", `Bearer ${viewerAccessToken}`)
      .expect(200);

    expect(weeklyResponse.body).toMatchObject({
      endDate: "2026-06-07",
      periodType: "WEEKLY",
      projectId: "project-1",
      startDate: "2026-06-01",
      totals: {
        abnormalRecordCount: 1,
        absenceCount: 18,
        actualAttendedDays: 3,
        approvedMakeupCount: 1,
        earlyLeaveCount: 1,
        lateCount: 1,
        missingPunchCount: 19,
        participantCount: 3,
        scheduledDays: 21,
        workedMinutes: 1295
      }
    });
    expect(weeklyResponse.body.participants).toEqual([
      expect.objectContaining({
        absenceCount: 5,
        actualAttendedDays: 2,
        participantId: "worker-1",
        workedMinutes: 780
      }),
      expect.objectContaining({
        absenceCount: 7,
        actualAttendedDays: 0,
        participantId: "worker-2",
        workedMinutes: 0
      }),
      expect.objectContaining({
        absenceCount: 6,
        actualAttendedDays: 1,
        participantId: "manager-1",
        workedMinutes: 515
      })
    ]);

    const monthlyResponse = await request(app.getHttpServer())
      .get("/reports/projects/project-1/monthly?month=2026-06")
      .set("Authorization", `Bearer ${viewerAccessToken}`)
      .expect(200);

    expect(monthlyResponse.body).toMatchObject({
      endDate: "2026-06-30",
      periodType: "MONTHLY",
      projectId: "project-1",
      startDate: "2026-06-01",
      totals: {
        absenceCount: 87,
        actualAttendedDays: 3,
        participantCount: 3,
        scheduledDays: 90,
        workedMinutes: 1295
      }
    });
  });

  test("GET /reports/teams/:teamId/daily includes only team participants", async (): Promise<void> => {
    // Seed team-1 and team-2; worker-1 belongs to team-1; worker-2 belongs to team-2.
    // Give viewer-user TEAM_LEADER at team-1 scope so they have attendance.view.
    const team1: TeamRecord = { id: "team-1", name: "Steel Team", projectId: "project-1" };
    const team2: TeamRecord = { id: "team-2", name: "Wood Team", projectId: "project-1" };
    prisma.teams.set("team-1", team1);
    prisma.teams.set("team-2", team2);

    // Move worker-2 to team-2 (clear existing and re-seed)
    prisma.workerMembers.length = 0;
    prisma.managerMembers.length = 0;
    prisma.workerMembers.push({
      id: "worker-member-1",
      projectId: "project-1",
      projectRoleLabel: "Welder",
      requiresAttendance: true,
      status: "ACTIVE",
      team: team1,
      teamId: "team-1",
      worker: { id: "worker-1", phone: "13800000001", workType: "Steel" },
      workerId: "worker-1"
    });
    prisma.workerMembers.push({
      id: "worker-member-2",
      projectId: "project-1",
      projectRoleLabel: "Carpenter",
      requiresAttendance: true,
      status: "ACTIVE",
      team: team2,
      teamId: "team-2",
      worker: { id: "worker-2", phone: "13800000003", workType: "Woodwork" },
      workerId: "worker-2"
    });

    // Grant viewer-user TEAM_LEADER at team-1 scope
    prisma.userRoles.push({
      role: prisma.roles.get("TEAM_LEADER") as RoleRecord,
      scopeId: "team-1",
      scopeType: "TEAM",
      userId: "viewer-user"
    });

    app = await createApp(prisma);
    const viewerAccessToken = await createAccessToken(app, "viewer-user", "session-viewer");

    const response = await request(app.getHttpServer())
      .get("/reports/teams/team-1/daily?date=2026-06-03")
      .set("Authorization", `Bearer ${viewerAccessToken}`)
      .expect(200);

    expect(response.body.participants).toHaveLength(1);
    expect(response.body.participants[0].participantId).toBe("worker-1");
    expect(response.body.totals.participantCount).toBe(1);
    expect(response.body.projectId).toBe("project-1");
    expect(response.body.periodType).toBe("DAILY");
  });

  test("GET /reports/teams/:teamId/weekly includes only team participants", async (): Promise<void> => {
    const team1: TeamRecord = { id: "team-1", name: "Steel Team", projectId: "project-1" };
    const team2: TeamRecord = { id: "team-2", name: "Wood Team", projectId: "project-1" };
    prisma.teams.set("team-1", team1);
    prisma.teams.set("team-2", team2);

    prisma.workerMembers.length = 0;
    prisma.managerMembers.length = 0;
    prisma.workerMembers.push({
      id: "worker-member-1",
      projectId: "project-1",
      projectRoleLabel: "Welder",
      requiresAttendance: true,
      status: "ACTIVE",
      team: team1,
      teamId: "team-1",
      worker: { id: "worker-1", phone: "13800000001", workType: "Steel" },
      workerId: "worker-1"
    });
    prisma.workerMembers.push({
      id: "worker-member-2",
      projectId: "project-1",
      projectRoleLabel: "Carpenter",
      requiresAttendance: true,
      status: "ACTIVE",
      team: team2,
      teamId: "team-2",
      worker: { id: "worker-2", phone: "13800000003", workType: "Woodwork" },
      workerId: "worker-2"
    });

    prisma.userRoles.push({
      role: prisma.roles.get("TEAM_LEADER") as RoleRecord,
      scopeId: "team-1",
      scopeType: "TEAM",
      userId: "viewer-user"
    });

    app = await createApp(prisma);
    const viewerAccessToken = await createAccessToken(app, "viewer-user", "session-viewer");

    const response = await request(app.getHttpServer())
      .get("/reports/teams/team-1/weekly?weekStartDate=2026-06-02")
      .set("Authorization", `Bearer ${viewerAccessToken}`)
      .expect(200);

    expect(response.body.participants).toHaveLength(1);
    expect(response.body.participants[0].participantId).toBe("worker-1");
    expect(response.body.totals.participantCount).toBe(1);
    expect(response.body.periodType).toBe("WEEKLY");
  });

  test("GET /reports/teams/:teamId/monthly includes only team participants", async (): Promise<void> => {
    const team1: TeamRecord = { id: "team-1", name: "Steel Team", projectId: "project-1" };
    const team2: TeamRecord = { id: "team-2", name: "Wood Team", projectId: "project-1" };
    prisma.teams.set("team-1", team1);
    prisma.teams.set("team-2", team2);

    prisma.workerMembers.length = 0;
    prisma.managerMembers.length = 0;
    prisma.workerMembers.push({
      id: "worker-member-1",
      projectId: "project-1",
      projectRoleLabel: "Welder",
      requiresAttendance: true,
      status: "ACTIVE",
      team: team1,
      teamId: "team-1",
      worker: { id: "worker-1", phone: "13800000001", workType: "Steel" },
      workerId: "worker-1"
    });
    prisma.workerMembers.push({
      id: "worker-member-2",
      projectId: "project-1",
      projectRoleLabel: "Carpenter",
      requiresAttendance: true,
      status: "ACTIVE",
      team: team2,
      teamId: "team-2",
      worker: { id: "worker-2", phone: "13800000003", workType: "Woodwork" },
      workerId: "worker-2"
    });

    prisma.userRoles.push({
      role: prisma.roles.get("TEAM_LEADER") as RoleRecord,
      scopeId: "team-1",
      scopeType: "TEAM",
      userId: "viewer-user"
    });

    app = await createApp(prisma);
    const viewerAccessToken = await createAccessToken(app, "viewer-user", "session-viewer");

    const response = await request(app.getHttpServer())
      .get("/reports/teams/team-1/monthly?month=2026-06")
      .set("Authorization", `Bearer ${viewerAccessToken}`)
      .expect(200);

    expect(response.body.participants).toHaveLength(1);
    expect(response.body.participants[0].participantId).toBe("worker-1");
    expect(response.body.totals.participantCount).toBe(1);
    expect(response.body.periodType).toBe("MONTHLY");
  });

  test("GET /reports/teams/:teamId/daily returns 403 without attendance.view at team scope", async (): Promise<void> => {
    const team1: TeamRecord = { id: "team-1", name: "Steel Team", projectId: "project-1" };
    prisma.teams.set("team-1", team1);

    // worker-user has no attendance.view role — should be 403
    app = await createApp(prisma);
    const workerAccessToken = await createAccessToken(app, "worker-user", "session-worker");

    await request(app.getHttpServer())
      .get("/reports/teams/team-1/daily?date=2026-06-03")
      .set("Authorization", `Bearer ${workerAccessToken}`)
      .expect(403);
  });

  test("GET /reports/companies/:companyId/daily aggregates across all projects in the company", async (): Promise<void> => {
    // Use company-alpha (distinct from beforeEach's company-1) so project-1 members don't appear.
    // Seed: company-alpha with project-A and project-B; company-beta with project-C.
    prisma.companies.set("company-alpha", { id: "company-alpha" });
    prisma.companies.set("company-beta", { id: "company-beta" });
    prisma.projects.set("project-A", { companyId: "company-alpha", id: "project-A" });
    prisma.projects.set("project-B", { companyId: "company-alpha", id: "project-B" });
    prisma.projects.set("project-C", { companyId: "company-beta", id: "project-C" });

    // worker-A1 in project-A, worker-B1 in project-B, worker-C1 in project-C
    prisma.workerMembers.push({
      id: "member-A1",
      projectId: "project-A",
      projectRoleLabel: "Worker",
      requiresAttendance: true,
      status: "ACTIVE",
      team: null,
      teamId: null,
      worker: { id: "worker-A1", phone: "13900000001", workType: "General" },
      workerId: "worker-A1"
    });
    prisma.workerMembers.push({
      id: "member-B1",
      projectId: "project-B",
      projectRoleLabel: "Worker",
      requiresAttendance: true,
      status: "ACTIVE",
      team: null,
      teamId: null,
      worker: { id: "worker-B1", phone: "13900000002", workType: "General" },
      workerId: "worker-B1"
    });
    prisma.workerMembers.push({
      id: "member-C1",
      projectId: "project-C",
      projectRoleLabel: "Worker",
      requiresAttendance: true,
      status: "ACTIVE",
      team: null,
      teamId: null,
      worker: { id: "worker-C1", phone: "13900000003", workType: "General" },
      workerId: "worker-C1"
    });

    // Grant viewer-user COMPANY_ADMIN at company-alpha scope
    prisma.userRoles.push({
      role: prisma.roles.get("COMPANY_ADMIN") as RoleRecord,
      scopeId: "company-alpha",
      scopeType: "COMPANY",
      userId: "viewer-user"
    });

    app = await createApp(prisma);
    const viewerAccessToken = await createAccessToken(app, "viewer-user", "session-viewer");

    const response = await request(app.getHttpServer())
      .get("/reports/companies/company-alpha/daily?date=2026-06-03")
      .set("Authorization", `Bearer ${viewerAccessToken}`)
      .expect(200);

    const participantIds: string[] = (response.body.participants as { participantId: string }[]).map(
      (p): string => p.participantId
    );
    expect(participantIds).toContain("worker-A1");
    expect(participantIds).toContain("worker-B1");
    expect(participantIds).not.toContain("worker-C1");
    expect(response.body.totals.participantCount).toBe(2);
    expect(response.body.projectId).toBe("company-alpha");
    expect(response.body.periodType).toBe("DAILY");
  });

  test("GET /reports/companies/:companyId/weekly aggregates across all projects", async (): Promise<void> => {
    prisma.companies.set("company-alpha", { id: "company-alpha" });
    prisma.companies.set("company-beta", { id: "company-beta" });
    prisma.projects.set("project-A", { companyId: "company-alpha", id: "project-A" });
    prisma.projects.set("project-B", { companyId: "company-alpha", id: "project-B" });
    prisma.projects.set("project-C", { companyId: "company-beta", id: "project-C" });

    prisma.workerMembers.push({
      id: "member-A1",
      projectId: "project-A",
      projectRoleLabel: "Worker",
      requiresAttendance: true,
      status: "ACTIVE",
      team: null,
      teamId: null,
      worker: { id: "worker-A1", phone: "13900000001", workType: "General" },
      workerId: "worker-A1"
    });
    prisma.workerMembers.push({
      id: "member-B1",
      projectId: "project-B",
      projectRoleLabel: "Worker",
      requiresAttendance: true,
      status: "ACTIVE",
      team: null,
      teamId: null,
      worker: { id: "worker-B1", phone: "13900000002", workType: "General" },
      workerId: "worker-B1"
    });
    prisma.workerMembers.push({
      id: "member-C1",
      projectId: "project-C",
      projectRoleLabel: "Worker",
      requiresAttendance: true,
      status: "ACTIVE",
      team: null,
      teamId: null,
      worker: { id: "worker-C1", phone: "13900000003", workType: "General" },
      workerId: "worker-C1"
    });

    prisma.userRoles.push({
      role: prisma.roles.get("COMPANY_ADMIN") as RoleRecord,
      scopeId: "company-alpha",
      scopeType: "COMPANY",
      userId: "viewer-user"
    });

    app = await createApp(prisma);
    const viewerAccessToken = await createAccessToken(app, "viewer-user", "session-viewer");

    const response = await request(app.getHttpServer())
      .get("/reports/companies/company-alpha/weekly?weekStartDate=2026-06-02")
      .set("Authorization", `Bearer ${viewerAccessToken}`)
      .expect(200);

    const participantIds: string[] = (response.body.participants as { participantId: string }[]).map(
      (p): string => p.participantId
    );
    expect(participantIds).toContain("worker-A1");
    expect(participantIds).toContain("worker-B1");
    expect(participantIds).not.toContain("worker-C1");
    expect(response.body.totals.participantCount).toBe(2);
    expect(response.body.projectId).toBe("company-alpha");
    expect(response.body.periodType).toBe("WEEKLY");
  });

  test("GET /reports/companies/:companyId/monthly aggregates across all projects", async (): Promise<void> => {
    prisma.companies.set("company-alpha", { id: "company-alpha" });
    prisma.companies.set("company-beta", { id: "company-beta" });
    prisma.projects.set("project-A", { companyId: "company-alpha", id: "project-A" });
    prisma.projects.set("project-B", { companyId: "company-alpha", id: "project-B" });
    prisma.projects.set("project-C", { companyId: "company-beta", id: "project-C" });

    prisma.workerMembers.push({
      id: "member-A1",
      projectId: "project-A",
      projectRoleLabel: "Worker",
      requiresAttendance: true,
      status: "ACTIVE",
      team: null,
      teamId: null,
      worker: { id: "worker-A1", phone: "13900000001", workType: "General" },
      workerId: "worker-A1"
    });
    prisma.workerMembers.push({
      id: "member-B1",
      projectId: "project-B",
      projectRoleLabel: "Worker",
      requiresAttendance: true,
      status: "ACTIVE",
      team: null,
      teamId: null,
      worker: { id: "worker-B1", phone: "13900000002", workType: "General" },
      workerId: "worker-B1"
    });
    prisma.workerMembers.push({
      id: "member-C1",
      projectId: "project-C",
      projectRoleLabel: "Worker",
      requiresAttendance: true,
      status: "ACTIVE",
      team: null,
      teamId: null,
      worker: { id: "worker-C1", phone: "13900000003", workType: "General" },
      workerId: "worker-C1"
    });

    prisma.userRoles.push({
      role: prisma.roles.get("COMPANY_ADMIN") as RoleRecord,
      scopeId: "company-alpha",
      scopeType: "COMPANY",
      userId: "viewer-user"
    });

    app = await createApp(prisma);
    const viewerAccessToken = await createAccessToken(app, "viewer-user", "session-viewer");

    const response = await request(app.getHttpServer())
      .get("/reports/companies/company-alpha/monthly?month=2026-06")
      .set("Authorization", `Bearer ${viewerAccessToken}`)
      .expect(200);

    const participantIds: string[] = (response.body.participants as { participantId: string }[]).map(
      (p): string => p.participantId
    );
    expect(participantIds).toContain("worker-A1");
    expect(participantIds).toContain("worker-B1");
    expect(participantIds).not.toContain("worker-C1");
    expect(response.body.totals.participantCount).toBe(2);
    expect(response.body.projectId).toBe("company-alpha");
    expect(response.body.periodType).toBe("MONTHLY");
  });

  test("GET /reports/companies/:companyId/daily returns 403 without attendance.view at the company scope", async (): Promise<void> => {
    prisma.companies.set("company-alpha", { id: "company-alpha" });
    prisma.projects.set("project-A", { companyId: "company-alpha", id: "project-A" });

    // worker-user has no role at company-alpha
    app = await createApp(prisma);
    const workerAccessToken = await createAccessToken(app, "worker-user", "session-worker");

    await request(app.getHttpServer())
      .get("/reports/companies/company-alpha/daily?date=2026-06-03")
      .set("Authorization", `Bearer ${workerAccessToken}`)
      .expect(403);
  });

  test("weekly and monthly reports count only scheduled workdays when a project schedule exists", async (): Promise<void> => {
    app = await createApp(prisma);
    const viewerAccessToken = await createAccessToken(app, "viewer-user", "session-viewer");
    prisma.schedules.push({
      endsOn: new Date("2026-06-30T00:00:00.000Z"),
      id: "schedule-1",
      ownerId: "project-1",
      ownerType: "PROJECT",
      shiftId: "shift-1",
      startsOn: new Date("2026-06-01T00:00:00.000Z"),
      workdayMask: 63
    });
    prisma.attendanceResults.push({
      abnormalRecordCount: 0,
      approvedMakeupCount: 0,
      attendanceDate: new Date("2026-06-07T00:00:00.000Z"),
      id: "result-worker-rest-day",
      isAbsent: false,
      isEarlyLeave: false,
      isLate: false,
      isMissingPunch: false,
      participantId: "worker-1",
      participantType: "WORKER",
      projectId: "project-1",
      workedMinutes: 480
    });

    const dailyRestResponse = await request(app.getHttpServer())
      .get("/reports/projects/project-1/daily?date=2026-06-07")
      .set("Authorization", `Bearer ${viewerAccessToken}`)
      .expect(200);

    expect(dailyRestResponse.body).toMatchObject({
      endDate: "2026-06-07",
      periodType: "DAILY",
      projectId: "project-1",
      startDate: "2026-06-07",
      totals: {
        absenceCount: 0,
        actualAttendedDays: 0,
        missingPunchCount: 0,
        participantCount: 3,
        scheduledDays: 0,
        workedMinutes: 480
      }
    });
    expect(dailyRestResponse.body.participants).toEqual([
      expect.objectContaining({
        isAbsent: false,
        isMissingPunch: false,
        participantId: "worker-1",
        workedMinutes: 480
      }),
      expect.objectContaining({
        isAbsent: false,
        isMissingPunch: false,
        participantId: "worker-2",
        workedMinutes: 0
      }),
      expect.objectContaining({
        isAbsent: false,
        isMissingPunch: false,
        participantId: "manager-1",
        workedMinutes: 0
      })
    ]);

    const weeklyResponse = await request(app.getHttpServer())
      .get("/reports/projects/project-1/weekly?weekStartDate=2026-06-01")
      .set("Authorization", `Bearer ${viewerAccessToken}`)
      .expect(200);

    expect(weeklyResponse.body).toMatchObject({
      endDate: "2026-06-07",
      periodType: "WEEKLY",
      projectId: "project-1",
      startDate: "2026-06-01",
      totals: {
        absenceCount: 15,
        actualAttendedDays: 3,
        missingPunchCount: 16,
        participantCount: 3,
        scheduledDays: 18,
        workedMinutes: 1775
      }
    });
    expect(weeklyResponse.body.participants).toEqual([
      expect.objectContaining({
        absenceCount: 4,
        actualAttendedDays: 2,
        participantId: "worker-1",
        scheduledDays: 6,
        workedMinutes: 1260
      }),
      expect.objectContaining({
        absenceCount: 6,
        actualAttendedDays: 0,
        participantId: "worker-2",
        scheduledDays: 6,
        workedMinutes: 0
      }),
      expect.objectContaining({
        absenceCount: 5,
        actualAttendedDays: 1,
        participantId: "manager-1",
        scheduledDays: 6,
        workedMinutes: 515
      })
    ]);

    const monthlyResponse = await request(app.getHttpServer())
      .get("/reports/projects/project-1/monthly?month=2026-06")
      .set("Authorization", `Bearer ${viewerAccessToken}`)
      .expect(200);

    expect(monthlyResponse.body).toMatchObject({
      endDate: "2026-06-30",
      periodType: "MONTHLY",
      projectId: "project-1",
      startDate: "2026-06-01",
      totals: {
        absenceCount: 75,
        actualAttendedDays: 3,
        participantCount: 3,
        scheduledDays: 78,
        workedMinutes: 1775
      }
    });

    const outsideScheduleResponse = await request(app.getHttpServer())
      .get("/reports/projects/project-1/daily?date=2026-07-01")
      .set("Authorization", `Bearer ${viewerAccessToken}`)
      .expect(200);

    expect(outsideScheduleResponse.body).toMatchObject({
      endDate: "2026-07-01",
      periodType: "DAILY",
      projectId: "project-1",
      startDate: "2026-07-01",
      totals: {
        absenceCount: 0,
        actualAttendedDays: 0,
        missingPunchCount: 0,
        participantCount: 3,
        scheduledDays: 0,
        workedMinutes: 0
      }
    });
  });
});
