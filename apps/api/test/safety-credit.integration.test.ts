import { createHash, randomBytes } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { defaultAttendancePoints } from "@construction/domain/attendance.js";
import {
  safetyCreditDay,
  type SafetyViolationInput,
} from "@construction/domain";
import { AppModule } from "../src/app.module.js";
import { PrismaService } from "../src/infrastructure/database/prisma.service.js";
import { encryptPersonnelName } from "../src/management/personnel-name.js";
import { SafetyCreditService } from "../src/safety-credit/safety-credit.service.js";

const encryptionKey: string = "ab".repeat(32);
const fixtureTime: Date = new Date();
const occurrence: string = new Date(
  fixtureTime.getTime() - 60000,
).toISOString();
const today: string = safetyCreditDay(fixtureTime);
const dayAfter = (days: number): string =>
  safetyCreditDay(
    new Date(Date.parse(`${today}T00:00:00+08:00`) + days * 86400000),
  );
const png: Buffer = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jSAAAAABJRU5ErkJggg==",
  "base64",
);

describe.skipIf(process.env.DATABASE_FOUNDATION_TEST_URL === undefined)(
  "global safety credit real HTTP and database",
  () => {
    let app: INestApplication;
    let db: PrismaService;
    let service: SafetyCreditService;
    const tokens = new Map<string, string>();
    const photos = new Map<
      string,
      { readonly objectKey: string; readonly hash: string }
    >();
    let violationA: string;
    let violationB: string;
    const token = (id: string): string => tokens.get(`credit-${id}`)!;
    const body = (side: "a" | "b"): SafetyViolationInput => ({
      memberId: `credit-member-${side}`,
      category: "未戴安全帽",
      severity: side === "a" ? "GENERAL" : "SERIOUS",
      occurredAt: occurrence,
      description: `${side}公司项目凭证，仅本项目可见`,
      evidence: [photos.get(`leader-${side}`)!],
    });
    const makeUser = async (
      suffix: string,
      index: number,
      role: "WORKER" | "TEAM_LEADER" | "PROJECT_ADMIN",
      side: "a" | "b",
    ): Promise<void> => {
      const id = `credit-${suffix}`;
      await db.user.create({
        data: {
          id,
          openid: id,
          nickname: suffix,
          phone: `1389000${String(index).padStart(4, "0")}`,
          isBound: true,
          encryptedRealName: encryptPersonnelName(
            "信用测试人员",
            encryptionKey,
            randomBytes(12),
          ),
          avatarObjectKey: "test/avatar.png",
        },
      });
      const roleRow = await db.role.findUniqueOrThrow({
        where: { code: role },
      });
      await db.userRole.create({
        data: {
          userId: id,
          roleId: roleRow.id,
          scopeType: role === "TEAM_LEADER" ? "TEAM" : "PROJECT",
          scopeId:
            role === "TEAM_LEADER"
              ? `credit-team-${side}`
              : `credit-project-${side}`,
        },
      });
      const session = await db.userSession.create({
        data: {
          userId: id,
          tokenHash: createHash("sha256").update(id).digest("hex"),
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
      tokens.set(
        id,
        await app
          .get(JwtService)
          .signAsync(
            { sub: id, sid: session.id, sv: 1 },
            { secret: process.env.JWT_ACCESS_TOKEN_SECRET!, expiresIn: 3600 },
          ),
      );
    };
    beforeAll(async () => {
      const url = process.env.DATABASE_FOUNDATION_TEST_URL;
      if (
        !url ||
        !new URL(url).searchParams
          .get("schema")
          ?.startsWith("database_foundation_")
      )
        throw new Error("Use isolated database integration schema.");
      vi.stubEnv("DATABASE_URL", url);
      vi.stubEnv("PERSONNEL_ENCRYPTION_KEY", encryptionKey);
      app = (
        await Test.createTestingModule({ imports: [AppModule] }).compile()
      ).createNestApplication();
      await app.listen(0, "127.0.0.1");
      db = app.get(PrismaService);
      service = app.get(SafetyCreditService);
      for (const side of ["a", "b"] as const) {
        await db.company.create({
          data: {
            id: `credit-company-${side}`,
            name: `信用测试公司${side}`,
            status: "ACTIVE",
          },
        });
        await db.project.create({
          data: {
            id: `credit-project-${side}`,
            companyId: `credit-company-${side}`,
            name: `信用测试项目${side}`,
            address: "测试工地",
            centerLatitude: 31,
            centerLongitude: 121,
            geofenceRadiusM: 200,
            status: "ACTIVE",
            plannedStartDate: new Date("2026-01-01"),
          },
        });
        await db.team.create({
          data: {
            id: `credit-team-${side}`,
            projectId: `credit-project-${side}`,
            name: `信用测试班组${side}`,
            status: "ACTIVE",
          },
        });
        await db.attendancePlan.create({
          data: {
            projectId: `credit-project-${side}`,
            scopeType: "PROJECT",
            scopeId: `credit-project-${side}`,
            authorRoleLevel: 5,
            name: "测试每日两次",
            startsOn: new Date(today),
            workdayMask: 127,
            points: [...defaultAttendancePoints],
          },
        });
      }
      await makeUser("leader-a", 1, "TEAM_LEADER", "a");
      await makeUser("leader-b", 2, "TEAM_LEADER", "b");
      await makeUser("admin-a", 3, "PROJECT_ADMIN", "a");
      await makeUser("admin-b", 4, "PROJECT_ADMIN", "b");
      await makeUser("admin-peer", 5, "PROJECT_ADMIN", "a");
      await makeUser("worker", 6, "WORKER", "a");
      await db.workerProfile.create({
        data: {
          id: "credit-worker-profile",
          userId: "credit-worker",
          encryptedName: encryptPersonnelName(
            "信用测试工人",
            encryptionKey,
            randomBytes(12),
          ),
          phone: "13890000006",
          workType: "木工",
          realNameStatus: "VERIFIED",
          faceProfileStatus: "APPROVED",
          employmentStatus: "ACTIVE",
          registrationCompletedAt: new Date(),
        },
      });
      for (const side of ["a", "b"])
        await db.projectWorkerMember.create({
          data: {
            id: `credit-member-${side}`,
            workerId: "credit-worker-profile",
            projectId: `credit-project-${side}`,
            teamId: `credit-team-${side}`,
            status: "ACTIVE",
            enteredAt: new Date("2026-01-01"),
            projectRoleLabel: "WORKER",
          },
        });
      for (const actor of ["leader-a", "leader-b", "admin-a"]) {
        const response = await request(app.getHttpServer())
          .post("/uploads")
          .auth(token(actor), { type: "bearer" })
          .attach("file", png, {
            filename: "credit.png",
            contentType: "image/png",
          })
          .expect(201);
        photos.set(actor, {
          objectKey: String(response.body.objectKey),
          hash: String(response.body.hash),
        });
      }
    });
    afterAll(async () => {
      if (app) await app.close();
      vi.unstubAllEnvs();
    });

    test("records deduplicate, require review, share global score without other-company details", async () => {
      const server = app.getHttpServer();
      for (const side of ["a", "b"] as const) {
        const response = await request(server)
          .post(`/safety-credit/teams/credit-team-${side}/violations`)
          .auth(token(`leader-${side}`), { type: "bearer" })
          .send(body(side));
        expect(response.status, JSON.stringify(response.body)).toBe(201);
        if (side === "a") violationA = String(response.body.id);
        else violationB = String(response.body.id);
      }
      const pending = await request(server)
        .get("/safety-credit/me")
        .auth(token("worker"), { type: "bearer" })
        .expect(200);
      expect(pending.body.summary).toMatchObject({
        score: 100,
        confirmedViolationCount: 0,
      });
      await request(server)
        .post("/safety-credit/teams/credit-team-a/violations")
        .auth(token("leader-a"), { type: "bearer" })
        .send(body("a"))
        .expect(409);
      await request(server)
        .post("/safety-credit/teams/credit-team-a/violations")
        .auth(token("leader-a"), { type: "bearer" })
        .send({
          ...body("a"),
          category: "他人照片",
          evidence: [photos.get("leader-b")],
        })
        .expect(400);
      for (const [side, id] of [
        ["a", violationA],
        ["b", violationB],
      ])
        await request(server)
          .post(
            `/safety-credit/projects/credit-project-${side}/violations/${id}/review`,
          )
          .auth(token(`admin-${side}`), { type: "bearer" })
          .send({ action: "CONFIRM", reason: "证据确认" })
          .expect(201);
      const boardA = await request(server)
        .get("/safety-credit/teams/credit-team-a")
        .auth(token("leader-a"), { type: "bearer" })
        .expect(200);
      const boardB = await request(server)
        .get("/safety-credit/teams/credit-team-b")
        .auth(token("leader-b"), { type: "bearer" })
        .expect(200);
      expect(boardA.body.workers[0]).toMatchObject({
        score: 85,
        confirmedViolationCount: 2,
      });
      expect(boardB.body.workers[0]).toMatchObject({
        score: 85,
        confirmedViolationCount: 2,
      });
      expect(
        boardA.body.violations.map((row: { readonly id: string }) => row.id),
      ).toEqual([violationA]);
      expect(JSON.stringify(boardA.body)).not.toContain("b公司项目凭证");
      await request(server)
        .get("/safety-credit/teams/credit-team-a")
        .auth(token("leader-b"), { type: "bearer" })
        .expect(403);
      await request(server)
        .get(`/safety-credit/violations/${violationA}/evidence/0`)
        .auth(token("leader-b"), { type: "bearer" })
        .expect(403);
      const evidence = await request(server)
        .get(`/safety-credit/violations/${violationA}/evidence/0`)
        .auth(token("worker"), { type: "bearer" })
        .expect(200);
      expect(evidence.body.base64).toBe(png.toString("base64"));
      const own = await request(server)
        .get("/safety-credit/me")
        .auth(token("worker"), { type: "bearer" })
        .expect(200);
      expect(own.body.violations).toHaveLength(2);
      const self = await request(server)
        .post("/safety-credit/teams/credit-team-a/violations")
        .auth(token("admin-a"), { type: "bearer" })
        .send({
          ...body("a"),
          category: "管理员记录",
          evidence: [photos.get("admin-a")],
        })
        .expect(201);
      for (const actor of ["admin-a", "admin-peer"])
        await request(server)
          .post(
            `/safety-credit/projects/credit-project-a/violations/${self.body.id}/review`,
          )
          .auth(token(actor), { type: "bearer" })
          .send({ action: "CONFIRM", reason: "不能自审或同级审核" })
          .expect(403);
      await request(server)
        .post("/safety-credit/policies")
        .auth(token("admin-a"), { type: "bearer" })
        .send({
          startsOn: dayAfter(30),
          generalPoints: 5,
          seriousPoints: 10,
          majorPoints: 20,
          recoveryWorkdays: 10,
          recoveryPoints: 5,
        })
        .expect(403);
    });

    test("recovery counts ten actual dates once across companies and ignores unclosed or invalid punches", async () => {
      for (let day = 1; day <= 10; day += 1) {
        for (const side of ["a", "b"])
          for (const [pointCode, time] of [
            ["START", "08:00"],
            ["END", "17:30"],
          ])
            await db.attendanceRecord.create({
              data: {
                projectId: `credit-project-${side}`,
                participantType: "WORKER",
                participantId: "credit-worker-profile",
                attendanceDate: new Date(dayAfter(day)),
                pointCode: pointCode!,
                source: "DEVICE",
                status: "VALID",
                occurredAt: new Date(`${dayAfter(day)}T${time}:00+08:00`),
                latitude: 31,
                longitude: 121,
                selfieObjectKey: "test/face",
                sitePhotoObjectKey: "test/site",
                selfieHash: "test",
                sitePhotoHash: "test",
                facePassed: true,
              },
            });
      }
      for (const day of [11, 12])
        for (const [pointCode, time] of [
          ["START", "08:00"],
          ["END", "17:30"],
        ]) {
          if (day === 11 && pointCode === "END") continue;
          await db.attendanceRecord.create({
            data: {
              projectId: "credit-project-a",
              participantType: "WORKER",
              participantId: "credit-worker-profile",
              attendanceDate: new Date(dayAfter(day)),
              pointCode: pointCode!,
              source: "DEVICE",
              status: pointCode === "END" ? "INVALID" : "VALID",
              occurredAt: new Date(`${dayAfter(day)}T${time}:00+08:00`),
              latitude: 31,
              longitude: 121,
              selfieObjectKey: "test/face",
              sitePhotoObjectKey: "test/site",
              selfieHash: "test",
              sitePhotoHash: "test",
              facePassed: pointCode !== "END",
            },
          });
        }
      const nine = new Date(`${dayAfter(9)}T23:59:59+08:00`);
      const end = new Date(`${dayAfter(12)}T23:59:59+08:00`);
      const nineSummary = await db.$transaction((database) =>
        service.summariesIn(database, ["credit-worker-profile"], nine, end),
      );
      expect(nineSummary.get("credit-worker-profile")).toMatchObject({
        score: 85,
        recoveryWorkdays: 9,
        recoveryPoints: 0,
      });
      const tenSummary = await db.$transaction((database) =>
        service.summariesIn(database, ["credit-worker-profile"], end, end),
      );
      expect(tenSummary.get("credit-worker-profile")).toMatchObject({
        score: 90,
        recoveryWorkdays: 0,
        recoveryPoints: 5,
      });
    });

    test("appeal revocation recomputes current and regenerated historical scores while preserving snapshot knowledge", async () => {
      const server = app.getHttpServer();
      const periodEnd = new Date();
      const beforeSnapshot = new Date();
      const responses = await Promise.all(
        [1, 2].map(() =>
          request(server)
            .post(`/safety-credit/me/violations/${violationB}/appeals`)
            .auth(token("worker"), { type: "bearer" })
            .send({ reason: "申请核查本人证据" }),
        ),
      );
      expect(responses.map((row) => row.status).sort()).toEqual([201, 409]);
      const own = await request(server)
        .get("/safety-credit/me")
        .auth(token("worker"), { type: "bearer" })
        .expect(200);
      const event = (
        own.body.violations as readonly {
          readonly id: string;
          readonly appeals: readonly { readonly id: string }[];
        }[]
      ).find((row) => row.id === violationB)!;
      await request(server)
        .post(
          `/safety-credit/projects/credit-project-b/violations/${violationB}/appeals/${event.appeals[0]!.id}/review`,
        )
        .auth(token("admin-b"), { type: "bearer" })
        .send({ accept: true, reason: "复核撤销" })
        .expect(201);
      const afterSnapshot = new Date();
      const before = await db.$transaction((database) =>
        service.summariesIn(
          database,
          ["credit-worker-profile"],
          periodEnd,
          beforeSnapshot,
        ),
      );
      const after = await db.$transaction((database) =>
        service.summariesIn(
          database,
          ["credit-worker-profile"],
          periodEnd,
          afterSnapshot,
        ),
      );
      expect(before.get("credit-worker-profile")).toMatchObject({
        score: 85,
        confirmedViolationCount: 2,
      });
      expect(after.get("credit-worker-profile")).toMatchObject({
        score: 95,
        confirmedViolationCount: 1,
      });
      const scoped = await db.$transaction((database) =>
        service.reportEventsIn(
          database,
          ["credit-project-a"],
          ["credit-worker-profile"],
          today,
          today,
          periodEnd,
          afterSnapshot,
        ),
      );
      expect(scoped.every((row) => row.projectId === "credit-project-a")).toBe(
        true,
      );
      expect(
        await db.safetyCreditDecision.count({
          where: { violationId: violationB },
        }),
      ).toBe(2);
      const current = await request(server)
        .get("/safety-credit/me")
        .auth(token("worker"), { type: "bearer" })
        .expect(200);
      expect(current.body.summary).toMatchObject({
        score: 95,
        confirmedViolationCount: 1,
      });
      const revoked = (
        current.body.violations as readonly {
          readonly id: string;
          readonly status: string;
        }[]
      ).find((row) => row.id === violationB);
      expect(revoked?.status).toBe("REVOKED");
    });
  },
);
