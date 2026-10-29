import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import request from "supertest";
import type { Test as HttpTest } from "supertest";
import { faceid } from "tencentcloud-sdk-nodejs-faceid";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";

import { AppModule } from "../src/app.module.js";
import { FACE_CONSENT_VERSION } from "../src/face/face.types.js";
import { PrismaService } from "../src/infrastructure/database/prisma.service.js";

type CloudClient = InstanceType<typeof faceid.v20180301.Client>;
type AuthResult = Awaited<ReturnType<CloudClient["DetectAuth"]>>;
type VideoResult = Awaited<ReturnType<CloudClient["LivenessCompare"]>>;
const videoMode: boolean = process.env.FACE_TEST_MODE === "VIDEO_ACTION";
const sessionRoute: string = videoMode
  ? "/face-verifications/video"
  : "/face-verifications";
const completionPath = (projectId: string, id: string): string =>
  `/attendance/projects/${projectId}/face-verifications/${id}/${videoMode ? "video" : "complete"}`;
const videoBytes = (id: string): Buffer =>
  Buffer.concat([
    Buffer.from("000000186674797069736F6D00000200", "hex"),
    Buffer.from(id),
  ]);

type DetectResult = Awaited<ReturnType<CloudClient["GetDetectInfoEnhanced"]>>;
type CloudResult = {
  readonly sessionId: string;
  readonly liveStatus: number;
  readonly compareStatus: number;
  readonly score: string;
  readonly library: string;
  readonly resultPending?: boolean;
};
type Login = { readonly userId: string; readonly token: string };
type Issued = {
  readonly id: string;
  readonly bizToken: string;
  readonly expiresAt: string;
};

// Only Tencent's remote boundary is simulated; HTTP guards, persistence and transactions are real.
describe.skipIf(process.env.FACE_TEST_DATABASE_URL === undefined)(
  `${videoMode ? "video action" : "native"} face verification with PostgreSQL`,
  () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let uploadsDir: string;
    let worker: Login;
    let otherWorker: Login;
    let reviewer: Login;
    let projectId: string;
    let otherProjectId: string;
    let projectAdminRoleId: string;
    let attendanceDate: string;
    const cloud = new Map<string, CloudResult>();
    const photo = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
      "base64",
    );

    beforeAll(async (): Promise<void> => {
      const databaseUrl = process.env.FACE_TEST_DATABASE_URL;
      if (
        databaseUrl === undefined ||
        new URL(databaseUrl).searchParams.get("schema") !==
          "face_native_integration"
      )
        throw new Error(
          "FACE_TEST_DATABASE_URL must use the isolated face_native_integration schema",
        );
      uploadsDir = await mkdtemp(join(tmpdir(), "hanbo-face-integration-"));
      Object.assign(process.env, {
        DATABASE_URL: databaseUrl,
        NODE_ENV: "test",
        API_PORT: "3000",
        FACE_DEV_STUB: "false",
        TENCENT_FACE_MODE: videoMode ? "VIDEO_ACTION" : "WECHAT_NATIVE",
        TENCENT_FACE_RULE_ID: videoMode ? "" : "integration-rule",
        TENCENT_SECRET_ID: "integration-key",
        TENCENT_SECRET_KEY: "integration-secret",
        JWT_ACCESS_TOKEN_SECRET:
          "face-integration-secret-at-least-32-characters",
        JWT_ACCESS_TOKEN_TTL_SECONDS: "900",
        AUTH_REFRESH_TOKEN_TTL_SECONDS: "2592000",
        WECHAT_APP_ID: "integration-app",
        WECHAT_APP_SECRET: "integration-secret",
        WECHAT_DEV_LOGIN: "true",
        FACE_SERVICE_API_KEY: "unused",
        FACE_SERVICE_BASE_URL: "http://localhost:8000",
        OBJECT_STORAGE_ACCESS_KEY: "unused",
        OBJECT_STORAGE_SECRET_KEY: "unused",
        OBJECT_STORAGE_BUCKET: "integration",
        OBJECT_STORAGE_ENDPOINT: "http://localhost:9000",
        UPLOADS_DIR: uploadsDir,
      });
      vi.spyOn(
        faceid.v20180301.Client.prototype,
        "DetectAuth",
      ).mockImplementation(async (input): Promise<AuthResult> => {
        expect(Buffer.from(input.ImageBase64 ?? "", "base64")).toEqual(photo);
        expect(input.RuleId).toBe("integration-rule");
        const bizToken = randomUUID();
        cloud.set(bizToken, {
          sessionId: input.Extra ?? "",
          liveStatus: 0,
          compareStatus: 0,
          score: "100",
          library: "业务方自有库",
        });
        return { BizToken: bizToken, RequestId: randomUUID() };
      });
      vi.spyOn(
        faceid.v20180301.Client.prototype,
        "GetDetectInfoEnhanced",
      ).mockImplementation(async (input): Promise<DetectResult> => {
        const result = cloud.get(input.BizToken);
        if (result === undefined)
          throw new Error("Unknown integration BizToken");
        if (result.resultPending === true) return { RequestId: randomUUID() };
        return {
          RequestId: randomUUID(),
          Text: {
            Extra: result.sessionId,
            ErrCode:
              result.liveStatus === 0 && result.compareStatus === 0 ? 0 : -1,
            LiveStatus: result.liveStatus,
            Comparestatus: result.compareStatus,
            Sim: result.score,
            CompareLibType: result.library,
          },
          BestFrame: { BestFrame: photo.toString("base64") },
        };
      });
      vi.spyOn(
        faceid.v20180301.Client.prototype,
        "GetActionSequence",
      ).mockResolvedValue({ ActionSequence: "2,1", RequestId: randomUUID() });
      vi.spyOn(
        faceid.v20180301.Client.prototype,
        "LivenessCompare",
      ).mockImplementation(async (input): Promise<VideoResult> => {
        expect(input.LivenessType).toBe("ACTION");
        expect(input.ValidateData).toBe("2,1");
        expect(input.ImageBase64).toBe(photo.toString("base64"));
        expect(input).not.toHaveProperty("Name");
        expect(input).not.toHaveProperty("IdCard");
        const id: string = Buffer.from(input.VideoBase64 ?? "", "base64")
          .subarray(16)
          .toString();
        const result = cloud.get(id);
        if (result === undefined)
          throw new Error("Unknown video integration session");
        return {
          Result:
            result.liveStatus === 0 && result.compareStatus === 0
              ? "Success"
              : "FailedOperation.LifePhotoDetectFail",
          Sim: Number(result.score),
          BestFrameBase64: photo.toString("base64"),
          RequestId: randomUUID(),
        };
      });
      const module = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = module.createNestApplication();
      await app.init();
      prisma = app.get(PrismaService);
      const attendancePermission = await prisma.permission.create({
        data: { code: "attendance.submit", name: "Submit attendance" },
      });
      const managePermission = await prisma.permission.create({
        data: { code: "project.manage", name: "Manage project" },
      });
      const workerRole = await prisma.role.create({
        data: {
          code: "WORKER",
          level: 1,
          name: "Worker",
          permissions: { create: { permissionId: attendancePermission.id } },
        },
      });
      const adminRole = await prisma.role.create({
        data: {
          code: "PROJECT_ADMIN",
          level: 3,
          name: "Project admin",
          permissions: {
            create: [
              { permissionId: managePermission.id },
              { permissionId: attendancePermission.id },
            ],
          },
        },
      });
      projectAdminRoleId = adminRole.id;
      const createLogin = async (code: string): Promise<Login> => {
        const user = await prisma.user.create({
          data: { openid: code, isBound: true, nickname: "Test", phone: "13800000000", encryptedRealName: "test-encrypted-name", avatarObjectKey: "test/avatar.png" },
        });
        const session = await prisma.userSession.create({
          data: {
            userId: user.id,
            tokenHash: randomUUID(),
            expiresAt: new Date(Date.now() + 3_600_000),
          },
        });
        return {
          userId: user.id,
          token: await app
            .get(JwtService)
            .signAsync(
              { sub: user.id, sid: session.id, sv: user.sessionVersion },
              { secret: process.env.JWT_ACCESS_TOKEN_SECRET! },
            ),
        };
      };
      worker = await createLogin("face-integration-worker");
      otherWorker = await createLogin("face-integration-other-worker");
      reviewer = await createLogin("face-integration-reviewer");
      const company = await prisma.company.create({
        data: { name: "Face integration company", status: "ACTIVE" },
      });
      const projectData = {
        companyId: company.id,
        name: "Face integration project",
        address: "Integration fixture",
        centerLatitude: "31.2304",
        centerLongitude: "121.4737",
        geofenceRadiusM: 300,
        status: "ACTIVE" as const,
        plannedStartDate: new Date("2000-01-01"),
      };
      projectId = (await prisma.project.create({ data: projectData })).id;
      otherProjectId = (
        await prisma.project.create({
          data: { ...projectData, name: "Other project" },
        })
      ).id;
      await prisma.userRole.create({
        data: {
          userId: reviewer.userId,
          roleId: adminRole.id,
          scopeType: "PROJECT",
          scopeId: projectId,
        },
      });
      for (const login of [worker, otherWorker]) {
        const profile = await prisma.workerProfile.create({
          data: {
            userId: login.userId,
            encryptedName: "Integration worker",
            encryptedIdNumber: "integration",
            idNumberHash: randomUUID(),
            phone: "13800000000",
            workType: "Integration",
            realNameStatus: "VERIFIED",
            faceProfileStatus: "UNENROLLED",
            employmentStatus: "ACTIVE",
          },
        });
        for (const id of [projectId, otherProjectId]) {
          await prisma.projectWorkerMember.create({
            data: {
              projectId: id,
              workerId: profile.id,
              enteredAt: new Date(),
              projectRoleLabel: "WORKER",
              status: "ACTIVE",
            },
          });
          await prisma.userRole.create({
            data: {
              userId: login.userId,
              roleId: workerRole.id,
              scopeType: "PROJECT",
              scopeId: id,
            },
          });
        }
      }
      attendanceDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      await request(app.getHttpServer())
        .put(`/attendance/projects/${projectId}/default-shift`)
        .auth(reviewer.token, { type: "bearer" })
        .send({
          name: "Integration shift",
          segments: [
            {
              sequence: 1,
              startTime: "08:00",
              endTime: "12:00",
              earlyGraceMins: 0,
              lateGraceMins: 0,
            },
            {
              sequence: 2,
              startTime: "13:00",
              endTime: "18:00",
              earlyGraceMins: 0,
              lateGraceMins: 0,
            },
          ],
        })
        .expect(200);
      await request(app.getHttpServer())
        .put(`/attendance/projects/${projectId}/default-schedule`)
        .auth(reviewer.token, { type: "bearer" })
        .send({
          startsOn: "2000-01-01",
          endsOn: null,
          workdays: [1, 2, 3, 4, 5, 6, 7],
        })
        .expect(200);
    }, 30_000);

    beforeEach(async (): Promise<void> => {
      cloud.clear();
      vi.clearAllMocks();
      await prisma.attendanceRecord.deleteMany();
      await prisma.attendanceResult.deleteMany();
      await prisma.faceVerificationSession.deleteMany();
      await prisma.faceLivenessTestSession.deleteMany();
      await prisma.faceProfile.deleteMany();
      await prisma.userRole.deleteMany({
        where: { userId: worker.userId, roleId: projectAdminRoleId },
      });
    });

    afterAll(async (): Promise<void> => {
      vi.restoreAllMocks();
      if (app !== undefined) await app.close();
      if (uploadsDir !== undefined)
        await rm(uploadsDir, { recursive: true, force: true });
    });

    const enroll = async (): Promise<string> => {
      const response = await request(app.getHttpServer())
        .post("/face-profiles/me")
        .auth(worker.token, { type: "bearer" })
        .field("consentVersion", FACE_CONSENT_VERSION)
        .attach("file", photo, {
          filename: "face.png",
          contentType: "image/png",
        })
        .expect(201);
      return String(response.body.id);
    };
    const approve = async (id: string): Promise<void> => {
      await request(app.getHttpServer())
        .post(`/face-profiles/projects/${projectId}/${id}/review`)
        .auth(reviewer.token, { type: "bearer" })
        .send({ decision: "APPROVED", reason: "Checked employee in person" })
        .expect(201);
    };
    const issue = async (): Promise<Issued> => {
      const response = await request(app.getHttpServer())
        .post(`/attendance/projects/${projectId}${sessionRoute}`)
        .auth(worker.token, { type: "bearer" })
        .send({ pointCode: "SEGMENT_1_START" })
        .expect(201);
      if (videoMode) {
        expect(response.body.actionSequence).toEqual(["2", "1"]);
        expect(response.body).not.toHaveProperty("bizToken");
        const id: string = String(response.body.id);
        cloud.set(id, {
          sessionId: id,
          liveStatus: 0,
          compareStatus: 0,
          score: "100",
          library: "业务方自有库",
        });
        return { id, bizToken: id, expiresAt: String(response.body.expiresAt) };
      }
      return response.body as Issued;
    };
    const complete = (issued: Issued): HttpTest => {
      const call: HttpTest = request(app.getHttpServer())
        .post(completionPath(projectId, issued.id))
        .auth(worker.token, { type: "bearer" });
      return videoMode
        ? call
            .field("pointCode", "SEGMENT_1_START")
            .attach("file", videoBytes(issued.id), {
              filename: "face.mp4",
              contentType: "video/mp4",
            })
        : call.send({ pointCode: "SEGMENT_1_START" });
    };
    const punch = (id: string): HttpTest =>
      request(app.getHttpServer())
        .post(`/attendance/projects/${projectId}/records`)
        .auth(worker.token, { type: "bearer" })
        .send({
          faceVerificationSessionId: id,
          attendanceDate,
          occurredAt: new Date().toISOString(),
          pointCode: "SEGMENT_1_START",
          latitude: "31.2304",
          longitude: "121.4737",
          locationAccuracyM: "5",
          sitePhotoObjectKey: "integration-site.png",
          sitePhotoHash: "integration-site-hash",
          selfieObjectKey: "client-forged.png",
          selfieHash: "client-forged-hash",
          facePassed: true,
          faceScore: 100,
        });

    test("requires consent and prevents cross-project photo access and self-review", async (): Promise<void> => {
      await request(app.getHttpServer())
        .post("/face-profiles/me")
        .auth(worker.token, { type: "bearer" })
        .attach("file", photo, {
          filename: "face.png",
          contentType: "image/png",
        })
        .expect(400);
      const id = await enroll();
      await request(app.getHttpServer())
        .get(`/face-profiles/projects/${projectId}/${id}/photo`)
        .auth(worker.token, { type: "bearer" })
        .expect(403);
      await request(app.getHttpServer())
        .get(`/face-profiles/projects/${otherProjectId}/${id}/photo`)
        .auth(reviewer.token, { type: "bearer" })
        .expect(403);
      const image = await request(app.getHttpServer())
        .get(`/face-profiles/projects/${projectId}/${id}/photo`)
        .auth(reviewer.token, { type: "bearer" })
        .expect(200);
      expect(image.headers["cache-control"]).toBe("no-store");
      expect(image.body.dataUrl).toContain(photo.toString("base64"));
      await prisma.userRole.create({
        data: {
          userId: worker.userId,
          roleId: projectAdminRoleId,
          scopeType: "PROJECT",
          scopeId: projectId,
        },
      });
      const selfReview = await request(app.getHttpServer())
        .post(`/face-profiles/projects/${projectId}/${id}/review`)
        .auth(worker.token, { type: "bearer" })
        .send({ decision: "APPROVED", reason: "Self review" })
        .expect(403);
      expect(selfReview.body.message).toBe("FACE_SELF_REVIEW_FORBIDDEN");
    });

    test("requires approved enrollment and a provider-verified session", async (): Promise<void> => {
      await enroll();
      await request(app.getHttpServer())
        .post(`/attendance/projects/${projectId}${sessionRoute}`)
        .auth(worker.token, { type: "bearer" })
        .send({ pointCode: "SEGMENT_1_START" })
        .expect(400);
      await punch(randomUUID()).expect(404);
      expect(await prisma.attendanceRecord.count()).toBe(0);
    });

    test("stores provider evidence and a score of 100, then rejects replay", async (): Promise<void> => {
      await approve(await enroll());
      const issued = await issue();
      const completed = await complete(issued).expect(201);
      expect(completed.body.status).toBe("VERIFIED");
      const response = await punch(issued.id).expect(201);
      expect(response.body.record.facePassed).toBe(true);
      expect(response.body.record.selfieObjectKey).toBe(
        `face-verifications/${issued.id}.png`,
      );
      expect(response.body.record.selfieHash).not.toBe("client-forged-hash");
      expect(Number(response.body.record.faceScore)).toBe(100);
      await punch(issued.id).expect(400);
      expect(await prisma.attendanceRecord.count()).toBe(1);
      expect((await prisma.attendanceRecord.findFirstOrThrow()).faceVerificationSessionId).toBe(issued.id);
    });

    test.skipIf(videoMode)(
      "retries the same verification when the provider result is not yet available",
      async (): Promise<void> => {
        await approve(await enroll());
        const issued = await issue();
        const result = cloud.get(issued.bizToken);
        if (result === undefined)
          throw new Error("Issued integration session was not registered");
        cloud.set(issued.bizToken, { ...result, resultPending: true });
        const waiting = await complete(issued).expect(503);
        expect(waiting.body.message).toBe("FACE_PROVIDER_RESULT_NOT_READY");
        expect(
          (
            await prisma.faceVerificationSession.findUniqueOrThrow({
              where: { id: issued.id },
            })
          ).status,
        ).toBe("PENDING");
        cloud.set(issued.bizToken, { ...result, resultPending: false });
        expect((await complete(issued).expect(201)).body.status).toBe(
          "VERIFIED",
        );
        expect((await complete(issued).expect(201)).body.status).toBe(
          "VERIFIED",
        );
        expect(cloud.size).toBe(1);
        expect(await prisma.faceVerificationSession.count()).toBe(1);
        await punch(issued.id).expect(201);
      },
    );

    test("binds sessions to user, project, point and expiration", async (): Promise<void> => {
      await approve(await enroll());
      const issued = await issue();
      await request(app.getHttpServer())
        .post(completionPath(projectId, issued.id))
        .auth(otherWorker.token, { type: "bearer" })
        .send({ pointCode: "SEGMENT_1_START" })
        .expect(404);
      await request(app.getHttpServer())
        .post(completionPath(projectId, issued.id))
        .auth(worker.token, { type: "bearer" })
        .send({ pointCode: "SEGMENT_2_START" })
        .expect(404);
      await prisma.faceVerificationSession.update({
        where: { id: issued.id },
        data: { projectId: otherProjectId },
      });
      await complete(issued).expect(404);
      await prisma.faceVerificationSession.update({
        where: { id: issued.id },
        data: { projectId, expiresAt: new Date(Date.now() - 1000) },
      });
      const expired = await complete(issued).expect(409);
      expect(expired.body.message).toBe("FACE_SESSION_EXPIRED");
    });

    test("rejects failed liveness even when similarity is high", async (): Promise<void> => {
      await approve(await enroll());
      const issued = await issue();
      cloud.set(issued.bizToken, {
        sessionId: issued.id,
        liveStatus: -1,
        compareStatus: 0,
        score: "99",
        library: "业务方自有库",
      });
      const response = await complete(issued).expect(201);
      expect(response.body.status).toBe("FAILED");
      await punch(issued.id).expect(400);
    });

    test.skipIf(videoMode)(
      "rejects a misconfigured reference library",
      async (): Promise<void> => {
        await approve(await enroll());
        const issued = await issue();
        cloud.set(issued.bizToken, {
          sessionId: issued.id,
          liveStatus: 0,
          compareStatus: 0,
          score: "99",
          library: "权威库",
        });
        const result = await complete(issued).expect(503);
        expect(result.body.message).toBe("FACE_RULE_MUST_USE_UPLOADED_PHOTO");
        await punch(issued.id).expect(400);
      },
    );

    test("replacing a baseline revokes outstanding proofs", async (): Promise<void> => {
      const id = await enroll();
      await approve(id);
      const issued = await issue();
      await complete(issued).expect(201);
      const replacementId = await enroll();
      expect(replacementId).not.toBe(id);
      expect(
        (await prisma.faceProfile.findUniqueOrThrow({ where: { id } })).status,
      ).toBe("REPLACED");
      await punch(issued.id).expect(404);
      expect(
        (
          await prisma.faceProfile.findUniqueOrThrow({
            where: { id: replacementId },
          })
        ).version,
      ).toBe(2);
    });

    test("consumes a proof once under concurrent attendance requests", async (): Promise<void> => {
      await approve(await enroll());
      const issued = await issue();
      await complete(issued).expect(201);
      const responses = await Promise.all([punch(issued.id), punch(issued.id)]);
      expect(
        responses.filter((response) => response.status === 201),
      ).toHaveLength(1);
      expect(await prisma.attendanceRecord.count()).toBe(1);
    });

    test.skipIf(!videoMode)(
      "rejects invalid video before billing and reuses a verified result without billing again",
      async (): Promise<void> => {
        await approve(await enroll());
        const issued = await issue();
        await request(app.getHttpServer())
          .post(completionPath(projectId, issued.id))
          .auth(worker.token, { type: "bearer" })
          .field("pointCode", "SEGMENT_1_START")
          .attach("file", photo, {
            filename: "fake.mp4",
            contentType: "video/mp4",
          })
          .expect(400);
        expect(
          faceid.v20180301.Client.prototype.LivenessCompare,
        ).not.toHaveBeenCalled();
        await complete(issued).expect(201);
        await complete(issued).expect(201);
        const result = await request(app.getHttpServer())
          .get(
            `/attendance/projects/${projectId}/face-verifications/${issued.id}/video-result?pointCode=SEGMENT_1_START`,
          )
          .auth(worker.token, { type: "bearer" })
          .expect(200);
        expect(result.headers["cache-control"]).toBe("no-store");
        expect(result.body.status).toBe("VERIFIED");
        expect(
          faceid.v20180301.Client.prototype.LivenessCompare,
        ).toHaveBeenCalledTimes(1);
        const persisted =
          await prisma.faceVerificationSession.findUniqueOrThrow({
            where: { id: issued.id },
          });
        expect(persisted.provider).toBe("VIDEO_ACTION");
        expect(persisted.actionSequence).toBe("2,1");
        expect(persisted.videoHash).toHaveLength(64);
      },
    );

    test.skipIf(!videoMode)(
      "only submits one video under concurrent requests and blocks the native completion route",
      async (): Promise<void> => {
        await approve(await enroll());
        const issued = await issue();
        await request(app.getHttpServer())
          .post(
            `/attendance/projects/${projectId}/face-verifications/${issued.id}/complete`,
          )
          .auth(worker.token, { type: "bearer" })
          .send({ pointCode: "SEGMENT_1_START" })
          .expect(409);
        const responses = await Promise.all([
          complete(issued),
          complete(issued),
        ]);
        expect(responses.some((response) => response.status === 201)).toBe(
          true,
        );
        expect(
          faceid.v20180301.Client.prototype.LivenessCompare,
        ).toHaveBeenCalledTimes(1);
        expect(
          (
            await prisma.faceVerificationSession.findUniqueOrThrow({
              where: { id: issued.id },
            })
          ).status,
        ).toBe("VERIFIED");
      },
    );

    test("limits concurrent billable session creation", async (): Promise<void> => {
      await approve(await enroll());
      const responses = await Promise.all(
        Array.from({ length: 4 }, () =>
          request(app.getHttpServer())
            .post(`/attendance/projects/${projectId}${sessionRoute}`)
            .auth(worker.token, { type: "bearer" })
            .send({ pointCode: "SEGMENT_1_START" }),
        ),
      );
      expect(
        responses.filter((response) => response.status === 201),
      ).toHaveLength(3);
      expect(
        responses.filter((response) => response.status === 409),
      ).toHaveLength(1);
      expect(
        videoMode
          ? vi.mocked(faceid.v20180301.Client.prototype.GetActionSequence).mock
              .calls.length
          : cloud.size,
      ).toBe(3);
    });

    test.skipIf(!videoMode)(
      "self-tests a pending reference on a rest day without issuing an attendance proof",
      async (): Promise<void> => {
        const profileId: string = await enroll();
        const schedules = await prisma.schedule.findMany({
          where: { ownerId: projectId },
        });
        try {
          await prisma.schedule.updateMany({
            where: { ownerId: projectId },
            data: { workdayMask: 0 },
          });
          const today = await request(app.getHttpServer())
            .get(`/me/projects/${projectId}/attendance-today`)
            .auth(worker.token, { type: "bearer" })
            .expect(200);
          expect(today.body.isWorkday).toBe(false);
          const issued = await request(app.getHttpServer())
            .post("/face-profiles/me/liveness-tests")
            .auth(worker.token, { type: "bearer" })
            .expect(201);
          const id: string = String(issued.body.id);
          cloud.set(id, {
            sessionId: id,
            liveStatus: 0,
            compareStatus: 0,
            score: "99",
            library: "业务方自有库",
          });
          await request(app.getHttpServer())
            .get(`/face-profiles/me/liveness-tests/${id}`)
            .auth(otherWorker.token, { type: "bearer" })
            .expect(404);
          const completeTest = (): HttpTest =>
            request(app.getHttpServer())
              .post(`/face-profiles/me/liveness-tests/${id}/video`)
              .auth(worker.token, { type: "bearer" })
              .attach("file", videoBytes(id), {
                filename: "capture.mp4",
                contentType: "video/mp4",
              });
          const result = await completeTest().expect(201);
          expect(result.body).toMatchObject({
            purpose: "LIVENESS_TEST",
            status: "VERIFIED",
            score: 99,
          });
          expect(result.body.requestId).toBeTypeOf("string");
          await completeTest().expect(201);
          expect(
            faceid.v20180301.Client.prototype.LivenessCompare,
          ).toHaveBeenCalledTimes(1);
          expect(await prisma.faceVerificationSession.count()).toBe(0);
          expect(
            (
              await prisma.faceProfile.findUniqueOrThrow({
                where: { id: profileId },
              })
            ).status,
          ).toBe("PENDING");
          expect(await prisma.attendanceRecord.count()).toBe(0);
        } finally {
          for (const schedule of schedules)
            await prisma.schedule.update({
              where: { id: schedule.id },
              data: { workdayMask: schedule.workdayMask },
            });
        }
        const session = await prisma.faceLivenessTestSession.findFirstOrThrow();
        await punch(session.id).expect(404);
      },
    );

    test.skipIf(!videoMode)(
      "rejects failed self-test liveness and invalidates a test after replacing its reference",
      async (): Promise<void> => {
        await enroll();
        const issued = await request(app.getHttpServer())
          .post("/face-profiles/me/liveness-tests")
          .auth(worker.token, { type: "bearer" })
          .expect(201);
        const id: string = String(issued.body.id);
        cloud.set(id, {
          sessionId: id,
          liveStatus: -1,
          compareStatus: 0,
          score: "99",
          library: "业务方自有库",
        });
        const result = await request(app.getHttpServer())
          .post(`/face-profiles/me/liveness-tests/${id}/video`)
          .auth(worker.token, { type: "bearer" })
          .attach("file", videoBytes(id), {
            filename: "capture.mp4",
            contentType: "video/mp4",
          })
          .expect(201);
        expect(result.body).toMatchObject({
          purpose: "LIVENESS_TEST",
          status: "FAILED",
          score: null,
        });
        expect(result.body.failureCode).toBeTypeOf("string");
        await enroll();
        await request(app.getHttpServer())
          .get(`/face-profiles/me/liveness-tests/${id}`)
          .auth(worker.token, { type: "bearer" })
          .expect(409);
      },
    );
  },
);
