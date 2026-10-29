import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { AuthModule } from "../src/auth/auth.module.js";
import { MeModule } from "../src/me/me.module.js";
import { PrismaService } from "../src/infrastructure/database/prisma.service.js";

// ─── Value types ────────────────────────────────────────────────────────────
type UserStatusValue = "ACTIVE" | "DISABLED";
type ProfileOwnerTypeValue = "WORKER" | "MANAGER";
type MemberStatusValue = "ACTIVE" | "EXITED" | "SUSPENDED";
type MakeupStatusValue = "PENDING" | "APPROVED" | "REJECTED";
type AttendancePointCodeValue = "SEGMENT_1_START" | "SEGMENT_1_END" | "SEGMENT_2_START" | "SEGMENT_2_END";
type AttendanceRecordStatusValue = "VALID" | "INVALID";

// ─── Record types ────────────────────────────────────────────────────────────
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
  readonly workerProfile: WorkerProfileRecord | null;
  readonly managerProfile: ManagerProfileRecord | null;
};

type SessionRecord = {
  readonly expiresAt: Date;
  readonly id: string;
  readonly revokedAt: Date | null;
  readonly user: UserRecord;
  readonly userId: string;
};

type WorkerProfileRecord = {
  readonly id: string;
};

type ManagerProfileRecord = {
  readonly id: string;
};

type ProjectRecord = {
  readonly id: string;
  readonly name: string;
};

type TeamRecord = {
  readonly id: string;
  readonly name: string;
};

type ProjectWorkerMemberRecord = {
  readonly id: string;
  readonly projectId: string;
  readonly workerId: string;
  readonly projectRoleLabel: string;
  readonly teamId: string | null;
  readonly status: MemberStatusValue;
  readonly createdAt: Date;
  readonly project: ProjectRecord;
  readonly team: TeamRecord | null;
};

type ProjectManagerMemberRecord = {
  readonly id: string;
  readonly projectId: string;
  readonly managerId: string;
  readonly roleCode: string;
  readonly teamScopeId: string | null;
  readonly status: MemberStatusValue;
  readonly createdAt: Date;
  readonly project: ProjectRecord;
  readonly teamScope: TeamRecord | null;
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
  readonly source: string;
  readonly status: AttendanceRecordStatusValue;
};

type MakeupRequestRecord = {
  readonly approvalReason: string | null;
  readonly approvedAt: Date | null;
  readonly approverUserId: string | null;
  readonly attendanceDate: Date;
  readonly createdAt: Date;
  readonly id: string;
  readonly participantId: string;
  readonly participantType: ProfileOwnerTypeValue;
  readonly pointCode: AttendancePointCodeValue;
  readonly projectId: string;
  readonly reason: string;
  readonly requestedOccurredAt: Date;
  readonly requesterUserId: string;
  readonly status: MakeupStatusValue;
};

// ─── Prisma test double ──────────────────────────────────────────────────────
class PersonalPrismaTestDouble {
  readonly users = new Map<string, UserRecord>();
  readonly sessions = new Map<string, SessionRecord>();
  readonly attendanceRecords: AttendanceRecordRecord[] = [];
  readonly makeupRequests: MakeupRequestRecord[] = [];
  readonly workerMemberships: ProjectWorkerMemberRecord[] = [];
  readonly managerMemberships: ProjectManagerMemberRecord[] = [];

  readonly user = {
    findUnique: async (args: {
      where: { id: string };
      include?: { workerProfile?: boolean; managerProfile?: boolean };
    }): Promise<UserRecord | null> => this.users.get(args.where.id) ?? null
  };

  readonly userSession = {
    findUnique: async (args: {
      where: { id?: string };
      include?: { user?: boolean };
    }): Promise<SessionRecord | null> =>
      args.where.id === undefined ? null : (this.sessions.get(args.where.id) ?? null)
  };

  readonly attendanceRecord = {
    findMany: async (args: {
      where: {
        attendanceDate?: { gte?: Date; lte?: Date };
        OR?: Array<{ participantType: ProfileOwnerTypeValue; participantId: string }>;
      };
      orderBy?: unknown;
    }): Promise<AttendanceRecordRecord[]> => {
      let results = [...this.attendanceRecords];

      const dateFilter = args.where.attendanceDate;
      if (dateFilter !== undefined) {
        if (dateFilter.gte !== undefined) {
          const gte = dateFilter.gte.getTime();
          results = results.filter((r) => r.attendanceDate.getTime() >= gte);
        }
        if (dateFilter.lte !== undefined) {
          const lte = dateFilter.lte.getTime();
          results = results.filter((r) => r.attendanceDate.getTime() <= lte);
        }
      }

      const orList = args.where.OR;
      if (orList !== undefined && orList.length > 0) {
        results = results.filter((r) =>
          orList.some(
            (clause) => clause.participantType === r.participantType && clause.participantId === r.participantId
          )
        );
      }

      // Sort by attendanceDate desc, then occurredAt desc
      results.sort((a, b) => {
        const dateDiff = b.attendanceDate.getTime() - a.attendanceDate.getTime();
        if (dateDiff !== 0) return dateDiff;
        return b.occurredAt.getTime() - a.occurredAt.getTime();
      });

      return results;
    }
  };

  readonly makeupRequest = {
    findMany: async (args: {
      where: { requesterUserId?: string };
      orderBy?: unknown;
    }): Promise<MakeupRequestRecord[]> => {
      let results = [...this.makeupRequests];
      if (args.where.requesterUserId !== undefined) {
        results = results.filter((r) => r.requesterUserId === args.where.requesterUserId);
      }
      // Sort by createdAt desc
      results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return results;
    }
  };

  readonly projectWorkerMember = {
    findMany: async (args: {
      where: { workerId?: string; status?: string };
      include?: unknown;
      orderBy?: unknown;
    }): Promise<ProjectWorkerMemberRecord[]> => {
      let results = [...this.workerMemberships];
      if (args.where.workerId !== undefined) {
        results = results.filter((m) => m.workerId === args.where.workerId);
      }
      if (args.where.status !== undefined) {
        results = results.filter((m) => m.status === args.where.status);
      }
      results.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      return results;
    }
  };

  readonly projectManagerMember = {
    findMany: async (args: {
      where: { managerId?: string; status?: string };
      include?: unknown;
      orderBy?: unknown;
    }): Promise<ProjectManagerMemberRecord[]> => {
      let results = [...this.managerMemberships];
      if (args.where.managerId !== undefined) {
        results = results.filter((m) => m.managerId === args.where.managerId);
      }
      if (args.where.status !== undefined) {
        results = results.filter((m) => m.status === args.where.status);
      }
      results.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      return results;
    }
  };
}

// ─── Env + helpers ───────────────────────────────────────────────────────────
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

const createApp = async (prisma: PersonalPrismaTestDouble): Promise<INestApplication> => {
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
  return jwtService.signAsync({ sid: sessionId, sub: userId, sv: 1 }, { secret, expiresIn: 900 });
};

const seedUser = (
  prisma: PersonalPrismaTestDouble,
  params: {
    userId: string;
    sessionId: string;
    workerProfile: WorkerProfileRecord | null;
    managerProfile: ManagerProfileRecord | null;
  }
): void => {
  const user: UserRecord = {
    id: params.userId,
    openid: params.userId,
    isBound: true,
    encryptedRealName: "test-encrypted-name",
    phone: "13800000000",
    nickname: "Test",
    avatarObjectKey: "test/avatar.png",
    sessionVersion: 1,
    status: "ACTIVE",
    workerProfile: params.workerProfile,
    managerProfile: params.managerProfile
  };
  prisma.users.set(user.id, user);
  prisma.sessions.set(params.sessionId, {
    expiresAt: new Date(Date.now() + 60_000),
    id: params.sessionId,
    revokedAt: null,
    user,
    userId: user.id
  });
};

const makeRecord = (
  overrides: Partial<AttendanceRecordRecord> & {
    id: string;
    participantId: string;
    participantType: ProfileOwnerTypeValue;
    attendanceDate: Date;
    occurredAt: Date;
  }
): AttendanceRecordRecord => ({
  abnormalReason: null,
  facePassed: true,
  faceScore: null,
  geofenceDistanceM: null,
  latitude: "39.90000",
  locationAccuracyM: null,
  longitude: "116.40000",
  pointCode: "SEGMENT_1_START",
  projectId: "project-1",
  selfieHash: "hash-selfie",
  selfieObjectKey: "selfie.jpg",
  sitePhotoHash: "hash-site",
  sitePhotoObjectKey: "site.jpg",
  source: "DEVICE",
  status: "VALID",
  ...overrides
});

const makeMakeupRequest = (
  overrides: Partial<MakeupRequestRecord> & {
    id: string;
    requesterUserId: string;
    createdAt: Date;
  }
): MakeupRequestRecord => ({
  approvalReason: null,
  approvedAt: null,
  approverUserId: null,
  attendanceDate: new Date(Date.UTC(2026, 5, 1)),
  participantId: "worker-1",
  participantType: "WORKER",
  pointCode: "SEGMENT_1_START",
  projectId: "project-1",
  reason: "I was there",
  requestedOccurredAt: new Date(Date.UTC(2026, 5, 1, 0, 0, 0)),
  status: "PENDING",
  ...overrides
});

// ─── Tests ───────────────────────────────────────────────────────────────────
describe("GET /me/attendance-records", (): void => {
  let app: INestApplication | undefined;
  let prisma: PersonalPrismaTestDouble;

  beforeEach((): void => {
    applyTestEnv();
    prisma = new PersonalPrismaTestDouble();
  });

  afterEach(async (): Promise<void> => {
    if (app !== undefined) {
      await app.close();
      app = undefined;
    }
  });

  test("returns records for a bound worker over [from, to] inclusive, newest-first", async (): Promise<void> => {
    seedUser(prisma, {
      managerProfile: null,
      sessionId: "session-1",
      userId: "user-1",
      workerProfile: { id: "worker-1" }
    });

    const monday = new Date(Date.UTC(2026, 5, 8)); // 2026-06-08
    const wednesday = new Date(Date.UTC(2026, 5, 10)); // 2026-06-10

    prisma.attendanceRecords.push(
      makeRecord({
        id: "rec-mon",
        participantId: "worker-1",
        participantType: "WORKER",
        attendanceDate: monday,
        occurredAt: new Date(Date.UTC(2026, 5, 8, 8, 0, 0))
      }),
      makeRecord({
        id: "rec-wed",
        participantId: "worker-1",
        participantType: "WORKER",
        attendanceDate: wednesday,
        occurredAt: new Date(Date.UTC(2026, 5, 10, 8, 0, 0))
      })
    );

    app = await createApp(prisma);
    const token = await createAccessToken(app, "user-1", "session-1");

    const response = await request(app.getHttpServer())
      .get("/me/attendance-records?from=2026-06-08&to=2026-06-13")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body).toHaveLength(2);
    expect(response.body[0].id).toBe("rec-wed");
    expect(response.body[1].id).toBe("rec-mon");
  });

  test("from/to inclusive: from===Monday returns Monday; to===Tuesday excludes Wednesday", async (): Promise<void> => {
    seedUser(prisma, {
      managerProfile: null,
      sessionId: "session-1",
      userId: "user-1",
      workerProfile: { id: "worker-1" }
    });

    const monday = new Date(Date.UTC(2026, 5, 8));
    const wednesday = new Date(Date.UTC(2026, 5, 10));

    prisma.attendanceRecords.push(
      makeRecord({
        id: "rec-mon",
        participantId: "worker-1",
        participantType: "WORKER",
        attendanceDate: monday,
        occurredAt: new Date(Date.UTC(2026, 5, 8, 8, 0, 0))
      }),
      makeRecord({
        id: "rec-wed",
        participantId: "worker-1",
        participantType: "WORKER",
        attendanceDate: wednesday,
        occurredAt: new Date(Date.UTC(2026, 5, 10, 8, 0, 0))
      })
    );

    app = await createApp(prisma);
    const token = await createAccessToken(app, "user-1", "session-1");

    // from=Monday, to=Tuesday → only Monday record
    const response = await request(app.getHttpServer())
      .get("/me/attendance-records?from=2026-06-08&to=2026-06-09")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].id).toBe("rec-mon");
  });

  test("returns empty array for a user with no worker profile (manager-only user)", async (): Promise<void> => {
    seedUser(prisma, {
      managerProfile: null,
      sessionId: "session-1",
      userId: "user-1",
      workerProfile: null
    });

    app = await createApp(prisma);
    const token = await createAccessToken(app, "user-1", "session-1");

    const response = await request(app.getHttpServer())
      .get("/me/attendance-records?from=2026-06-01&to=2026-06-30")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual([]);
  });

  test("rejects missing token with 401", async (): Promise<void> => {
    app = await createApp(prisma);
    await request(app.getHttpServer())
      .get("/me/attendance-records?from=2026-06-01&to=2026-06-30")
      .expect(401);
  });

  test("rejects invalid date query with 400", async (): Promise<void> => {
    seedUser(prisma, {
      managerProfile: null,
      sessionId: "session-1",
      userId: "user-1",
      workerProfile: { id: "worker-1" }
    });

    app = await createApp(prisma);
    const token = await createAccessToken(app, "user-1", "session-1");

    await request(app.getHttpServer())
      .get("/me/attendance-records?from=2026-13-01&to=2026-06-10")
      .set("Authorization", `Bearer ${token}`)
      .expect(400);
  });
});

describe("GET /me/makeups", (): void => {
  let app: INestApplication | undefined;
  let prisma: PersonalPrismaTestDouble;

  beforeEach((): void => {
    applyTestEnv();
    prisma = new PersonalPrismaTestDouble();
  });

  afterEach(async (): Promise<void> => {
    if (app !== undefined) {
      await app.close();
      app = undefined;
    }
  });

  test("returns only caller's makeup requests, newest-first", async (): Promise<void> => {
    seedUser(prisma, {
      managerProfile: null,
      sessionId: "session-1",
      userId: "user-1",
      workerProfile: { id: "worker-1" }
    });

    const t1 = new Date(Date.UTC(2026, 5, 1, 10, 0, 0));
    const t2 = new Date(Date.UTC(2026, 5, 2, 10, 0, 0));

    prisma.makeupRequests.push(
      makeMakeupRequest({ id: "mkp-1", requesterUserId: "user-1", createdAt: t1 }),
      makeMakeupRequest({ id: "mkp-2", requesterUserId: "user-1", createdAt: t2 }),
      makeMakeupRequest({ id: "mkp-other", requesterUserId: "user-other", createdAt: t2 })
    );

    app = await createApp(prisma);
    const token = await createAccessToken(app, "user-1", "session-1");

    const response = await request(app.getHttpServer())
      .get("/me/makeups")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body).toHaveLength(2);
    expect(response.body[0].id).toBe("mkp-2");
    expect(response.body[1].id).toBe("mkp-1");
    expect(response.body.every((r: { requesterUserId: string }) => r.requesterUserId === "user-1")).toBe(true);
  });

  test("missing token returns 401", async (): Promise<void> => {
    app = await createApp(prisma);
    await request(app.getHttpServer()).get("/me/makeups").expect(401);
  });
});

describe("GET /me/projects", (): void => {
  let app: INestApplication | undefined;
  let prisma: PersonalPrismaTestDouble;

  beforeEach((): void => {
    applyTestEnv();
    prisma = new PersonalPrismaTestDouble();
  });

  afterEach(async (): Promise<void> => {
    if (app !== undefined) {
      await app.close();
      app = undefined;
    }
  });

  test("returns only ACTIVE memberships with id, name, roleLabel, teamName", async (): Promise<void> => {
    seedUser(prisma, {
      managerProfile: null,
      sessionId: "session-1",
      userId: "user-1",
      workerProfile: { id: "worker-1" }
    });

    const t1 = new Date(Date.UTC(2026, 5, 1));

    prisma.workerMemberships.push(
      {
        id: "mem-active",
        projectId: "project-1",
        workerId: "worker-1",
        projectRoleLabel: "普通工人",
        teamId: "team-1",
        status: "ACTIVE",
        createdAt: t1,
        project: { id: "project-1", name: "Alpha Project" },
        team: { id: "team-1", name: "Team A" }
      },
      {
        id: "mem-exited",
        projectId: "project-2",
        workerId: "worker-1",
        projectRoleLabel: "班组长",
        teamId: null,
        status: "EXITED",
        createdAt: t1,
        project: { id: "project-2", name: "Beta Project" },
        team: null
      }
    );

    app = await createApp(prisma);
    const token = await createAccessToken(app, "user-1", "session-1");

    const response = await request(app.getHttpServer())
      .get("/me/projects")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      projectId: "project-1",
      projectName: "Alpha Project",
      projectRoleLabel: "普通工人",
      teamId: "team-1",
      teamName: "Team A"
    });
  });
});
