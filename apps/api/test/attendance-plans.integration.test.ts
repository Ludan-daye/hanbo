import ExcelJS from "exceljs";
import { ATTENDANCE_SAFETY_VERSION } from "@construction/domain";
import { ReportsService } from "../src/reports/reports.service.js";
import { createMonthlyWorkbook, REPORT_CALCULATION_VERSION } from "../src/reports/report-workbook.js";
import { ReportExportsService } from "../src/reports/report-exports.service.js";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import type { RoleCode } from "@prisma/client";
import {
  defaultAttendancePoints,
  type ScheduledAttendancePoint,
} from "@construction/domain/attendance.js";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { AppModule } from "../src/app.module.js";
import { API_ENV } from "../src/config/env.module.js";
import { loadEnv } from "../src/config/env.js";
import type {
  EffectivePlan,
  PlanBody,
} from "../src/attendance/attendance-plans.js";
import { PrismaService } from "../src/infrastructure/database/prisma.service.js";
import { encryptPersonnelName } from "../src/management/personnel-name.js";

const parseBinary = (
  response: request.Response,
  callback: (error: Error | null, data: Buffer) => void,
): void => {
  const chunks: Buffer[] = [];
  response.on("data", (chunk: Buffer) => chunks.push(chunk));
  response.on("end", () => callback(null, Buffer.concat(chunks)));
  response.on("error", (error: Error) => callback(error, Buffer.alloc(0)));
};
const projectId = "planning-project";
const teamId = "planning-team";
const scopePath = (type: string, id: string): string =>
  `/attendance/planning/${projectId}/${type}/${id}`;
const threePoints: readonly ScheduledAttendancePoint[] = [
  defaultAttendancePoints[0]!,
  {
    code: "MID",
    label: "午间签到",
    kind: "CHECKPOINT",
    time: "12:00",
    graceMins: 5,
  },
  defaultAttendancePoints[1]!,
];
const fourPoints: readonly ScheduledAttendancePoint[] = [
  { code: "A", label: "上午上班", kind: "START", time: "08:00", graceMins: 0 },
  { code: "B", label: "上午下班", kind: "END", time: "12:00", graceMins: 0 },
  { code: "C", label: "下午上班", kind: "START", time: "13:30", graceMins: 0 },
  { code: "D", label: "下午下班", kind: "END", time: "17:30", graceMins: 0 },
];
const input = (
  name: string,
  points: readonly ScheduledAttendancePoint[],
  startsOn: string,
  expectedId: string | null,
): PlanBody => ({
  name,
  points: [...points],
  startsOn,
  endsOn: null,
  expectedId,
  workdays: [1, 2, 3, 4, 5, 6, 7],
});

describe.skipIf(process.env.DATABASE_FOUNDATION_TEST_URL === undefined)(
  "versioned attendance plans over real HTTP and PostgreSQL",
  () => {
    let app: INestApplication;
    let uploadsDirectory: string;
    let database: PrismaService;
    const tokens: Map<string, string> = new Map();
    const images = new Map<
      string,
      { readonly objectKey: string; readonly hash: string }
    >();
    const auth = (actor: string): string => {
      const token = tokens.get(actor);
      if (!token) throw new Error(`Missing test token: ${actor}`);
      return token;
    };
    const readPlan = async (
      actor: string,
      date: string,
    ): Promise<EffectivePlan> => {
      const result = await request(app.getHttpServer())
        .get(`/me/projects/${projectId}/attendance-plan`)
        .query({ date })
        .auth(auth(actor), { type: "bearer" })
        .expect(200);
      return result.body as EffectivePlan;
    };
    const save = async (
      actor: string,
      type: string,
      id: string,
      body: PlanBody,
    ): Promise<{ id: string }> => {
      const result = await request(app.getHttpServer())
        .post(scopePath(type, id))
        .auth(auth(actor), { type: "bearer" })
        .send(body)
        .expect(201);
      return result.body as { id: string };
    };
    const punch = (
      actor: string,
      date: string,
      code: string,
      time: string,
      latitude: string,
    ): { expect: (status: number) => Promise<request.Response> } => ({
      expect: async (status: number): Promise<request.Response> => {
        const confirmation = await database.attendanceSafetyConfirmation.create(
          {
            data: {
              userId: `planning-${actor}`,
              projectId,
              teamId:
                actor === "other"
                  ? "planning-other-team"
                  : actor === "admin"
                    ? null
                    : teamId,
              memberId: `member-${actor}`,
              participantType: ["worker", "other"].includes(actor)
                ? "WORKER"
                : "MANAGER",
              participantId: `planning-${actor}`,
              attendanceDate: new Date(date),
              pointCode: code,
              baselineVersion: ATTENDANCE_SAFETY_VERSION,
              briefingIds: [],
              snapshot: {},
              expiresAt: new Date(Date.now() + 60000),
            },
          },
        );
        return request(app.getHttpServer())
          .post(`/attendance/projects/${projectId}/records`)
          .auth(auth(actor), { type: "bearer" })
          .send({
            attendanceDate: date,
            pointCode: code,
            occurredAt: `${date}T${time}:00+08:00`,
            latitude,
            longitude: "121",
            locationAccuracyM: "5",
            selfieObjectKey: "test/selfie.jpg",
            selfieHash: "test-hash",
            sitePhotoObjectKey: images.get(actor)!.objectKey,
            sitePhotoHash: images.get(actor)!.hash,
            safetyConfirmationId: confirmation.id,
          })
          .expect((response): void => {
            expect(response.status, JSON.stringify({ actor, date, code, body: response.body, text: response.text })).toBe(status);
          });
      },
    });

    beforeAll(async () => {
      const url = process.env.DATABASE_FOUNDATION_TEST_URL;
      if (
        !url ||
        !new URL(url).searchParams
          .get("schema")
          ?.startsWith("database_foundation_")
      )
        throw new Error("An isolated local database schema is required.");
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2030-01-06T04:00:00Z"));
      uploadsDirectory = await mkdtemp(
        join(tmpdir(), "hanbo-attendance-integration-"),
      );
      const env = loadEnv({
        ...process.env,
        DATABASE_URL: url,
        UPLOADS_DIR: uploadsDirectory,
        NODE_ENV: "test",
        FACE_DEV_STUB: "true",
        TENCENT_FACE_MODE: "WECHAT_NATIVE",
        TENCENT_FACE_RULE_ID: "",
        TENCENT_SECRET_ID: "",
        TENCENT_SECRET_KEY: "",
        PERSONNEL_ENCRYPTION_KEY: "ab".repeat(32),
      });
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(API_ENV)
        .useValue(env)
        .compile();
      app = moduleRef.createNestApplication();
      await app.listen(0, "127.0.0.1");
      database = app.get(PrismaService);
      await database.company.create({
        data: {
          id: "planning-company",
          name: "Planning company",
          status: "ACTIVE",
        },
      });
      for (const id of [projectId, "planning-other-project"])
        await database.project.create({
          data: {
            id,
            companyId: "planning-company",
            name: id,
            address: "Test site",
            centerLatitude: "31",
            centerLongitude: "121",
            geofenceRadiusM: 300,
            status: "ACTIVE",
            plannedStartDate: new Date("2030-01-01"),
          },
        });
      for (const id of [teamId, "planning-other-team"])
        await database.team.create({
          data: { id, projectId, name: id, status: "ACTIVE" },
        });
      for (const [actor, roleCode] of [
        ["admin", "PROJECT_ADMIN"],
        ["leader", "TEAM_LEADER"],
        ["peer", "TEAM_LEADER"],
        ["worker", "WORKER"],
        ["other", "WORKER"],
      ] as const) {
        const userId = `planning-${actor}`;
        const encryptedName = encryptPersonnelName(
          actor,
          env.PERSONNEL_ENCRYPTION_KEY,
          randomBytes(12),
        );
        await database.user.create({
          data: {
            id: userId,
            openid: userId,
            isBound: true,
            encryptedRealName: encryptedName,
            phone: `1390000088${["admin", "leader", "peer", "worker", "other"].indexOf(actor)}`,
            nickname: actor,
            avatarObjectKey: "test/avatar.jpg",
          },
        });
        if (roleCode === "WORKER") {
          await database.workerProfile.create({
            data: {
              id: userId,
              userId,
              encryptedName,
              phone: `1390000088${["admin", "leader", "peer", "worker", "other"].indexOf(actor)}`,
              workType: "木工",
              employmentStatus: "ACTIVE",
              faceProfileStatus: "APPROVED",
              realNameStatus: "VERIFIED",
              registrationCompletedAt: new Date("2030-01-01"),
              projectMemberships: {
                create: {
                  id: `member-${actor}`,
                  projectId,
                  teamId: actor === "other" ? "planning-other-team" : teamId,
                  status: "ACTIVE",
                  enteredAt: new Date("2030-01-01"),
                  projectRoleLabel: "木工",
                },
              },
            },
          });
        } else {
          await database.managerProfile.create({
            data: {
              id: userId,
              userId,
              name: actor,
              phone: `1390000088${["admin", "leader", "peer", "worker", "other"].indexOf(actor)}`,
              status: "ACTIVE",
              projectMemberships: {
                create: {
                  id: `member-${actor}`,
                  projectId,
                  teamScopeId: roleCode === "TEAM_LEADER" ? teamId : null,
                  roleCode: roleCode as RoleCode,
                  status: "ACTIVE",
                },
              },
            },
          });
        }
        const role = await database.role.findUniqueOrThrow({
          where: { code: roleCode },
        });
        await database.userRole.create({
          data: {
            userId,
            roleId: role.id,
            scopeType: roleCode === "TEAM_LEADER" ? "TEAM" : "PROJECT",
            scopeId: roleCode === "TEAM_LEADER" ? teamId : projectId,
          },
        });
        const session = await database.userSession.create({
          data: {
            userId,
            tokenHash: createHash("sha256").update(userId).digest("hex"),
            expiresAt: new Date("2031-01-01"),
          },
        });
        tokens.set(
          actor,
          await app
            .get(JwtService)
            .signAsync(
              { sid: session.id, sub: userId, sv: 1 },
              { secret: env.JWT_ACCESS_TOKEN_SECRET, expiresIn: 86400 * 30 },
            ),
        );
      }
      for (const actor of ["admin", "leader", "peer", "worker", "other"]) {
        const uploaded = await request(app.getHttpServer())
          .post("/uploads")
          .auth(auth(actor), { type: "bearer" })
          .attach(
            "file",
            Buffer.from(
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jSAAAAABJRU5ErkJggg==",
              "base64",
            ),
            { filename: "site.png", contentType: "image/png" },
          )
          .expect(201);
        images.set(actor, uploaded.body as { objectKey: string; hash: string });
      }
    });
    afterAll(async () => {
      vi.useRealTimers();
      if (app) await app.close();
      if (uploadsDirectory)
        await rm(uploadsDirectory, { recursive: true, force: true });
    });

    test("defaults to two and limits scope lists and writes to lower-ranked authorized people", async () => {
      expect((await readPlan("worker", "2030-01-06")).points).toHaveLength(2);
      const scopes = await request(app.getHttpServer())
        .get("/attendance/planning/scopes")
        .auth(auth("leader"), { type: "bearer" })
        .expect(200);
      expect(
        scopes.body.map((row: { scopeId: string }) => row.scopeId).sort(),
      ).toEqual(["member-worker", teamId].sort());
      for (const [actor, type, id] of [
        ["worker", "TEAM", teamId],
        ["leader", "MEMBER", "member-leader"],
        ["leader", "MEMBER", "member-peer"],
        ["leader", "MEMBER", "member-other"],
        ["admin", "MEMBER", "member-admin"],
      ])
        await request(app.getHttpServer())
          .post(scopePath(type!, id!))
          .auth(auth(actor!), { type: "bearer" })
          .send(input("invalid", threePoints, "2030-01-07", null))
          .expect(403);
      await request(app.getHttpServer())
        .post(
          "/attendance/planning/planning-other-project/PROJECT/planning-other-project",
        )
        .auth(auth("admin"), { type: "bearer" })
        .send(input("invalid", threePoints, "2030-01-07", null))
        .expect(403);
      await request(app.getHttpServer())
        .put(`/attendance/projects/${projectId}/default-shift`)
        .auth(auth("admin"), { type: "bearer" })
        .send({})
        .expect(410);
      await request(app.getHttpServer())
        .put(`/attendance/projects/${projectId}/default-schedule`)
        .auth(auth("admin"), { type: "bearer" })
        .send({})
        .expect(410);
    });

    test("preserves today, applies personal over team over project, and restores inheritance by date", async () => {
      await save(
        "admin",
        "PROJECT",
        projectId,
        input("项目三次", threePoints, "2030-01-07", null),
      );
      await save(
        "leader",
        "TEAM",
        teamId,
        input("班组四次", fourPoints, "2030-01-07", null),
      );
      const personal = await save(
        "leader",
        "MEMBER",
        "member-worker",
        input("个人两次", defaultAttendancePoints, "2030-01-07", null),
      );
      expect((await readPlan("worker", "2030-01-06")).points).toHaveLength(2);
      expect((await readPlan("worker", "2030-01-07")).name).toBe("个人两次");
      expect((await readPlan("other", "2030-01-07")).name).toBe("项目三次");
      expect((await readPlan("leader", "2030-01-07")).name).toBe("项目三次");
      expect((await readPlan("peer", "2030-01-07")).name).toBe("项目三次");
      expect((await readPlan("admin", "2030-01-07")).points).toHaveLength(2);
      await request(app.getHttpServer())
        .post(`${scopePath("MEMBER", "member-worker")}/inherit`)
        .auth(auth("leader"), { type: "bearer" })
        .send(input("继承", defaultAttendancePoints, "2030-01-08", personal.id))
        .expect(201);
      expect((await readPlan("worker", "2030-01-07")).name).toBe("个人两次");
      expect((await readPlan("worker", "2030-01-08")).name).toBe("班组四次");
    });

    test("rejects conflicting saves, retroactive changes and invalid point sequences", async () => {
      const path = scopePath("MEMBER", "member-other");
      const results = await Promise.all(
        ["a", "b"].map((name) =>
          request(app.getHttpServer())
            .post(path)
            .auth(auth("admin"), { type: "bearer" })
            .send({
              ...input(name, threePoints, "2030-01-09", null),
              endsOn: "2030-01-09",
            }),
        ),
      );
      expect(results.map((row) => row.status).sort()).toEqual([201, 409]);
      expect((await readPlan("other", "2030-01-10")).name).toBe("项目三次");
      for (const body of [
        input("past", threePoints, "2030-01-06", null),
        input("unpaired", threePoints.slice(0, 2), "2030-01-07", null),
        input(
          "duplicate",
          [threePoints[0]!, threePoints[0]!],
          "2030-01-07",
          null,
        ),
      ])
        await request(app.getHttpServer())
          .post(scopePath("MEMBER", "member-peer"))
          .auth(auth("admin"), { type: "bearer" })
          .send(body)
          .expect(400);
    });

    test("uses dynamic point codes throughout punch, geofence, makeup, work hours and reports", async () => {
      vi.setSystemTime(new Date("2030-01-07T00:00:00Z"));
      const start = await punch(
        "worker",
        "2030-01-07",
        "START",
        "08:00",
        "31",
      ).expect(201);
      expect(start.body.result).toMatchObject({
        isMissingPunch: false,
        isAbsent: false,
        workedMinutes: 0,
      });
      await punch(
        "worker",
        "2030-01-07",
        "SEGMENT_1_START",
        "08:00",
        "31",
      ).expect(400);
      const count = await database.attendanceRecord.count({
        where: { projectId },
      });
      await punch("worker", "2030-01-07", "END", "17:30", "32").expect(400);
      expect(
        await database.attendanceRecord.count({ where: { projectId } }),
      ).toBe(count);
      const beforeReverse = await database.attendanceRecord.count({
        where: { projectId },
      });
      await punch("worker", "2030-01-07", "END", "07:00", "31").expect(400);
      expect(
        await database.attendanceRecord.count({ where: { projectId } }),
      ).toBe(beforeReverse);
      expect(
        (
          await database.attendanceResult.findFirstOrThrow({
            where: { projectId, participantId: "planning-worker" },
          })
        ).workedMinutes,
      ).toBe(0);
      vi.setSystemTime(new Date("2030-01-07T10:00:00Z"));
      const end = await punch(
        "worker",
        "2030-01-07",
        "END",
        "17:30",
        "31",
      ).expect(201);
      expect(end.body.record.pointLabel).toBe("下班");
      expect(end.body.result).toMatchObject({
        workedMinutes: 570,
        isMissingPunch: false,
        isAbsent: false,
      });
      for (const point of threePoints)
        await punch("other", "2030-01-07", point.code, point.time, "31").expect(
          201,
        );
      const otherResult = await database.attendanceResult.findFirstOrThrow({
        where: {
          projectId,
          participantId: "planning-other",
          attendanceDate: new Date("2030-01-07"),
        },
      });
      expect(otherResult.workedMinutes).toBe(570);
      expect(otherResult.isMissingPunch).toBe(false);
      await punch("leader", "2030-01-07", "START", "08:00", "31").expect(201);
      const makeup = await request(app.getHttpServer())
        .post(`/makeups/projects/${projectId}/requests`)
        .auth(auth("other"), { type: "bearer" })
        .send({
          attendanceDate: "2030-01-07",
          pointCode: "MID",
          requestedOccurredAt: "2030-01-07T12:00:00+08:00",
          reason: "禁止重复补卡",
        })
        .expect(409);
      expect(makeup.status).toBe(409);
      vi.setSystemTime(new Date("2030-01-08T10:00:00Z"));
      for (const point of fourPoints)
        await punch(
          "worker",
          "2030-01-08",
          point.code,
          point.time,
          "31",
        ).expect(201);
      const daily = await request(app.getHttpServer())
        .get(`/reports/projects/${projectId}/daily?date=2030-01-08`)
        .auth(auth("admin"), { type: "bearer" })
        .expect(200);
      expect(
        daily.body.participants.find(
          (row: { participantId: string }) =>
            row.participantId === "planning-worker",
        ),
      ).toMatchObject({ workedMinutes: 480, isMissingPunch: false });
      const future = await request(app.getHttpServer())
        .get(`/reports/projects/${projectId}/daily?date=2030-01-09`)
        .auth(auth("admin"), { type: "bearer" })
        .expect(200);
      expect(future.body.totals).toMatchObject({
        absenceCount: 0,
        missingPunchCount: 0,
        actualAttendedDays: 0,
      });
      const monthly = await request(app.getHttpServer())
        .get(`/reports/projects/${projectId}/monthly?month=2030-01`)
        .auth(auth("admin"), { type: "bearer" })
        .expect(200);
      expect(
        monthly.body.participants.find(
          (row: { participantId: string }) =>
            row.participantId === "planning-worker",
        ),
      ).toMatchObject({ workedMinutes: 1050, actualAttendedDays: 2 });
    });

    test("rejects duplicate points, foreign photos, project suspension and invalid makeup dates", async () => {
      vi.setSystemTime(new Date("2030-01-08T10:00:00Z"));
      await punch("worker", "2030-01-07", "START", "08:00", "31").expect(409);
      const photo = images.get("peer")!;
      await request(app.getHttpServer())
        .post(`/attendance/projects/${projectId}/records`)
        .auth(auth("peer"), { type: "bearer" })
        .send({
          attendanceDate: "2030-01-08",
          pointCode: "START",
          occurredAt: "2030-01-08T08:00:00+08:00",
          latitude: "31",
          longitude: "121",
          locationAccuracyM: "5",
          selfieObjectKey: "test/selfie.jpg",
          selfieHash: "test",
          sitePhotoObjectKey: images.get("worker")!.objectKey,
          sitePhotoHash: images.get("worker")!.hash,
        })
        .expect(400);
      expect(
        await database.storedFile.count({
          where: {
            objectKey: photo.objectKey,
            uploaderUserId: "planning-peer",
          },
        }),
      ).toBe(1);
      await database.project.update({
        where: { id: projectId },
        data: { status: "SUSPENDED" },
      });
      await punch("peer", "2030-01-08", "START", "08:00", "31").expect(400);
      // A suspended project's plan can still be read, but not changed.
      await request(app.getHttpServer())
        .get(scopePath("PROJECT", projectId))
        .auth(auth("admin"), { type: "bearer" })
        .expect(200);
      expect(
        (
          await request(app.getHttpServer())
            .post(scopePath("PROJECT", projectId))
            .auth(auth("admin"), { type: "bearer" })
            .send(input("suspended", threePoints, "2030-02-01", null))
            .expect(404)
        ).body.message,
      ).toBe("PROJECT_NOT_FOUND");
      await database.project.update({
        where: { id: projectId },
        data: { status: "ACTIVE" },
      });
      for (const date of ["2029-12-31", "2030-01-10"]) {
        await request(app.getHttpServer())
          .post(`/makeups/projects/${projectId}/requests`)
          .auth(auth("worker"), { type: "bearer" })
          .send({
            attendanceDate: date,
            pointCode: "START",
            requestedOccurredAt: `${date}T08:00:00+08:00`,
            reason: "invalid date",
          })
          .expect(400);
      }
    });

    test("rolls approval back when recalculation fails and serializes duplicate applications and reviews", async () => {
      const apply = (time: string) =>
        request(app.getHttpServer())
          .post(`/makeups/projects/${projectId}/requests`)
          .auth(auth("leader"), { type: "bearer" })
          .send({
            attendanceDate: "2030-01-07",
            pointCode: "END",
            requestedOccurredAt: `2030-01-07T${time}:00+08:00`,
            reason: "forgot end",
          });
      const reverse = await apply("07:00").expect(201);
      await request(app.getHttpServer())
        .post(`/makeups/requests/${reverse.body.id}/approve`)
        .auth(auth("admin"), { type: "bearer" })
        .send({ approvalReason: "review" })
        .expect(400);
      expect(
        (
          await database.makeupRequest.findUniqueOrThrow({
            where: { id: reverse.body.id },
          })
        ).status,
      ).toBe("PENDING");
      await request(app.getHttpServer())
        .post(`/makeups/requests/${reverse.body.id}/approve`)
        .auth(auth("peer"), { type: "bearer" })
        .send({ approvalReason: "peer denied" })
        .expect(403);
      await request(app.getHttpServer())
        .post(`/makeups/requests/${reverse.body.id}/reject`)
        .auth(auth("admin"), { type: "bearer" })
        .send({ approvalReason: "time incorrect" })
        .expect(201);
      const applications = await Promise.all([apply("17:30"), apply("17:30")]);
      expect(applications.map((r) => r.status).sort()).toEqual([201, 409]);
      const id = applications.find((r) => r.status === 201)!.body.id as string;
      const inbox = await request(app.getHttpServer())
        .get("/makeups/pending")
        .auth(auth("admin"), { type: "bearer" })
        .expect(200);
      expect(inbox.body.items.some((r: { id: string }) => r.id === id)).toBe(
        true,
      );
      const results = await Promise.all(
        [1, 2].map(() =>
          request(app.getHttpServer())
            .post(`/makeups/requests/${id}/approve`)
            .auth(auth("admin"), { type: "bearer" })
            .send({ approvalReason: "verified" }),
        ),
      );
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      const reviewed = await request(app.getHttpServer()).get("/makeups/reviewed").auth(auth("admin"), { type: "bearer" }).expect(200);
      expect(reviewed.body.items).toEqual(expect.arrayContaining([
        expect.objectContaining({ id, status: "APPROVED", approvalReason: "verified", approvedAt: expect.any(String) }),
        expect.objectContaining({ id: reverse.body.id, status: "REJECTED", approvalReason: "time incorrect" }),
      ]));
      const peerHistory = await request(app.getHttpServer()).get("/makeups/reviewed").auth(auth("peer"), { type: "bearer" }).expect(200);
      expect(peerHistory.body.items).toEqual([]);
      const personal = await request(app.getHttpServer())
        .get("/me/attendance-days?from=2030-01-07&to=2030-01-07")
        .auth(auth("leader"), { type: "bearer" })
        .expect(200);
      expect(personal.body[0]).toMatchObject({
        workedMinutes: 570,
        approvedMakeupCount: 1,
      });
    });

    test("preserves team history, entry/exit and suspension intervals after personnel changes", async () => {
      const change = async (
        date: string,
        data: {
          teamId?: string;
          status?: "ACTIVE" | "SUSPENDED" | "EXITED";
          exitedAt?: Date | null;
        },
      ): Promise<void> => {
        await database.projectWorkerMember.update({
          where: { id: "member-worker" },
          data,
        });
        const history = await database.projectMemberHistory.findFirstOrThrow({
          where: { workerMemberId: "member-worker" },
          orderBy: { version: "desc" },
        });
        await database.projectMemberHistory.update({
          where: { id: history.id },
          data: { recordedAt: new Date(`${date}T00:00:00+08:00`) },
        });
      };
      await change("2030-01-09", { teamId: "planning-other-team" });
      await change("2030-01-10", { status: "SUSPENDED" });
      await change("2030-01-12", { status: "ACTIVE" });
      await change("2030-01-15", {
        status: "EXITED",
        exitedAt: new Date("2030-01-13T23:59:59+08:00"),
      });
      vi.setSystemTime(new Date("2030-01-15T10:00:00Z"));
      const oldTeam = await request(app.getHttpServer())
        .get(`/reports/teams/${teamId}/daily?date=2030-01-08`)
        .auth(auth("admin"), { type: "bearer" })
        .expect(200);
      expect(
        oldTeam.body.participants.find(
          (r: { participantId: string }) =>
            r.participantId === "planning-worker",
        ),
      ).toMatchObject({ workedMinutes: 480, displayName: "worker", teamId });
      const project = await request(app.getHttpServer())
        .get(`/reports/projects/${projectId}/monthly?month=2030-01`)
        .auth(auth("admin"), { type: "bearer" })
        .expect(200);
      const rows = project.body.participants.filter(
        (r: { participantId: string }) => r.participantId === "planning-worker",
      ) as { scheduledDays: number; teamId: string }[];
      expect(rows).toHaveLength(2);
      expect(rows.reduce((sum, r) => sum + r.scheduledDays, 0)).toBe(11);
      const personal = await request(app.getHttpServer())
        .get("/me/attendance-days?from=2030-01-10&to=2030-01-15")
        .auth(auth("worker"), { type: "bearer" })
        .expect(200);
      expect(
        personal.body.map((r: { attendanceDate: string }) => r.attendanceDate),
      ).toEqual(["2030-01-12", "2030-01-13"]);
      const historical = await request(app.getHttpServer())
        .post(`/makeups/projects/${projectId}/requests`)
        .auth(auth("worker"), { type: "bearer" })
        .send({
          attendanceDate: "2030-01-06",
          pointCode: "START",
          requestedOccurredAt: "2030-01-06T08:00:00+08:00",
          reason: "historical makeup after exit",
        })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/makeups/requests/${historical.body.id}/approve`)
        .auth(auth("leader"), { type: "bearer" })
        .send({ approvalReason: "old team attendance verified" })
        .expect(201);
    });

    test("promotes a worker without changing identity and synchronizes bound account data", async () => {
      const path = `/management/projects/${projectId}/participants/member-other`;
      const before = await request(app.getHttpServer())
        .get(path)
        .auth(auth("admin"), { type: "bearer" })
        .expect(200);
      const person = before.body;
      const changed = await request(app.getHttpServer())
        .put(path)
        .auth(auth("admin"), { type: "bearer" })
        .send({
          displayName: "Updated worker",
          phone: "13900000777",
          workType: person.workType,
          participantType: "WORKER",
          projectRoleLabel: "TEAM_LEADER",
          teamId: person.teamId,
          requiresAttendance: true,
          status: "ACTIVE",
          enteredAt: person.enteredAt,
          exitedAt: null,
          expectedUpdatedAt: person.updatedAt,
          expectedProfileUpdatedAt: person.profileUpdatedAt,
        })
        .expect(200);
      expect(changed.body.profileId).toBe(person.profileId);
      const user = await database.user.findUniqueOrThrow({
        where: { id: "planning-other" },
      });
      expect(user.phone).toBe("13900000777");
      const grants = await database.userRole.findMany({
        where: { userId: user.id },
        include: { role: true },
      });
      expect(grants.map((r) => r.role.code)).toEqual(["TEAM_LEADER"]);
      expect(grants[0]?.scopeId).toBe("planning-other-team");
      const history = await database.projectMemberHistory.findFirstOrThrow({
        where: { workerMemberId: "member-other" },
        orderBy: { version: "desc" },
      });
      expect(history.roleCode).toBe("TEAM_LEADER");
      expect(
        await database.attendanceRecord.count({
          where: { participantId: person.profileId },
        }),
      ).toBeGreaterThan(0);
      await request(app.getHttpServer())
        .post(`/management/projects/${projectId}/workers`)
        .auth(auth("admin"), { type: "bearer" })
        .send({})
        .expect(410);
    });

    test("project scoring and person detail preserve scope, hierarchy, versions and audit history", async () => {
      vi.setSystemTime(new Date("2030-01-21T04:00:00Z"));
      const path = `/reports/projects/${projectId}/members/member-worker`;
      await database.managerProfile.create({
        data: {
          id: "report-peer-manager",
          name: "Same level manager",
          phone: "13900000666",
          status: "ACTIVE",
          projectMemberships: {
            create: {
              id: "report-peer-member",
              projectId,
              roleCode: "PROJECT_ADMIN",
              status: "ACTIVE",
            },
          },
        },
      });
      const body = {
        score: 92,
        comment: "配合良好，注意准时",
        expectedUpdatedAt: null,
      };
      for (const actor of ["worker", "leader"]) {
        await request(app.getHttpServer())
          .post(`${path}/evaluation`)
          .auth(auth(actor), { type: "bearer" })
          .send(body)
          .expect(403);
      }
      await request(app.getHttpServer())
        .post(`/reports/projects/${projectId}/members/member-admin/evaluation`)
        .auth(auth("admin"), { type: "bearer" })
        .send(body)
        .expect(403);
      await request(app.getHttpServer())
        .post(`${path}/evaluation`)
        .auth(auth("admin"), { type: "bearer" })
        .send({ ...body, score: 101 })
        .expect(400);
      await request(app.getHttpServer())
        .post(
          `/reports/projects/planning-other-project/members/member-worker/evaluation`,
        )
        .auth(auth("admin"), { type: "bearer" })
        .send(body)
        .expect(403);
      const created = await request(app.getHttpServer())
        .post(`${path}/evaluation`)
        .auth(auth("admin"), { type: "bearer" })
        .send(body)
        .expect(201);
      await request(app.getHttpServer())
        .post(
          `/reports/projects/${projectId}/members/report-peer-member/evaluation`,
        )
        .auth(auth("admin"), { type: "bearer" })
        .send(body)
        .expect(403);
      expect(created.body).toMatchObject({
        score: 92,
        reviewerName: "admin",
        comment: body.comment,
      });
      await request(app.getHttpServer())
        .post(`${path}/evaluation`)
        .auth(auth("admin"), { type: "bearer" })
        .send(body)
        .expect(409);
      const updates = await Promise.all(
        [90, 95].map((score) =>
          request(app.getHttpServer())
            .post(`${path}/evaluation`)
            .auth(auth("admin"), { type: "bearer" })
            .send({
              ...body,
              score,
              expectedUpdatedAt: created.body.updatedAt,
            }),
        ),
      );
      expect(updates.map((r) => r.status).sort()).toEqual([201, 409]);
      const current = updates.find((r) => r.status === 201)!.body;
      expect(current.updatedAt).not.toBe(created.body.updatedAt);
      expect(
        await database.auditLog.count({
          where: {
            entityType: "project_member_evaluation",
            entityId: created.body.id,
          },
        }),
      ).toBe(2);
      const detail = await request(app.getHttpServer())
        .get(path)
        .query({ from: "2030-01-01", to: "2030-01-21" })
        .auth(auth("admin"), { type: "bearer" })
        .expect(200);
      expect(detail.body).toMatchObject({
        canEvaluate: true,
        person: {
          projectId,
          projectName: projectId,
          workType: "木工",
          evaluation: { score: current.score },
        },
      });
      expect(
        detail.body.days.some(
          (day: { records: readonly { source: string }[] }) =>
            day.records.length > 0,
        ),
      ).toBe(true);
      const monthly = await request(app.getHttpServer())
        .get(`/reports/projects/${projectId}/monthly?month=2030-01`)
        .auth(auth("admin"), { type: "bearer" })
        .expect(200);
      const expectedMinutes = monthly.body.participants
        .filter((p: { memberId: string }) => p.memberId === "member-worker")
        .reduce(
          (sum: number, p: { workedMinutes: number }) => sum + p.workedMinutes,
          0,
        );
      expect(
        detail.body.days.reduce(
          (sum: number, day: { workedMinutes: number }) =>
            sum + day.workedMinutes,
          0,
        ),
      ).toBe(expectedMinutes);
      const team = await request(app.getHttpServer())
        .get(`/reports/teams/${teamId}/members/member-worker`)
        .query({ from: "2030-01-01", to: "2030-01-21" })
        .auth(auth("leader"), { type: "bearer" })
        .expect(200);
      expect(team.body.canEvaluate).toBe(false);
      const teamForAdmin = await request(app.getHttpServer())
        .get(`/reports/teams/${teamId}/members/member-worker`)
        .query({ from: "2030-01-01", to: "2030-01-21" })
        .auth(auth("admin"), { type: "bearer" })
        .expect(200);
      expect(teamForAdmin.body.canEvaluate).toBe(true);
      expect(
        team.body.days.every(
          (day: { teamName: string }) => day.teamName === teamId,
        ),
      ).toBe(true);
      await request(app.getHttpServer())
        .get(`/reports/teams/${teamId}/members/member-other`)
        .query({ from: "2030-01-01", to: "2030-01-21" })
        .auth(auth("leader"), { type: "bearer" })
        .expect(404);
      await request(app.getHttpServer())
        .get(path)
        .query({ from: "2030-01-01", to: "2030-02-05" })
        .auth(auth("admin"), { type: "bearer" })
        .expect(400);
      await request(app.getHttpServer())
        .get(path)
        .query({ from: "2030-01-01", to: "2030-01-21" })
        .auth(auth("worker"), { type: "bearer" })
        .expect(403);
    });

    test("company reports keep one shared worker separate by project and preserve independent scores", async () => {
      vi.setSystemTime(new Date("2030-01-21T04:00:00Z"));
      await database.projectWorkerMember.create({
        data: {
          id: "report-other-membership",
          workerId: "planning-worker",
          projectId: "planning-other-project",
          status: "ACTIVE",
          enteredAt: new Date("2030-01-01"),
          projectRoleLabel: "木工",
        },
      });
      await database.projectMemberEvaluation.create({
        data: {
          projectId: "planning-other-project",
          workerMemberId: "report-other-membership",
          score: 60,
          reviewerUserId: "planning-admin",
          comment: "另一项目评价",
        },
      });
      const companyRole = await database.role.findUniqueOrThrow({
        where: { code: "COMPANY_ADMIN" },
      });
      const grant = await database.userRole.create({
        data: {
          userId: "planning-admin",
          roleId: companyRole.id,
          scopeType: "COMPANY",
          scopeId: "planning-company",
        },
      });
      try {
        const report = await request(app.getHttpServer())
          .get("/reports/companies/planning-company/monthly?month=2030-01")
          .auth(auth("admin"), { type: "bearer" })
          .expect(200);
        const people = report.body.participants.filter(
          (p: { participantId: string }) =>
            p.participantId === "planning-worker",
        );
        expect(
          new Set(people.map((p: { projectId: string }) => p.projectId)),
        ).toEqual(new Set([projectId, "planning-other-project"]));
        expect(
          people.find(
            (p: { projectId: string }) =>
              p.projectId === "planning-other-project",
          ),
        ).toMatchObject({
          projectName: "planning-other-project",
          memberId: "report-other-membership",
          evaluation: { score: 60 },
        });
        expect(
          people
            .filter((p: { projectId: string }) => p.projectId === projectId)
            .every(
              (p: { evaluation: { score: number } }) =>
                p.evaluation.score !== 60,
            ),
        ).toBe(true);
        const detail = await request(app.getHttpServer())
          .get(
            "/reports/projects/planning-other-project/members/report-other-membership?from=2030-01-01&to=2030-01-21",
          )
          .auth(auth("admin"), { type: "bearer" })
          .expect(200);
        expect(
          detail.body.days.every(
            (day: { records: readonly unknown[] }) => day.records.length === 0,
          ),
        ).toBe(true);
      } finally {
        await database.userRole.delete({ where: { id: grant.id } });
      }
    });

    test("exports an immutable six-sheet workbook matching monthly statistics and rejects unauthorized downloads", async () => {
      vi.setSystemTime(new Date("2030-01-21T04:00:00Z"));
      const body = { scope: "PROJECT", scopeId: projectId, month: "2030-01" };
      for (const actor of ["worker", "leader"])
        await request(app.getHttpServer())
          .post("/report-exports")
          .auth(auth(actor), { type: "bearer" })
          .send(body)
          .expect(403);
      await request(app.getHttpServer())
        .post("/report-exports")
        .auth(auth("admin"), { type: "bearer" })
        .send({ ...body, month: "2030-13" })
        .expect(400);
      await request(app.getHttpServer())
        .post("/report-exports")
        .auth(auth("admin"), { type: "bearer" })
        .send({ ...body, month: "2030-02" })
        .expect(400);
      const jobs = await Promise.all(
        [0, 1].map(() =>
          request(app.getHttpServer())
            .post("/report-exports")
            .auth(auth("admin"), { type: "bearer" })
            .send(body)
            .expect(201),
        ),
      );
      const id = String(jobs[0]!.body.id);
      expect(jobs[1]!.body.id).toBe(id);
      await request(app.getHttpServer())
        .get(`/report-exports/${id}/file`)
        .auth(auth("admin"), { type: "bearer" })
        .expect(409);
      expect(await app.get(ReportExportsService).processNext()).toBe(true);
      const ready = await request(app.getHttpServer())
        .get(`/report-exports/${id}`)
        .auth(auth("admin"), { type: "bearer" })
        .expect(200);
      expect(ready.body.status).toBe("COMPLETED");
      await request(app.getHttpServer())
        .get(`/report-exports/${id}/file`)
        .auth(auth("worker"), { type: "bearer" })
        .expect(404);
      await request(app.getHttpServer())
        .get(`/report-exports/${id}/file`)
        .expect(401);
      const file = await request(app.getHttpServer())
        .get(`/report-exports/${id}/file`)
        .auth(auth("admin"), { type: "bearer" })
        .buffer(true)
        .parse(parseBinary)
        .expect(200);
      expect(file.headers["content-type"]).toContain("spreadsheetml.sheet");
      const bytes: Buffer = file.body;
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(bytes as never);
      expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
        "月度汇总",
        "每日明细",
        "补卡与异常",
        "安全记录",
        "打卡位置",
        "统计说明",
      ]);
      const report = await request(app.getHttpServer())
        .get(`/reports/projects/${projectId}/monthly?month=2030-01`)
        .auth(auth("admin"), { type: "bearer" })
        .expect(200);
      const summary = workbook.getWorksheet("月度汇总")!;
      const sum = (column: number): number =>
        summary
          .getColumn(column)
          .values.slice(2)
          .reduce<number>((total, value) => total + Number(value ?? 0), 0);
      expect(summary.getCell("R1").value).toBe("当前项目评分（0–100）");
      const scoredRows = summary
        .getColumn(18)
        .values.slice(2)
        .filter((value) => typeof value === "number");
      expect(scoredRows.length).toBeGreaterThan(0);
      const currentEvaluation =
        await database.projectMemberEvaluation.findFirstOrThrow({
          where: { projectId, workerMemberId: "member-worker" },
        });
      expect(
        scoredRows.every((value) => value === currentEvaluation.score),
      ).toBe(true);
      expect(summary.rowCount - 1).toBe(report.body.totals.participantCount);
      expect(sum(7)).toBe(report.body.totals.scheduledDays);
      expect(sum(8)).toBe(report.body.totals.actualAttendedDays);
      expect(sum(10)).toBe(report.body.totals.workedMinutes);
      expect(sum(24) * 60 + sum(25) * 60 + sum(26) * 60).toBeCloseTo(sum(10), 6);
      expect(sum(24) * 60).toBeCloseTo(report.body.totals.normalMinutes, 6);
      expect(sum(25) * 60).toBeCloseTo(report.body.totals.overtimeMinutes, 6);
      expect(sum(26) * 60).toBeCloseTo(report.body.totals.unclassifiedMinutes, 6);
      expect(workbook.getWorksheet("打卡位置")!.rowCount).toBeGreaterThan(1);
      expect(workbook.getWorksheet("打卡位置")!.getCell("I1").value).toBe("纬度（GCJ-02）");
      expect(sum(16)).toBe(report.body.totals.approvedMakeupCount);
      expect(summary.getCell("I2").formula).toBe('IF(G2=0,"不适用",H2/G2)');
      expect(summary.getCell("K2").formula).toBe("J2/60");
      const serialized = JSON.stringify(workbook.model);
      expect(serialized).not.toContain("13900000777");
      expect(serialized).not.toContain("selfieObjectKey");
      expect(workbook.getWorksheet("补卡与异常")!.rowCount).toBeGreaterThan(1);
      const daily = workbook.getWorksheet("每日明细")!;
      const minutes = daily
        .getColumn(11)
        .values.slice(2)
        .reduce<number>((total, value) => total + Number(value ?? 0), 0);
      expect(minutes).toBe(sum(10));
      await mkdir(join(process.cwd(), "../../.temp"), { recursive: true });
      await writeFile(
        join(process.cwd(), "../../.temp/monthly-report-sample.xlsx"),
        bytes,
      );
      await request(app.getHttpServer())
        .post(`/reports/projects/${projectId}/members/member-worker/evaluation`)
        .auth(auth("admin"), { type: "bearer" })
        .send({
          score: 0,
          comment: "测试修订零分",
          expectedUpdatedAt: currentEvaluation.updatedAt.toISOString(),
        })
        .expect(201);
      const again = await request(app.getHttpServer())
        .post("/report-exports")
        .auth(auth("admin"), { type: "bearer" })
        .send(body)
        .expect(201);
      expect(again.body.version).toBe(ready.body.version + 1);
      await app.get(ReportExportsService).processNext();
      const revised = await app
        .get(ReportExportsService)
        .download("planning-admin", String(again.body.id));
      const revisedWorkbook = new ExcelJS.Workbook();
      await revisedWorkbook.xlsx.load(revised.bytes as never);
      expect(
        revisedWorkbook.getWorksheet("月度汇总")!.getColumn(18).values,
      ).toContain(0);
      const old = await app
        .get(ReportExportsService)
        .download("planning-admin", id);
      expect(old.bytes.equals(bytes)).toBe(true);
      const grant = await database.userRole.findFirstOrThrow({
        where: { userId: "planning-admin" },
      });
      await database.userRole.delete({ where: { id: grant.id } });
      try {
        await request(app.getHttpServer())
          .get(`/report-exports/${id}/file`)
          .auth(auth("admin"), { type: "bearer" })
          .expect(403);
      } finally {
        await database.userRole.create({ data: grant });
      }
    });

    test("limits team exports to historical membership and safely regenerates interrupted jobs", async () => {
      const body = { scope: "TEAM", scopeId: teamId, month: "2030-01" };
      const result = await request(app.getHttpServer())
        .post("/report-exports")
        .auth(auth("leader"), { type: "bearer" })
        .send(body)
        .expect(201);
      const id = String(result.body.id);
      await database.reportExport.update({
        where: { id },
        data: {
          status: "PROCESSING",
          startedAt: new Date(Date.now() - 16 * 60_000),
        },
      });
      await app.get(ReportExportsService).processNext();
      expect(
        (await database.reportExport.findUniqueOrThrow({ where: { id } }))
          .status,
      ).toBe("FAILED");
      const retry = await request(app.getHttpServer())
        .post("/report-exports")
        .auth(auth("leader"), { type: "bearer" })
        .send(body)
        .expect(201);
      expect(retry.body.version).toBe(2);
      await app.get(ReportExportsService).processNext();
      const file = await app
        .get(ReportExportsService)
        .download("planning-leader", String(retry.body.id));
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(file.bytes as never);
      const teams = workbook
        .getWorksheet("每日明细")!
        .getColumn(2)
        .values.slice(2);
      expect(teams.length).toBeGreaterThan(0);
      expect(teams.every((name) => name === teamId)).toBe(true);
      expect(JSON.stringify(workbook.model)).not.toContain("Updated worker");
      const created = await request(app.getHttpServer())
        .post("/report-exports")
        .auth(auth("leader"), { type: "bearer" })
        .send(body)
        .expect(201);
      await database.user.update({
        where: { id: "planning-leader" },
        data: { status: "DISABLED" },
      });
      try {
        await expect(
          app.get(ReportExportsService).processNext(),
        ).rejects.toThrow("无权导出");
        expect(
          (
            await database.reportExport.findUniqueOrThrow({
              where: { id: String(created.body.id) },
            })
          ).status,
        ).toBe("FAILED");
      } finally {
        await database.user.update({
          where: { id: "planning-leader" },
          data: { status: "ACTIVE" },
        });
      }
    });

    test("report snapshots split actual hours, isolate incident detail and apply later corrections without mutating old files", async () => {
      vi.setSystemTime(new Date("2030-02-02T04:00:00Z"));
      const localProject = "report-hours-project";
      const otherProject = "report-hours-other-company-project";
      await database.company.create({ data: { id: "report-hours-other-company", name: "Other company", status: "ACTIVE" } });
      for (const id of [localProject, otherProject]) {
        await database.project.create({ data: {
          id, companyId: id === localProject ? "planning-company" : "report-hours-other-company", name: id,
          address: "Report test site", centerLatitude: "31", centerLongitude: "121", geofenceRadiusM: 300,
          status: "ACTIVE", plannedStartDate: new Date("2030-01-01"),
        } });
        await database.team.create({ data: { id: `${id}-team`, projectId: id, name: `${id}-team`, status: "ACTIVE" } });
        await database.projectWorkerMember.create({ data: { id: `${id}-member`, projectId: id, teamId: `${id}-team`, workerId: "planning-worker", status: "ACTIVE", enteredAt: new Date("2030-01-01"), projectRoleLabel: "木工" } });
      }
      await database.attendancePlan.create({ data: {
        projectId: localProject, scopeType: "PROJECT", scopeId: localProject, authorRoleLevel: 3,
        startsOn: new Date("2030-01-01"), name: "Report shift", points: [...defaultAttendancePoints], workdayMask: 127,
      } });
      await database.projectWorktimeRule.create({ data: {
        projectId: localProject, version: 1, startsOn: new Date("2030-01-01"), projectKind: "REGULAR",
        lunchStart: "12:00", lunchEnd: "13:00", overtimeStart: "18:00", createdByUserId: "planning-admin",
      } });
      for (const [date, pointCode, time] of [
        ["2030-01-30", defaultAttendancePoints[0]!.code, "08:00"], ["2030-01-30", defaultAttendancePoints[1]!.code, "20:00"],
        ["2030-01-31", "OVERTIME_2030-01-31_START", "22:00"], ["2030-02-01", "OVERTIME_2030-01-31_END", "02:00"],
      ] as const) {
        await database.attendanceRecord.create({ data: {
          projectId: localProject, participantType: "WORKER", participantId: "planning-worker", attendanceDate: new Date(date),
          pointCode, source: "DEVICE", status: "VALID", occurredAt: new Date(`${date}T${time}:00+08:00`),
          latitude: "31.0001", longitude: "121.0001", locationAccuracyM: "5", geofenceDistanceM: "12",
          selfieObjectKey: "private/face.jpg", sitePhotoObjectKey: "private/site.jpg", selfieHash: "a".repeat(64), sitePhotoHash: "b".repeat(64), facePassed: true,
        } });
      }
      for (const id of [localProject, otherProject]) {
        await database.safetyViolation.create({ data: {
          id: `${id}-violation`, projectId: id, teamId: `${id}-team`, memberId: `${id}-member`, workerId: "planning-worker",
          eventKey: `${id}-event`, category: "未戴安全帽", severity: "GENERAL", occurredAt: new Date("2030-01-30T09:00:00+08:00"),
          description: id === localProject ? "本项目事件" : "其他公司保密事件", points: 5, policyVersion: 1, status: "CONFIRMED",
          createdByUserId: "planning-admin", createdAt: new Date("2030-01-30T09:00:00+08:00"),
          decisions: { create: { action: "CONFIRM", actorUserId: "planning-admin", reason: "核实", createdAt: new Date("2030-01-30T10:00:00+08:00") } },
        } });
      }
      const reports = app.get(ReportsService);
      const snapshot = await reports.monthlySnapshot([localProject], `${localProject}-team`, localProject, "2030-01");
      expect(snapshot.report.totals).toMatchObject({ normalMinutes: 540, overtimeMinutes: 240, unclassifiedMinutes: 0, workedMinutes: 780, confirmedViolationCount: 1 });
      expect(snapshot.report.participants[0]).toMatchObject({ safetyCreditScore: 90, safetyCreditAsOf: "2030-01-31T15:59:59.999Z" });
      expect(snapshot.rows.flatMap((row) => row.safetyEvents).map((row) => row.description)).toEqual(["本项目事件"]);
      const february = await reports.getDailyReport(localProject, "2030-02-01");
      expect(february.totals).toMatchObject({ normalMinutes: 0, overtimeMinutes: 120, workedMinutes: 120 });
      const detail = await reports.personDetail(localProject, `${localProject}-member`, `${localProject}-team`, "2030-01-30", "2030-01-30");
      expect(detail.days[0]!.records[0]).toMatchObject({ latitude: "31.0001", longitude: "121.0001", locationAccuracyM: "5" });
      const job = await database.reportExport.create({ data: {
        projectId: localProject, companyId: "planning-company", scope: "PROJECT", dataCutoffAt: new Date(), month: new Date("2030-01-01"), version: 1,
        requestedByUserId: "planning-admin", calculationVersion: REPORT_CALCULATION_VERSION,
      } });
      const originalBytes = await createMonthlyWorkbook(job, "本项目", snapshot);
      const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(originalBytes as never);
      expect(workbook.getWorksheet("安全记录")!.rowCount).toBe(2);
      expect(workbook.getWorksheet("打卡位置")!.rowCount).toBe(4);
      expect(JSON.stringify(workbook.model)).not.toContain("其他公司保密事件");
      expect(JSON.stringify(workbook.model)).not.toContain("private/face.jpg");
      await database.safetyCreditDecision.create({ data: { violationId: `${localProject}-violation`, action: "REVOKE", actorUserId: "planning-admin", reason: "申诉核实撤销", createdAt: new Date("2030-02-02T01:00:00Z") } });
      const corrected = await reports.monthlySnapshot([localProject], `${localProject}-team`, localProject, "2030-01");
      expect(corrected.report.participants[0]!.safetyCreditScore).toBe(95);
      expect(corrected.report.totals.confirmedViolationCount).toBe(0);
      expect(snapshot.report.participants[0]!.safetyCreditScore).toBe(90);
      expect(workbook.getWorksheet("月度汇总")!.getCell("AA2").value).toBe(90);
    });
  },
);
