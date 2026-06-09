import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import type { RoleCode } from "@construction/domain";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { AuthModule } from "../src/auth/auth.module.js";
import { AttendanceModule } from "../src/attendance/attendance.module.js";
import { AuthorizationModule } from "../src/authorization/authorization.module.js";
import { PrismaService } from "../src/infrastructure/database/prisma.service.js";
import { FACE_VERIFICATION_CONNECTOR } from "../src/infrastructure/face/face-verification.types.js";

type UserStatusValue = "ACTIVE" | "DISABLED";
type ScopeTypeValue = "GLOBAL" | "COMPANY" | "PROJECT" | "TEAM";
type ProjectStatusValue = "PREPARING" | "ACTIVE" | "SUSPENDED" | "COMPLETED";
type MemberStatusValue = "ACTIVE" | "EXITED" | "SUSPENDED";
type AttendancePointCodeValue = "SEGMENT_1_START" | "SEGMENT_1_END" | "SEGMENT_2_START" | "SEGMENT_2_END";
type AttendanceRecordStatusValue = "VALID" | "INVALID";
type ProfileOwnerTypeValue = "WORKER" | "MANAGER";

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
  readonly centerLatitude: string;
  readonly centerLongitude: string;
  readonly companyId: string;
  readonly geofenceRadiusM: number;
  readonly id: string;
  readonly status: ProjectStatusValue;
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

type ScheduleRecord = {
  readonly createdAt: Date;
  readonly endsOn: Date | null;
  readonly id: string;
  readonly ownerId: string;
  readonly ownerType: string;
  readonly shiftId: string;
  readonly startsOn: Date;
  readonly workdayMask: number;
};

type ScheduleWithShiftRecord = ScheduleRecord & {
  readonly shift: ShiftWithSegments;
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

type AttendanceRecordRecord = {
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
  readonly source: "DEVICE";
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

type ShiftUpdateManyArgs = {
  readonly data: {
    readonly isDefault: boolean;
  };
  readonly where: {
    readonly projectId: string;
  };
};

type ShiftCreateArgs = {
  readonly data: {
    readonly isDefault: boolean;
    readonly name: string;
    readonly projectId: string;
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

type ScheduleDeleteManyArgs = {
  readonly where: {
    readonly ownerId: string;
    readonly ownerType: string;
  };
};

type ScheduleCreateArgs = {
  readonly data: {
    readonly endsOn: Date | null;
    readonly ownerId: string;
    readonly ownerType: string;
    readonly shiftId: string;
    readonly startsOn: Date;
    readonly workdayMask: number;
  };
};

type ScheduleFindManyArgs = {
  readonly include?: {
    readonly shift?: {
      readonly include?: {
        readonly segments?: boolean;
      };
    };
  };
  readonly orderBy?: {
    readonly startsOn: "desc";
  };
  readonly where: {
    readonly ownerId: string;
    readonly ownerType: string;
  };
};

type ShiftSegmentCreateArgs = {
  readonly data: {
    readonly earlyGraceMins: number;
    readonly endTime: string;
    readonly lateGraceMins: number;
    readonly sequence: number;
    readonly shiftId: string;
    readonly startTime: string;
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

type AttendanceRecordCreateArgs = {
  readonly data: Omit<AttendanceRecordRecord, "id">;
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

type ShiftWithSegments = ShiftRecord & {
  readonly segments: readonly ShiftSegmentRecord[];
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

class AttendancePrismaTestDouble {
  readonly users = new Map<string, UserRecord>();
  readonly sessions = new Map<string, SessionRecord>();
  readonly projects = new Map<string, ProjectRecord>();
  readonly roles = new Map<RoleCode, RoleRecord>();
  readonly userRoles: UserRoleRecord[] = [];
  readonly shifts = new Map<string, ShiftRecord>();
  readonly shiftSegments = new Map<string, ShiftSegmentRecord>();
  readonly schedules = new Map<string, ScheduleRecord>();
  readonly workerProfiles = new Map<string, WorkerProfileRecord>();
  readonly managerProfiles = new Map<string, ManagerProfileRecord>();
  readonly attendanceRecords = new Map<string, AttendanceRecordRecord>();
  readonly attendanceResults = new Map<string, AttendanceResultRecord>();

  private shiftSequence = 0;
  private shiftSegmentSequence = 0;
  private scheduleSequence = 0;
  private attendanceRecordSequence = 0;
  private attendanceResultSequence = 0;

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

  readonly shift = {
    create: async (args: ShiftCreateArgs): Promise<ShiftRecord> => {
      this.shiftSequence += 1;
      const shift: ShiftRecord = {
        id: `shift-${this.shiftSequence}`,
        isDefault: args.data.isDefault,
        name: args.data.name,
        projectId: args.data.projectId
      };
      this.shifts.set(shift.id, shift);
      return shift;
    },
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
    },
    updateMany: async (args: ShiftUpdateManyArgs): Promise<{ readonly count: number }> => {
      let count = 0;

      for (const shift of this.shifts.values()) {
        if (shift.projectId === args.where.projectId) {
          this.shifts.set(shift.id, {
            ...shift,
            isDefault: args.data.isDefault
          });
          count += 1;
        }
      }

      return { count };
    }
  };

  readonly shiftSegment = {
    create: async (args: ShiftSegmentCreateArgs): Promise<ShiftSegmentRecord> => {
      this.shiftSegmentSequence += 1;
      const segment: ShiftSegmentRecord = {
        earlyGraceMins: args.data.earlyGraceMins,
        endTime: args.data.endTime,
        id: `shift-segment-${this.shiftSegmentSequence}`,
        lateGraceMins: args.data.lateGraceMins,
        sequence: args.data.sequence,
        shiftId: args.data.shiftId,
        startTime: args.data.startTime
      };
      this.shiftSegments.set(segment.id, segment);
      return segment;
    }
  };

  readonly schedule = {
    create: async (args: ScheduleCreateArgs): Promise<ScheduleRecord> => {
      this.scheduleSequence += 1;
      const schedule: ScheduleRecord = {
        createdAt: new Date("2026-06-03T00:00:00.000Z"),
        endsOn: args.data.endsOn,
        id: `schedule-${this.scheduleSequence}`,
        ownerId: args.data.ownerId,
        ownerType: args.data.ownerType,
        shiftId: args.data.shiftId,
        startsOn: args.data.startsOn,
        workdayMask: args.data.workdayMask
      };
      this.schedules.set(schedule.id, schedule);
      return schedule;
    },
    deleteMany: async (args: ScheduleDeleteManyArgs): Promise<{ readonly count: number }> => {
      let count = 0;

      for (const schedule of this.schedules.values()) {
        if (schedule.ownerId === args.where.ownerId && schedule.ownerType === args.where.ownerType) {
          this.schedules.delete(schedule.id);
          count += 1;
        }
      }

      return { count };
    },
    findMany: async (args: ScheduleFindManyArgs): Promise<readonly (ScheduleRecord | ScheduleWithShiftRecord)[]> => {
      const schedules = Array.from(this.schedules.values()).filter(
        (schedule: ScheduleRecord): boolean =>
          schedule.ownerId === args.where.ownerId && schedule.ownerType === args.where.ownerType
      );
      const orderedSchedules =
        args.orderBy?.startsOn === "desc"
          ? schedules.sort((left: ScheduleRecord, right: ScheduleRecord): number => right.startsOn.getTime() - left.startsOn.getTime())
          : schedules;

      if (args.include?.shift === undefined) {
        return orderedSchedules;
      }

      return orderedSchedules.map((schedule: ScheduleRecord): ScheduleWithShiftRecord => {
        const shift = this.shifts.get(schedule.shiftId);

        if (shift === undefined) {
          throw new Error(
            JSON.stringify({
              message: "Missing shift for schedule",
              scheduleId: schedule.id,
              shiftId: schedule.shiftId
            })
          );
        }

        return {
          ...schedule,
          shift: {
            ...shift,
            segments: Array.from(this.shiftSegments.values()).filter(
              (segment: ShiftSegmentRecord): boolean => segment.shiftId === shift.id
            )
          }
        };
      });
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
          projectMemberships: profile.projectMemberships.filter(
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
          projectMemberships: profile.projectMemberships.filter(
            (member: ProjectManagerMemberRecord): boolean =>
              member.projectId === args.include?.projectMemberships?.where.projectId
          )
        };
      }

      return profile;
    }
  };

  readonly attendanceRecord = {
    create: async (args: AttendanceRecordCreateArgs): Promise<AttendanceRecordRecord> => {
      this.attendanceRecordSequence += 1;
      const record: AttendanceRecordRecord = {
        ...args.data,
        id: `attendance-record-${this.attendanceRecordSequence}`
      };
      this.attendanceRecords.set(record.id, record);
      return record;
    },
    findMany: async (args: AttendanceRecordFindManyArgs): Promise<AttendanceRecordRecord[]> =>
      Array.from(this.attendanceRecords.values()).filter(
        (record: AttendanceRecordRecord): boolean =>
          record.projectId === args.where.projectId &&
          record.participantType === args.where.participantType &&
          record.participantId === args.where.participantId &&
          record.attendanceDate.getTime() === args.where.attendanceDate.getTime()
      )
  };

  readonly makeupRequest = {
    findMany: async (): Promise<[]> => []
  };

  readonly attendanceResult = {
    upsert: async (args: AttendanceResultUpsertArgs): Promise<AttendanceResultRecord> => {
      const unique = args.where.projectId_attendanceDate_participantType_participantId;
      const key = `${unique.projectId}:${unique.attendanceDate.toISOString()}:${unique.participantType}:${unique.participantId}`;
      const existing = this.attendanceResults.get(key);

      if (existing === undefined) {
        this.attendanceResultSequence += 1;
        const created: AttendanceResultRecord = {
          ...args.create,
          id: `attendance-result-${this.attendanceResultSequence}`
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

  async $transaction<T>(callback: (transaction: AttendancePrismaTestDouble) => Promise<T>): Promise<T> {
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

const seedDirectRolePermissions = (prisma: AttendancePrismaTestDouble): void => {
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

const createApp = async (prisma: AttendancePrismaTestDouble, faceScore = 95): Promise<INestApplication> => {
  const moduleRef = await Test.createTestingModule({
    imports: [AuthModule, AuthorizationModule, AttendanceModule]
  })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .overrideProvider(FACE_VERIFICATION_CONNECTOR)
    .useValue({ verifyFace: async () => ({ detected: true, score: faceScore }) })
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

const attendanceBody = (
  attendanceDate: string,
  pointCode: AttendancePointCodeValue,
  occurredAt: string,
  latitude: string,
  longitude: string
): Record<string, unknown> => ({
  attendanceDate,
  latitude,
  locationAccuracyM: "5.00",
  longitude,
  occurredAt,
  pointCode,
  selfieHash: `selfie-hash-${pointCode}`,
  selfieObjectKey: `selfies/${pointCode}.jpg`,
  sitePhotoHash: `site-photo-hash-${pointCode}`,
  sitePhotoObjectKey: `site-photos/${pointCode}.jpg`
});

describe("AttendanceModule", (): void => {
  let app: INestApplication | undefined;
  let prisma: AttendancePrismaTestDouble;

  beforeEach((): void => {
    applyTestEnv();
    prisma = new AttendancePrismaTestDouble();
    seedDirectRolePermissions(prisma);
    prisma.projects.set("project-1", {
      centerLatitude: "31.2304000",
      centerLongitude: "121.4737000",
      companyId: "company-1",
      geofenceRadiusM: 300,
      id: "project-1",
      status: "ACTIVE"
    });
    prisma.seedActiveSession("project-admin-user", "session-project-admin");
    prisma.seedActiveSession("worker-user", "session-worker");
    prisma.seedActiveSession("manager-user", "session-manager");
    prisma.seedActiveSession("unbound-user", "session-unbound");
    prisma.userRoles.push({
      role: prisma.roles.get("PROJECT_ADMIN") as RoleRecord,
      scopeId: "project-1",
      scopeType: "PROJECT",
      userId: "project-admin-user"
    });
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
    prisma.managerProfiles.set("manager-1", {
      id: "manager-1",
      name: "Team Lead Zhang",
      phone: "13800000002",
      projectMemberships: [
        {
          id: "manager-member-1",
          managerId: "manager-1",
          projectId: "project-1",
          requiresAttendance: true,
          roleCode: "TEAM_LEADER",
          status: "ACTIVE",
          teamScopeId: "team-1"
        }
      ],
      userId: "manager-user"
    });
  });

  afterEach(async (): Promise<void> => {
    if (app !== undefined) {
      await app.close();
      app = undefined;
    }
  });

  test("configures a default shift and recalculates worker attendance from four valid points", async (): Promise<void> => {
    app = await createApp(prisma);
    const projectAdminAccessToken = await createAccessToken(app, "project-admin-user", "session-project-admin");
    const workerAccessToken = await createAccessToken(app, "worker-user", "session-worker");

    const shiftResponse = await request(app.getHttpServer())
      .put("/attendance/projects/project-1/default-shift")
      .set("Authorization", `Bearer ${projectAdminAccessToken}`)
      .send({
        name: "Standard Day",
        segments: [
          {
            earlyGraceMins: 0,
            endTime: "12:00",
            lateGraceMins: 5,
            sequence: 1,
            startTime: "08:00"
          },
          {
            earlyGraceMins: 5,
            endTime: "18:00",
            lateGraceMins: 0,
            sequence: 2,
            startTime: "13:30"
          }
        ]
      })
      .expect(200);

    expect(shiftResponse.body).toEqual({
      id: "shift-1",
      isDefault: true,
      name: "Standard Day",
      projectId: "project-1",
      segments: [
        {
          earlyGraceMins: 0,
          endTime: "12:00",
          id: "shift-segment-1",
          lateGraceMins: 5,
          sequence: 1,
          shiftId: "shift-1",
          startTime: "08:00"
        },
        {
          earlyGraceMins: 5,
          endTime: "18:00",
          id: "shift-segment-2",
          lateGraceMins: 0,
          sequence: 2,
          shiftId: "shift-1",
          startTime: "13:30"
        }
      ]
    });

    await request(app.getHttpServer())
      .post("/attendance/projects/project-1/records")
      .set("Authorization", `Bearer ${workerAccessToken}`)
      .send(attendanceBody("2026-06-03", "SEGMENT_1_START", "2026-06-03T08:01:00.000+08:00", "31.2304000", "121.4737000"))
      .expect(201);
    await request(app.getHttpServer())
      .post("/attendance/projects/project-1/records")
      .set("Authorization", `Bearer ${workerAccessToken}`)
      .send(attendanceBody("2026-06-03", "SEGMENT_1_END", "2026-06-03T12:03:00.000+08:00", "31.2304000", "121.4737000"))
      .expect(201);
    await request(app.getHttpServer())
      .post("/attendance/projects/project-1/records")
      .set("Authorization", `Bearer ${workerAccessToken}`)
      .send(attendanceBody("2026-06-03", "SEGMENT_2_START", "2026-06-03T13:29:00.000+08:00", "31.2304000", "121.4737000"))
      .expect(201);
    const fourthResponse = await request(app.getHttpServer())
      .post("/attendance/projects/project-1/records")
      .set("Authorization", `Bearer ${workerAccessToken}`)
      .send(attendanceBody("2026-06-03", "SEGMENT_2_END", "2026-06-03T18:02:00.000+08:00", "31.2304000", "121.4737000"))
      .expect(201);

    expect(fourthResponse.body.record).toMatchObject({
      abnormalReason: null,
      attendanceDate: "2026-06-03",
      facePassed: true,
      faceScore: "95",
      geofenceDistanceM: "0.00",
      id: "attendance-record-4",
      participantId: "worker-1",
      participantType: "WORKER",
      pointCode: "SEGMENT_2_END",
      projectId: "project-1",
      status: "VALID"
    });
    expect(fourthResponse.body.result).toEqual({
      attendanceDate: "2026-06-03",
      isAbsent: false,
      isEarlyLeave: false,
      isLate: false,
      isMissingPunch: false,
      participantId: "worker-1",
      participantType: "WORKER",
      projectId: "project-1",
      workedMinutes: 515
    });
  });

  test("configures project default schedule and rejects rest-day attendance", async (): Promise<void> => {
    app = await createApp(prisma);
    const projectAdminAccessToken = await createAccessToken(app, "project-admin-user", "session-project-admin");
    const workerAccessToken = await createAccessToken(app, "worker-user", "session-worker");

    await request(app.getHttpServer())
      .put("/attendance/projects/project-1/default-shift")
      .set("Authorization", `Bearer ${projectAdminAccessToken}`)
      .send({
        name: "Six Day Shift",
        segments: [
          {
            earlyGraceMins: 0,
            endTime: "12:00",
            lateGraceMins: 5,
            sequence: 1,
            startTime: "08:00"
          },
          {
            earlyGraceMins: 5,
            endTime: "18:00",
            lateGraceMins: 0,
            sequence: 2,
            startTime: "13:30"
          }
        ]
      })
      .expect(200);

    await request(app.getHttpServer())
      .put("/attendance/projects/project-1/default-schedule")
      .set("Authorization", `Bearer ${workerAccessToken}`)
      .send({
        endsOn: "2026-06-30",
        startsOn: "2026-06-01",
        workdays: [1, 2, 3, 4, 5, 6]
      })
      .expect(403);

    const scheduleResponse = await request(app.getHttpServer())
      .put("/attendance/projects/project-1/default-schedule")
      .set("Authorization", `Bearer ${projectAdminAccessToken}`)
      .send({
        endsOn: "2026-06-30",
        startsOn: "2026-06-01",
        workdays: [1, 2, 3, 4, 5, 6]
      })
      .expect(200);

    expect(scheduleResponse.body).toEqual({
      endsOn: "2026-06-30",
      id: "schedule-1",
      ownerId: "project-1",
      ownerType: "PROJECT",
      shiftId: "shift-1",
      startsOn: "2026-06-01",
      workdays: [1, 2, 3, 4, 5, 6]
    });

    await request(app.getHttpServer())
      .put("/attendance/projects/project-1/default-schedule")
      .set("Authorization", `Bearer ${projectAdminAccessToken}`)
      .send({
        endsOn: "2026-06-30",
        startsOn: "2026-06-01",
        workdays: [1, 1, 2]
      })
      .expect(400);

    await request(app.getHttpServer())
      .put("/attendance/projects/project-1/default-schedule")
      .set("Authorization", `Bearer ${projectAdminAccessToken}`)
      .send({
        endsOn: "2026-05-31",
        startsOn: "2026-06-01",
        workdays: [1, 2, 3]
      })
      .expect(400);

    const replacementScheduleResponse = await request(app.getHttpServer())
      .put("/attendance/projects/project-1/default-schedule")
      .set("Authorization", `Bearer ${projectAdminAccessToken}`)
      .send({
        endsOn: null,
        startsOn: "2026-06-01",
        workdays: [1, 2, 3, 4, 5, 6]
      })
      .expect(200);

    expect(replacementScheduleResponse.body).toEqual({
      endsOn: null,
      id: "schedule-2",
      ownerId: "project-1",
      ownerType: "PROJECT",
      shiftId: "shift-1",
      startsOn: "2026-06-01",
      workdays: [1, 2, 3, 4, 5, 6]
    });
    expect(prisma.schedules.size).toBe(1);

    const scheduledDayResponse = await request(app.getHttpServer())
      .post("/attendance/projects/project-1/records")
      .set("Authorization", `Bearer ${workerAccessToken}`)
      .send(attendanceBody("2026-06-08", "SEGMENT_1_START", "2026-06-08T08:00:00.000+08:00", "31.2304000", "121.4737000"))
      .expect(201);

    expect(scheduledDayResponse.body.record).toMatchObject({
      attendanceDate: "2026-06-08",
      participantId: "worker-1",
      participantType: "WORKER",
      status: "VALID"
    });

    await request(app.getHttpServer())
      .post("/attendance/projects/project-1/records")
      .set("Authorization", `Bearer ${workerAccessToken}`)
      .send(attendanceBody("2026-06-07", "SEGMENT_1_START", "2026-06-07T08:00:00.000+08:00", "31.2304000", "121.4737000"))
      .expect(400);

    expect(prisma.attendanceRecords.size).toBe(1);
  });

  test("allows an attendance-required manager member to submit without project attendance permission", async (): Promise<void> => {
    app = await createApp(prisma);
    const projectAdminAccessToken = await createAccessToken(app, "project-admin-user", "session-project-admin");
    const managerAccessToken = await createAccessToken(app, "manager-user", "session-manager");

    await request(app.getHttpServer())
      .put("/attendance/projects/project-1/default-shift")
      .set("Authorization", `Bearer ${projectAdminAccessToken}`)
      .send({
        name: "Standard Day",
        segments: [
          {
            earlyGraceMins: 0,
            endTime: "12:00",
            lateGraceMins: 5,
            sequence: 1,
            startTime: "08:00"
          },
          {
            earlyGraceMins: 5,
            endTime: "18:00",
            lateGraceMins: 0,
            sequence: 2,
            startTime: "13:30"
          }
        ]
      })
      .expect(200);

    const response = await request(app.getHttpServer())
      .post("/attendance/projects/project-1/records")
      .set("Authorization", `Bearer ${managerAccessToken}`)
      .send(attendanceBody("2026-06-03", "SEGMENT_1_START", "2026-06-03T08:00:00.000+08:00", "31.2304000", "121.4737000"))
      .expect(201);

    expect(response.body.record).toMatchObject({
      participantId: "manager-1",
      participantType: "MANAGER",
      status: "VALID"
    });
  });

  test("stores outside-geofence attempts as invalid records excluded from the daily result", async (): Promise<void> => {
    app = await createApp(prisma);
    const projectAdminAccessToken = await createAccessToken(app, "project-admin-user", "session-project-admin");
    const workerAccessToken = await createAccessToken(app, "worker-user", "session-worker");

    await request(app.getHttpServer())
      .put("/attendance/projects/project-1/default-shift")
      .set("Authorization", `Bearer ${projectAdminAccessToken}`)
      .send({
        name: "Standard Day",
        segments: [
          {
            earlyGraceMins: 0,
            endTime: "12:00",
            lateGraceMins: 5,
            sequence: 1,
            startTime: "08:00"
          },
          {
            earlyGraceMins: 5,
            endTime: "18:00",
            lateGraceMins: 0,
            sequence: 2,
            startTime: "13:30"
          }
        ]
      })
      .expect(200);

    const response = await request(app.getHttpServer())
      .post("/attendance/projects/project-1/records")
      .set("Authorization", `Bearer ${workerAccessToken}`)
      .send(attendanceBody("2026-06-04", "SEGMENT_1_START", "2026-06-04T08:00:00.000+08:00", "31.2504000", "121.4737000"))
      .expect(201);

    expect(response.body.record).toMatchObject({
      abnormalReason: "OUTSIDE_GEOFENCE",
      attendanceDate: "2026-06-04",
      participantId: "worker-1",
      participantType: "WORKER",
      pointCode: "SEGMENT_1_START",
      status: "INVALID"
    });
    expect(response.body.result).toMatchObject({
      attendanceDate: "2026-06-04",
      isAbsent: true,
      isMissingPunch: true,
      participantId: "worker-1",
      participantType: "WORKER",
      projectId: "project-1",
      workedMinutes: 0
    });
  });

  test("rejects attendance submission when the user has no active project membership", async (): Promise<void> => {
    app = await createApp(prisma);
    const projectAdminAccessToken = await createAccessToken(app, "project-admin-user", "session-project-admin");
    const unboundAccessToken = await createAccessToken(app, "unbound-user", "session-unbound");

    await request(app.getHttpServer())
      .put("/attendance/projects/project-1/default-shift")
      .set("Authorization", `Bearer ${projectAdminAccessToken}`)
      .send({
        name: "Standard Day",
        segments: [
          {
            earlyGraceMins: 0,
            endTime: "12:00",
            lateGraceMins: 5,
            sequence: 1,
            startTime: "08:00"
          },
          {
            earlyGraceMins: 5,
            endTime: "18:00",
            lateGraceMins: 0,
            sequence: 2,
            startTime: "13:30"
          }
        ]
      })
      .expect(200);

    await request(app.getHttpServer())
      .post("/attendance/projects/project-1/records")
      .set("Authorization", `Bearer ${unboundAccessToken}`)
      .send(attendanceBody("2026-06-05", "SEGMENT_1_START", "2026-06-05T08:00:00.000+08:00", "31.2304000", "121.4737000"))
      .expect(400);

    expect(prisma.attendanceRecords.size).toBe(0);
  });

  test("stores failed face attempts as invalid records excluded from the daily result", async (): Promise<void> => {
    app = await createApp(prisma, 50);
    const projectAdminAccessToken = await createAccessToken(app, "project-admin-user", "session-project-admin");
    const workerAccessToken = await createAccessToken(app, "worker-user", "session-worker");

    await request(app.getHttpServer())
      .put("/attendance/projects/project-1/default-shift")
      .set("Authorization", `Bearer ${projectAdminAccessToken}`)
      .send({
        name: "Standard Day",
        segments: [
          {
            earlyGraceMins: 0,
            endTime: "12:00",
            lateGraceMins: 5,
            sequence: 1,
            startTime: "08:00"
          },
          {
            earlyGraceMins: 5,
            endTime: "18:00",
            lateGraceMins: 0,
            sequence: 2,
            startTime: "13:30"
          }
        ]
      })
      .expect(200);

    const response = await request(app.getHttpServer())
      .post("/attendance/projects/project-1/records")
      .set("Authorization", `Bearer ${workerAccessToken}`)
      .send(attendanceBody("2026-06-06", "SEGMENT_1_START", "2026-06-06T08:00:00.000+08:00", "31.2304000", "121.4737000"))
      .expect(201);

    expect(response.body.record).toMatchObject({
      abnormalReason: "FACE_NOT_PASSED",
      attendanceDate: "2026-06-06",
      facePassed: false,
      faceScore: "50",
      participantId: "worker-1",
      participantType: "WORKER",
      pointCode: "SEGMENT_1_START",
      status: "INVALID"
    });
    expect(response.body.result).toMatchObject({
      attendanceDate: "2026-06-06",
      isAbsent: true,
      isMissingPunch: true,
      participantId: "worker-1",
      participantType: "WORKER",
      projectId: "project-1",
      workedMinutes: 0
    });
  });
});
