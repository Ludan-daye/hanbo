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
  readonly status: "ACTIVE";
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
  readonly attendancePlan = { findMany: async (): Promise<[]> => [] };
  readonly projectMemberHistory = { findMany: async (): Promise<[]> => [] };

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
        ).map((membership) => ({ enteredAt: new Date("2020-01-01"), exitedAt: null, projectRoleLabel: "WORKER", ...membership }))
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
      where: { ownerId?: string | { in: string[] }; ownerType?: string };
    }): Promise<ScheduleRecord[]> =>
      [...this.scheduleRows]
        .filter(
          (row: ScheduleRecord): boolean =>
            (args.where.ownerId === undefined || (typeof args.where.ownerId === "string" ? row.ownerId === args.where.ownerId : args.where.ownerId.in.includes(row.ownerId))) &&
            (args.where.ownerType === undefined || row.ownerType === args.where.ownerType)
        )
        .sort((left: ScheduleRecord, right: ScheduleRecord): number => right.startsOn.getTime() - left.startsOn.getTime())
  };

  readonly shift = {
    findMany: async (): Promise<ShiftRecord[]> => this.defaultShiftRow === null ? [] : [this.defaultShiftRow],
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

  readonly makeupRequest = { findMany: async (): Promise<[]> => [] };
  readonly attendanceResult = {
    upsert: async (args: { create: Omit<AttendanceResultRow, "id"> }): Promise<AttendanceResultRow> => ({ id: "result-1", ...args.create }),
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
  const user: UserRecord = { id: userId, openid: userId, isBound: true, encryptedRealName: "test-encrypted-name", phone: "13800000000", nickname: "Test", avatarObjectKey: "test/avatar.png", sessionVersion: 1, status: "ACTIVE" };
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
    status: "ACTIVE",
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

  test("uses two default points when no older schedule exists", async (): Promise<void> => {
    seedWorkerParticipant(prisma);
    app = await createApp(prisma);
    const token = await createAccessToken(app, "user-1", "session-1");

    const response = await request(app.getHttpServer())
      .get("/me/projects/project-1/attendance-today")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body).toMatchObject({
      attendanceDate: chinaTodayText(),
      configured: true,
      isWorkday: true,
      points: [expect.objectContaining({ pointCode: "START" }), expect.objectContaining({ pointCode: "END" })],
      shiftName: "每日两次"
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
      { graceMins: 10, pointCode: "SEGMENT_1_START", label: "上午上班", kind: "START", record: null, scheduledTime: "08:00" },
      { graceMins: 10, pointCode: "SEGMENT_1_END", label: "上午下班", kind: "END", record: null, scheduledTime: "12:00" },
      { graceMins: 10, pointCode: "SEGMENT_2_START", label: "下午上班", kind: "START", record: null, scheduledTime: "13:30" },
      { graceMins: 10, pointCode: "SEGMENT_2_END", label: "下午下班", kind: "END", record: null, scheduledTime: "17:30" }
    ]);
  });

  test("surfaces valid records per point and today's result", async (): Promise<void> => {
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
      abnormalReason: null,
      occurredAt: `${today}T00:01:00.000Z`,
      status: "VALID"
    });
    expect(points[1]?.record?.status).toBe("VALID");
    expect(points[2]?.record).toBeNull();
    expect(points[3]?.record).toBeNull();
    expect(response.body.result).toMatchObject({ workedMinutes: 239 });
  });

  test("rejects a non-participant with 400 ATTENDANCE_PARTICIPANT_MEMBERSHIP_NOT_FOUND", async (): Promise<void> => {
    seedSession(prisma, "user-2", "session-2");
    prisma.projectRow = { centerLatitude: "31.2304", centerLongitude: "121.4737", geofenceRadiusM: 300,
    status: "ACTIVE", id: "project-1" };
    app = await createApp(prisma);
    const token = await createAccessToken(app, "user-2", "session-2");

    const response = await request(app.getHttpServer())
      .get("/me/projects/project-1/attendance-today")
      .set("Authorization", `Bearer ${token}`)
      .expect(400);

    expect(response.body.message).toBe("ATTENDANCE_PARTICIPANT_MEMBERSHIP_NOT_FOUND");
  });
  // ^ 400 (not 403) is intentional: the endpoint reuses resolveAttendanceParticipant, which
  //   throws BadRequestException — identical semantics to the punch-submission path.

  test("rejects a missing token with 401", async (): Promise<void> => {
    app = await createApp(prisma);
    await request(app.getHttpServer()).get("/me/projects/project-1/attendance-today").expect(401);
  });
});
