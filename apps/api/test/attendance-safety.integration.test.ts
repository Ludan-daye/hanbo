import { taskPointCode } from "@construction/domain";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import type {
  AttendanceSafetyNotice,
  AttendanceSafetyReceipt,
} from "@construction/domain";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { AppModule } from "../src/app.module.js";
import { API_ENV } from "../src/config/env.module.js";
import { loadEnv } from "../src/config/env.js";
import { PrismaService } from "../src/infrastructure/database/prisma.service.js";
import { encryptPersonnelName } from "../src/management/personnel-name.js";

const projectId: string = "safety-project";
const teamId: string = "safety-team";
const date: string = "2030-01-07";
const base: string = `/attendance/projects/${projectId}`;
const position = { latitude: "31", longitude: "121", locationAccuracyM: "5" };

describe.skipIf(process.env.DATABASE_FOUNDATION_TEST_URL === undefined)(
  "per-punch safety over real HTTP and PostgreSQL",
  () => {
    let app: INestApplication;
    let db: PrismaService;
    let uploads: string;
    let photo: { objectKey: string; hash: string };
    const tokens: Map<string, string> = new Map();
    const token = (actor: string): string => {
      const value = tokens.get(actor);
      if (!value) throw new Error(`Missing test actor: ${actor}`);
      return value;
    };
    const notice = async (
      actor: string,
      pointCode: string,
    ): Promise<AttendanceSafetyNotice> => {
      const result = await request(app.getHttpServer())
        .get(`${base}/safety`)
        .query({ pointCode })
        .auth(token(actor), { type: "bearer" })
        .expect(200);
      return result.body as AttendanceSafetyNotice;
    };
    const confirm = async (
      actor: string,
      pointCode: string,
    ): Promise<AttendanceSafetyReceipt> => {
      const current = await notice(actor, pointCode);
      const result = await request(app.getHttpServer())
        .post(`${base}/safety-confirmations`)
        .auth(token(actor), { type: "bearer" })
        .send({
          pointCode,
          baselineVersion: current.baselineVersion,
          briefingIds: current.briefings.map((row) => row.id),
        })
        .expect(201);
      return result.body as AttendanceSafetyReceipt;
    };
    const publish = async (title: string): Promise<string> => {
      await request(app.getHttpServer())
        .post(`/team-work/teams/${teamId}/briefings`)
        .auth(token("leader"), { type: "bearer" })
        .send({
          workDate: date,
          title,
          content: "作业前先断电验电，检查防护用品。",
        })
        .expect(201);
      return (
        await db.teamSafetyBriefing.findFirstOrThrow({
          where: { teamId, title },
        })
      ).id;
    };
    const face = (
      actor: string,
      pointCode: string,
      safetyConfirmationId: string | undefined,
    ): request.Test =>
      request(app.getHttpServer())
        .post(`${base}/face-verifications/video`)
        .auth(token(actor), { type: "bearer" })
        .send({ pointCode, ...position, safetyConfirmationId });
    const punch = (
      pointCode: string,
      safetyConfirmationId: string | undefined,
    ): request.Test =>
      request(app.getHttpServer())
        .post(`${base}/records`)
        .auth(token("worker"), { type: "bearer" })
        .send({
          ...position,
          attendanceDate: date,
          pointCode,
          occurredAt: `${date}T${pointCode === "START" ? "08:00" : "10:00"}:00+08:00`,
          safetyConfirmationId,
          sitePhotoObjectKey: photo.objectKey,
          sitePhotoHash: photo.hash,
          selfieObjectKey: "test/selfie.png",
          selfieHash: "test-selfie",
        });

    const taskPhotos: Map<string, { objectKey: string; hash: string }> =
      new Map();
    const renewSession = async (actor: string): Promise<void> => {
      const userId: string = `safety-${actor}`;
      const session = await db.userSession.findFirstOrThrow({
        where: { userId },
      });
      await db.userSession.update({
        where: { id: session.id },
        data: { expiresAt: new Date(Date.now() + 86400000) },
      });
      tokens.set(
        actor,
        await app
          .get(JwtService)
          .signAsync(
            { sub: userId, sid: session.id, sv: 1 },
            { secret: process.env.JWT_ACCESS_TOKEN_SECRET!, expiresIn: 86400 },
          ),
      );
    };
    const prepareTemporary = async (
      actor: string,
      phone: string,
      startsAt: string,
      endsAt: string,
    ): Promise<{ taskId: string; memberId: string; workerId: string }> => {
      const userId: string = `safety-${actor}`;
      await db.user.create({
        data: {
          id: userId,
          openid: userId,
          isBound: false,
          encryptedRealName: encryptPersonnelName(
            actor,
            "ab".repeat(32),
            randomBytes(12),
          ),
          phone,
          nickname: actor,
          avatarObjectKey: "test/avatar.png",
        },
      });
      const session = await db.userSession.create({
        data: {
          userId,
          tokenHash: createHash("sha256").update(userId).digest("hex"),
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      tokens.set(
        actor,
        await app
          .get(JwtService)
          .signAsync(
            { sub: userId, sid: session.id, sv: 1 },
            { secret: process.env.JWT_ACCESS_TOKEN_SECRET!, expiresIn: 86400 },
          ),
      );
      const task = await request(app.getHttpServer())
        .post(`/team-work/teams/${teamId}/tasks`)
        .auth(token("leader"), { type: "bearer" })
        .send({
          title: "临时维修",
          description: "灯具维修",
          workType: "电工",
          startsAt,
          endsAt,
          memberIds: [],
        })
        .expect(201);
      const invite = await request(app.getHttpServer())
        .post(`/team-work/teams/${teamId}/tasks/${task.body.id}/invitations`)
        .auth(token("leader"), { type: "bearer" })
        .send({ realName: actor, phone })
        .expect(201);
      const joined = await request(app.getHttpServer())
        .post("/team-work/me/join")
        .auth(token(actor), { type: "bearer" })
        .send({ code: invite.body.code })
        .expect(201);
      const worker = await db.workerProfile.findUniqueOrThrow({
        where: { userId },
      });
      await db.workerProfile.update({
        where: { id: worker.id },
        data: {
          registrationCompletedAt: new Date(),
          faceProfileStatus: "APPROVED",
          realNameStatus: "VERIFIED",
        },
      });
      const upload = await request(app.getHttpServer())
        .post("/uploads")
        .auth(token(actor), { type: "bearer" })
        .attach(
          "file",
          Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jSAAAAABJRU5ErkJggg==",
            "base64",
          ),
          { filename: "site.png", contentType: "image/png" },
        )
        .expect(201);
      taskPhotos.set(actor, upload.body as { objectKey: string; hash: string });
      return {
        taskId: String(task.body.id),
        memberId: String(joined.body.memberId),
        workerId: worker.id,
      };
    };
    const taskPunch = (
      actor: string,
      code: string,
      confirmationId: string | undefined,
    ): request.Test => {
      const image = taskPhotos.get(actor)!;
      return request(app.getHttpServer())
        .post(`${base}/records`)
        .auth(token(actor), { type: "bearer" })
        .send({
          ...position,
          pointCode: code,
          attendanceDate: new Date(Date.now() + 8 * 3600000)
            .toISOString()
            .slice(0, 10),
          occurredAt: new Date().toISOString(),
          safetyConfirmationId: confirmationId,
          sitePhotoObjectKey: image.objectKey,
          sitePhotoHash: image.hash,
          selfieObjectKey: "test/selfie.png",
          selfieHash: "test-selfie",
        });
    };

    beforeAll(async () => {
      const url: string | undefined = process.env.DATABASE_FOUNDATION_TEST_URL;
      if (
        !url ||
        !new URL(url).searchParams
          .get("schema")
          ?.startsWith("database_foundation_")
      )
        throw new Error("Use isolated local database schema.");
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(`${date}T00:00:00Z`));
      uploads = await mkdtemp(join(tmpdir(), "hanbo-safety-"));
      const env = loadEnv({
        ...process.env,
        DATABASE_URL: url,
        NODE_ENV: "test",
        UPLOADS_DIR: uploads,
        FACE_DEV_STUB: "true",
        TENCENT_FACE_MODE: "WECHAT_NATIVE",
        TENCENT_FACE_RULE_ID: "",
        TENCENT_SECRET_ID: "",
        TENCENT_SECRET_KEY: "",
        PERSONNEL_ENCRYPTION_KEY: "ab".repeat(32),
      });
      const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(API_ENV)
        .useValue(env)
        .compile();
      app = module.createNestApplication();
      await app.init();
      db = app.get(PrismaService);
      await db.company.create({
        data: { id: "safety-company", name: "安全测试公司", status: "ACTIVE" },
      });
      await db.project.create({
        data: {
          id: projectId,
          companyId: "safety-company",
          name: "安全测试工地",
          address: "测试工地",
          centerLatitude: 31,
          centerLongitude: 121,
          geofenceRadiusM: 300,
          status: "ACTIVE",
          plannedStartDate: new Date("2030-01-01"),
        },
      });
      await db.team.create({
        data: { id: teamId, projectId, name: "测试班组", status: "ACTIVE" },
      });
      for (const actor of ["leader", "worker", "other"]) {
        const id: string = `safety-${actor}`;
        const encryptedName: string = encryptPersonnelName(
          actor,
          env.PERSONNEL_ENCRYPTION_KEY,
          randomBytes(12),
        );
        await db.user.create({
          data: {
            id,
            openid: id,
            isBound: true,
            encryptedRealName: encryptedName,
            phone: `1380000060${["leader", "worker", "other"].indexOf(actor)}`,
            nickname: actor,
            avatarObjectKey: "test/avatar.png",
          },
        });
        if (actor !== "leader")
          await db.workerProfile.create({
            data: {
              id,
              userId: id,
              encryptedName,
              phone: `1380000060${actor === "worker" ? 1 : 2}`,
              workType: "电工",
              employmentStatus: "ACTIVE",
              faceProfileStatus: "APPROVED",
              realNameStatus: "VERIFIED",
              registrationCompletedAt: new Date(),
              projectMemberships: {
                create: {
                  id: `safety-member-${actor}`,
                  projectId,
                  teamId,
                  status: "ACTIVE",
                  enteredAt: new Date("2030-01-01"),
                  projectRoleLabel: "电工",
                },
              },
            },
          });
        const role = await db.role.findUniqueOrThrow({
          where: { code: actor === "leader" ? "TEAM_LEADER" : "WORKER" },
        });
        await db.userRole.create({
          data: {
            userId: id,
            roleId: role.id,
            scopeType: "TEAM",
            scopeId: teamId,
          },
        });
        const session = await db.userSession.create({
          data: {
            userId: id,
            tokenHash: createHash("sha256").update(id).digest("hex"),
            expiresAt: new Date("2031-01-01"),
          },
        });
        tokens.set(
          actor,
          await app
            .get(JwtService)
            .signAsync(
              { sub: id, sid: session.id, sv: 1 },
              { secret: env.JWT_ACCESS_TOKEN_SECRET, expiresIn: 86400 },
            ),
        );
      }
      const upload = await request(app.getHttpServer())
        .post("/uploads")
        .auth(token("worker"), { type: "bearer" })
        .attach(
          "file",
          Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jSAAAAABJRU5ErkJggg==",
            "base64",
          ),
          { filename: "site.png", contentType: "image/png" },
        )
        .expect(201);
      photo = upload.body as { objectKey: string; hash: string };
    });
    afterAll(async () => {
      vi.useRealTimers();
      if (app) await app.close();
      if (uploads) await rm(uploads, { recursive: true, force: true });
    });

    test("blocks face and attendance without the current person's per-point confirmation", async () => {
      expect(
        (await face("worker", "START", undefined).expect(403)).body.message,
      ).toBe("SAFETY_CONFIRMATION_REQUIRED");
      expect((await punch("START", undefined).expect(403)).body.message).toBe(
        "SAFETY_CONFIRMATION_REQUIRED",
      );
      const receipt = await confirm("worker", "START");
      expect(
        (await face("other", "START", receipt.id).expect(403)).body.message,
      ).toBe("SAFETY_CONFIRMATION_EXPIRED");
      expect(
        (await face("worker", "END", receipt.id).expect(403)).body.message,
      ).toBe("SAFETY_CONFIRMATION_EXPIRED");
      expect(
        (await face("worker", "START", receipt.id).expect(400)).body.message,
      ).toBe("FACE_VIDEO_PROVIDER_NOT_CONFIGURED");
      await db.attendanceSafetyConfirmation.update({
        where: { id: receipt.id },
        data: { expiresAt: new Date(Date.now() - 1) },
      });
      expect(
        (await face("worker", "START", receipt.id).expect(403)).body.message,
      ).toBe("SAFETY_CONFIRMATION_EXPIRED");
      expect(await db.attendanceRecord.count({ where: { projectId } })).toBe(0);
      expect(
        await db.faceVerificationSession.count({ where: { projectId } }),
      ).toBe(0);
    });

    test("invalidates stale notices and keeps the exact acknowledged text with the worker and time", async () => {
      const before = await confirm("worker", "START");
      const briefingId: string = await publish("用电安全交底");
      expect(
        (await face("worker", "START", before.id).expect(409)).body.message,
      ).toBe("SAFETY_BRIEFING_CHANGED");
      const current = await notice("worker", "START");
      await request(app.getHttpServer())
        .post(`${base}/safety-confirmations`)
        .auth(token("worker"), { type: "bearer" })
        .send({
          pointCode: "START",
          baselineVersion: current.baselineVersion,
          briefingIds: [],
        })
        .expect(409);
      const receipt = await confirm("worker", "START");
      const row = await db.attendanceSafetyConfirmation.findUniqueOrThrow({
        where: { id: receipt.id },
      });
      expect(row.snapshot).toEqual(current);
      expect(row).toMatchObject({
        userId: "safety-worker",
        projectId,
        teamId,
        memberId: "safety-member-worker",
        briefingIds: [briefingId],
      });
      expect(row.expiresAt.getTime() - row.confirmedAt.getTime()).toBe(
        15 * 60000,
      );
      expect(
        await db.teamSafetyAcknowledgement.findUnique({
          where: {
            briefingId_memberId: {
              briefingId,
              memberId: "safety-member-worker",
            },
          },
        }),
      ).toMatchObject({ userId: "safety-worker" });
      await publish("补充高处作业交底");
      expect((await punch("START", receipt.id).expect(409)).body.message).toBe(
        "SAFETY_BRIEFING_CHANGED",
      );
    });

    test("stores a distinct receipt per punch and derives actual time only from successful attendance", async () => {
      const start = await confirm("worker", "START");
      const entered = await punch("START", start.id).expect(201);
      expect(entered.body.result.workedMinutes).toBe(0);
      expect(
        await db.attendanceRecord.findUnique({
          where: { safetyConfirmationId: start.id },
        }),
      ).toMatchObject({ participantId: "safety-worker", pointCode: "START" });
      await punch("END", start.id).expect(403);
      vi.setSystemTime(new Date(`${date}T02:00:00Z`));
      const end = await confirm("worker", "END");
      const exited = await punch("END", end.id).expect(201);
      expect(exited.body.result.workedMinutes).toBe(120);
      expect(await db.attendanceRecord.count({ where: { projectId } })).toBe(2);
      await punch("END", end.id).expect(403);
    });

    test("temporary invitation leads to real task hours and authorized exit without changing regular workers", async () => {
      vi.setSystemTime(new Date("2030-01-07T02:00:00Z"));
      const person = await prepareTemporary(
        "temporary",
        "13800000603",
        "2030-01-07T10:00:00+08:00",
        "2030-01-07T14:00:00+08:00",
      );
      expect(
        (
          await db.projectWorkerMember.findUniqueOrThrow({
            where: { id: person.memberId },
          })
        ).taskAttendanceOnly,
      ).toBe(true);
      const normal = await request(app.getHttpServer())
        .get(`/me/projects/${projectId}/attendance-today`)
        .auth(token("temporary"), { type: "bearer" })
        .expect(200);
      expect(normal.body).toMatchObject({ points: [], isWorkday: false });
      const startCode: string = taskPointCode(person.taskId, "START");
      const endCode: string = taskPointCode(person.taskId, "END");
      await face("other", startCode, undefined).expect(403);
      await taskPunch("temporary", startCode, undefined).expect(403);
      const receipt = await confirm("temporary", startCode);
      const started = await taskPunch(
        "temporary",
        startCode,
        receipt.id,
      ).expect(201);
      expect(started.body.result.workedMinutes).toBe(0);
      await taskPunch("temporary", startCode, receipt.id).expect(409);
      await request(app.getHttpServer())
        .put(`/team-work/teams/${teamId}/tasks/${person.taskId}/status`)
        .auth(token("leader"), { type: "bearer" })
        .send({ status: "COMPLETED" })
        .expect(409);
      await request(app.getHttpServer())
        .post(
          `/team-work/teams/${teamId}/tasks/${person.taskId}/members/${person.memberId}/exit`,
        )
        .auth(token("leader"), { type: "bearer" })
        .expect(409);
      const competing = await request(app.getHttpServer())
        .post(`/team-work/teams/${teamId}/tasks`)
        .auth(token("leader"), { type: "bearer" })
        .send({
          title: "另一个任务",
          description: "禁止重叠计时",
          workType: "电工",
          startsAt: "2030-01-07T10:00:00+08:00",
          endsAt: "2030-01-07T15:00:00+08:00",
          memberIds: [person.memberId],
        })
        .expect(201);
      await request(app.getHttpServer())
        .get(`${base}/safety`)
        .query({ pointCode: taskPointCode(String(competing.body.id), "START") })
        .auth(token("temporary"), { type: "bearer" })
        .expect(409);
      vi.setSystemTime(new Date("2030-01-07T05:00:00Z"));
      const endReceipt = await confirm("temporary", endCode);
      const finished = await taskPunch(
        "temporary",
        endCode,
        endReceipt.id,
      ).expect(201);
      expect(finished.body.result.workedMinutes).toBe(180);
      const daily = await request(app.getHttpServer())
        .get(`/reports/teams/${teamId}/daily?date=${date}`)
        .auth(token("leader"), { type: "bearer" })
        .expect(200);
      expect(
        daily.body.participants.find(
          (row: { participantId: string }) =>
            row.participantId === person.workerId,
        ),
      ).toMatchObject({
        workedMinutes: 180,
        isLate: false,
        isEarlyLeave: false,
      });
      await request(app.getHttpServer())
        .post(
          `/team-work/teams/${teamId}/tasks/${person.taskId}/members/${person.memberId}/exit`,
        )
        .auth(token("other"), { type: "bearer" })
        .expect(403);
      await request(app.getHttpServer())
        .post(
          `/team-work/teams/${teamId}/tasks/${person.taskId}/members/${person.memberId}/exit`,
        )
        .auth(token("leader"), { type: "bearer" })
        .expect(409);
      await request(app.getHttpServer())
        .put(`/team-work/teams/${teamId}/tasks/${competing.body.id}/status`)
        .auth(token("leader"), { type: "bearer" })
        .send({ status: "CANCELLED" })
        .expect(200);
      await request(app.getHttpServer())
        .post(
          `/team-work/teams/${teamId}/tasks/${person.taskId}/members/${person.memberId}/exit`,
        )
        .auth(token("leader"), { type: "bearer" })
        .expect(201);
      const exited = await db.projectWorkerMember.findUniqueOrThrow({
        where: { id: person.memberId },
      });
      expect(exited.status).toBe("EXITED");
      expect(
        (
          await db.workerProfile.findUniqueOrThrow({
            where: { id: person.workerId },
          })
        ).faceProfileStatus,
      ).toBe("APPROVED");
      const saved = await request(app.getHttpServer())
        .post(`/team-work/teams/${teamId}/daily/${date}`)
        .auth(token("leader"), { type: "bearer" })
        .expect(201);
      expect(saved.body.workedMinutes).toBeGreaterThanOrEqual(180);
      const history = await request(app.getHttpServer())
        .get(`/team-work/me/tasks?date=${date}`)
        .auth(token("temporary"), { type: "bearer" })
        .expect(200);
      expect(
        history.body.find((row: { id: string }) => row.id === person.taskId)
          .assignments[0],
      ).toMatchObject({ workedMinutes: 180, taskAttendanceOnly: true });
    });

    test("requires a supervisor to recover a missed task finish using actual time", async () => {
      vi.setSystemTime(new Date("2030-01-09T00:00:00Z"));
      await renewSession("leader");
      const person = await prepareTemporary(
        "forgotfinish",
        "13800000605",
        "2030-01-09T08:00:00+08:00",
        "2030-01-09T12:00:00+08:00",
      );
      const start: string = taskPointCode(person.taskId, "START");
      const end: string = taskPointCode(person.taskId, "END");
      await taskPunch(
        "forgotfinish",
        start,
        (await confirm("forgotfinish", start)).id,
      ).expect(201);
      vi.setSystemTime(new Date("2030-01-11T01:00:00Z"));
      await Promise.all(["leader", "other", "forgotfinish"].map(renewSession));
      const apply = (pointCode: string, requestedOccurredAt: string) =>
        request(app.getHttpServer())
          .post(`/makeups/projects/${projectId}/requests`)
          .auth(token("forgotfinish"), { type: "bearer" })
          .send({
            attendanceDate: "2030-01-09",
            pointCode,
            requestedOccurredAt,
            reason: "现场完工后忘记打卡，请核实",
          });
      await apply(start, "2030-01-09T11:00:00+08:00").expect(400);
      await apply(end, "2030-01-09T07:00:00+08:00").expect(400);
      const submitted = await apply(end, "2030-01-09T11:00:00+08:00").expect(
        201,
      );
      await apply(end, "2030-01-09T11:00:00+08:00").expect(409);
      const review = (actor: string) =>
        request(app.getHttpServer())
          .post(`/makeups/requests/${submitted.body.id}/approve`)
          .auth(token(actor), { type: "bearer" })
          .send({ approvalReason: "已核实实际完工时间" });
      await review("forgotfinish").expect(403);
      await review("other").expect(403);
      const approved = await review("leader").expect(201);
      const reviewed = await request(app.getHttpServer())
        .get("/makeups/reviewed")
        .auth(token("leader"), { type: "bearer" })
        .expect(200);
      expect(reviewed.body.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: submitted.body.id,
            status: "APPROVED",
            approvalReason: "已核实实际完工时间",
          }),
        ]),
      );
      const foreignHistory = await request(app.getHttpServer())
        .get("/makeups/reviewed")
        .auth(token("other"), { type: "bearer" })
        .expect(200);
      expect(foreignHistory.body.items).toEqual([]);
      expect(approved.body.result).toMatchObject({
        workedMinutes: 180,
        isMissingPunch: false,
      });
      const result = await db.attendanceResult.findFirstOrThrow({
        where: {
          participantId: person.workerId,
          attendanceDate: new Date("2030-01-09"),
        },
      });
      expect(result.approvedMakeupCount).toBe(1);
      expect(
        await db.teamTaskAssignment.findFirstOrThrow({
          where: { taskId: person.taskId },
        }),
      ).toMatchObject({ finishedAt: new Date("2030-01-09T11:00:00+08:00") });
      await request(app.getHttpServer())
        .post(
          `/team-work/teams/${teamId}/tasks/${person.taskId}/members/${person.memberId}/exit`,
        )
        .auth(token("leader"), { type: "bearer" })
        .expect(201);
      await request(app.getHttpServer())
        .post(
          `/team-work/teams/${teamId}/tasks/${person.taskId}/members/${person.memberId}/exit`,
        )
        .auth(token("leader"), { type: "bearer" })
        .expect(201);
    });

    test("splits cross-midnight actual work by day and never invents hours for unfinished work", async () => {
      vi.setSystemTime(new Date("2030-01-07T15:00:00Z"));
      const person = await prepareTemporary(
        "nightworker",
        "13800000604",
        "2030-01-07T23:00:00+08:00",
        "2030-01-08T02:00:00+08:00",
      );
      const start = taskPointCode(person.taskId, "START");
      await taskPunch(
        "nightworker",
        start,
        (await confirm("nightworker", start)).id,
      ).expect(201);
      vi.setSystemTime(new Date("2030-01-07T18:01:00Z"));
      const pending = await request(app.getHttpServer())
        .get(`/reports/teams/${teamId}/daily?date=2030-01-08`)
        .auth(token("leader"), { type: "bearer" })
        .expect(200);
      expect(
        pending.body.participants.find(
          (row: { participantId: string }) =>
            row.participantId === person.workerId,
        ),
      ).toMatchObject({ workedMinutes: 0, isMissingPunch: true });
      vi.setSystemTime(new Date("2030-01-07T18:00:00Z"));
      const end = taskPointCode(person.taskId, "END");
      await taskPunch(
        "nightworker",
        end,
        (await confirm("nightworker", end)).id,
      ).expect(201);
      for (const [day, minutes] of [
        ["2030-01-07", 60],
        ["2030-01-08", 120],
      ] as const) {
        const report = await request(app.getHttpServer())
          .get(`/reports/teams/${teamId}/daily?date=${day}`)
          .auth(token("leader"), { type: "bearer" })
          .expect(200);
        expect(
          report.body.participants.find(
            (row: { participantId: string }) =>
              row.participantId === person.workerId,
          ),
        ).toMatchObject({ workedMinutes: minutes });
      }
    });
  },
);
