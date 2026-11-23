import "reflect-metadata";

import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import type { AttendanceSafetyNotice } from "@construction/domain";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

import { AppModule } from "../src/app.module.js";
import { API_ENV } from "../src/config/env.module.js";
import { loadEnv } from "../src/config/env.js";
import { PrismaService } from "../src/infrastructure/database/prisma.service.js";
import { encryptPersonnelName } from "../src/management/personnel-name.js";

import { enforcementOf, loadWriteRoutes, type WriteRoute } from "./support/write-routes.js";

// Suspending a company makes it read-only (system admin plan phase 3, Q5), over real HTTP
// and PostgreSQL: every write route the guards hold back answers 403 COMPANY_SUSPENDED for
// the company's own people, the service-checked ones too, while reading, exporting and the
// platform administrator are unaffected; resuming brings everything back.

const key = "ab".repeat(32);
const date = "2030-01-07";
const companyId = "cs-company";
const projectId = "cs-project";
const teamId = "cs-team";
const users = {
  admin: "cs-company-admin",
  leader: "cs-leader",
  system: "cs-system",
  temporary: "cs-temporary",
  worker: "cs-worker",
} as const;
type Actor = keyof typeof users;

/** Fills a route's params: the suspended company's ids, anything else a missing id. */
const fill = (path: string): string =>
  path.replace(/:([A-Za-z]+)/g, (_match, name: string) =>
    name === "companyId" ? companyId : name === "projectId" ? projectId : name === "teamId" ? teamId : name === "scopeType" ? "PROJECT" : name === "scopeId" ? projectId : "missing",
  );

describe.skipIf(process.env.DATABASE_FOUNDATION_TEST_URL === undefined)(
  "a suspended company is read-only over real HTTP",
  (): void => {
    let app: INestApplication;
    let db: PrismaService;
    let uploads: string;
    let routes: readonly WriteRoute[];
    let makeupId = "";
    let violationId = "";
    let briefingId = "";
    let inviteCode = "";
    const tokens = new Map<Actor, string>();

    const http = () => request(app.getHttpServer());
    const as = (actor: Actor) => {
      const bearer = { type: "bearer" } as const;
      return {
        get: (path: string) => http().get(path).auth(tokens.get(actor)!, bearer),
        send: (method: WriteRoute["method"], path: string, body: object = {}) => {
          const agent = http();
          const call =
            method === "POST" ? agent.post(path) : method === "PUT" ? agent.put(path) : method === "PATCH" ? agent.patch(path) : agent.delete(path);
          return call.auth(tokens.get(actor)!, bearer).send(body);
        },
      };
    };

    const routesBy = (enforcement: ReturnType<typeof enforcementOf>): readonly WriteRoute[] =>
      routes.filter((route) => enforcementOf(route) === enforcement);

    const setStatus = async (status: "ACTIVE" | "SUSPENDED"): Promise<void> => {
      const read = await as("system").get(`/system/companies/${companyId}`).expect(200);
      await as("system").send("POST", `/system/companies/${companyId}/status`, { expectedUpdatedAt: read.body.updatedAt, status }).expect(201);
    };

    const createUser = async (actor: Actor, phone: string, isBound: boolean): Promise<string> => {
      const id = users[actor];
      await db.user.create({
        data: {
          avatarObjectKey: "test/avatar.png",
          encryptedRealName: encryptPersonnelName(actor, key, randomBytes(12)),
          id,
          isBound,
          nickname: actor,
          openid: id,
          phone,
        },
      });
      const session = await db.userSession.create({
        data: { expiresAt: new Date("2031-01-01"), tokenHash: createHash("sha256").update(id).digest("hex"), userId: id },
      });
      tokens.set(
        actor,
        await app.get(JwtService).signAsync({ sid: session.id, sub: id, sv: 1 }, { expiresIn: 86400, secret: process.env.JWT_ACCESS_TOKEN_SECRET! }),
      );
      return id;
    };

    const grant = async (
      userId: string,
      code: "COMPANY_ADMIN" | "SYSTEM_ADMIN" | "TEAM_LEADER" | "WORKER",
      scopeType: "COMPANY" | "GLOBAL" | "TEAM",
      scopeId: string,
    ): Promise<void> => {
      const role = await db.role.findUniqueOrThrow({ where: { code } });
      await db.userRole.create({ data: { roleId: role.id, scopeId, scopeType, userId } });
    };

    beforeAll(async (): Promise<void> => {
      const url = process.env.DATABASE_FOUNDATION_TEST_URL;
      if (!url || !new URL(url).searchParams.get("schema")?.startsWith("database_foundation_"))
        throw new Error("Run test:database against an isolated local schema.");
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(`${date}T00:00:00Z`));
      uploads = await mkdtemp(join(tmpdir(), "hanbo-suspension-"));
      const env = loadEnv({
        ...process.env,
        DATABASE_URL: url,
        FACE_DEV_STUB: "true",
        NODE_ENV: "test",
        PERSONNEL_ENCRYPTION_KEY: key,
        TENCENT_FACE_MODE: "WECHAT_NATIVE",
        TENCENT_FACE_RULE_ID: "",
        TENCENT_SECRET_ID: "",
        TENCENT_SECRET_KEY: "",
        UPLOADS_DIR: uploads,
      });
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(API_ENV).useValue(env).compile();
      app = moduleRef.createNestApplication();
      await app.listen(0, "127.0.0.1");
      db = app.get(PrismaService);
      routes = await loadWriteRoutes();

      await db.company.create({ data: { id: companyId, name: "暂停测试公司", status: "ACTIVE" } });
      await db.project.create({
        data: {
          address: "测试工地",
          centerLatitude: 31,
          centerLongitude: 121,
          companyId,
          geofenceRadiusM: 300,
          id: projectId,
          name: "暂停测试工地",
          plannedStartDate: new Date("2030-01-01"),
          status: "ACTIVE",
        },
      });
      await db.team.create({ data: { id: teamId, name: "测试班组", projectId, status: "ACTIVE" } });

      await grant(await createUser("system", "13930000001", true), "SYSTEM_ADMIN", "GLOBAL", "GLOBAL");
      await grant(await createUser("admin", "13930000002", true), "COMPANY_ADMIN", "COMPANY", companyId);
      await grant(await createUser("leader", "13930000003", true), "TEAM_LEADER", "TEAM", teamId);
      const workerUserId = await createUser("worker", "13930000004", true);
      await createUser("temporary", "13930000005", false);
      const worker = await db.workerProfile.create({
        data: {
          employmentStatus: "ACTIVE",
          encryptedName: encryptPersonnelName("worker", key, randomBytes(12)),
          faceProfileStatus: "APPROVED",
          phone: "13930000004",
          projectMemberships: {
            create: { enteredAt: new Date("2030-01-01"), id: "cs-member", projectId, projectRoleLabel: "电工", status: "ACTIVE", teamId },
          },
          realNameStatus: "VERIFIED",
          registrationCompletedAt: new Date(),
          userId: workerUserId,
          workType: "电工",
        },
      });
      await grant(workerUserId, "WORKER", "TEAM", teamId);

      // Things to act on once the company is suspended: a pending makeup, a confirmed
      // violation, a briefing to acknowledge and a temporary worker's invitation.
      makeupId = (
        await db.makeupRequest.create({
          data: {
            attendanceDate: new Date("2030-01-06"),
            participantId: worker.id,
            participantType: "WORKER",
            pointCode: "START",
            projectId,
            reason: "忘记打卡",
            requestedOccurredAt: new Date("2030-01-06T08:00:00+08:00"),
            requesterUserId: workerUserId,
            status: "PENDING",
          },
        })
      ).id;
      violationId = (
        await db.safetyViolation.create({
          data: {
            category: "PPE",
            createdByUserId: users.leader,
            description: "未戴安全帽",
            eventKey: "cs-violation",
            memberId: "cs-member",
            occurredAt: new Date("2030-01-06T09:00:00+08:00"),
            points: 2,
            policyVersion: 1,
            projectId,
            severity: "GENERAL",
            status: "CONFIRMED",
            teamId,
            workerId: worker.id,
          },
        })
      ).id;
      await as("leader")
        .send("POST", `/team-work/teams/${teamId}/briefings`, { content: "作业前先断电验电。", title: "用电安全", workDate: date })
        .expect(201);
      briefingId = (await db.teamSafetyBriefing.findFirstOrThrow({ where: { teamId } })).id;
      const task = await as("leader")
        .send("POST", `/team-work/teams/${teamId}/tasks`, {
          description: "灯具维修",
          endsAt: `${date}T17:00:00+08:00`,
          memberIds: [],
          startsAt: `${date}T09:00:00+08:00`,
          title: "临时维修",
          workType: "电工",
        })
        .expect(201);
      inviteCode = (
        await as("leader")
          .send("POST", `/team-work/teams/${teamId}/tasks/${task.body.id}/invitations`, { phone: "13930000005", realName: "temporary" })
          .expect(201)
      ).body.code as string;

      await setStatus("SUSPENDED");
    });

    afterAll(async (): Promise<void> => {
      vi.useRealTimers();
      if (app !== undefined) await app.close();
      if (uploads !== undefined) await rm(uploads, { force: true, recursive: true });
    });

    test("every write the PermissionsGuard covers answers COMPANY_SUSPENDED to the company administrator", async (): Promise<void> => {
      const guarded = routesBy("PERMISSIONS_GUARD");
      expect(guarded.length).toBeGreaterThan(30);
      const answers: string[] = [];
      for (const route of guarded) {
        const response = await as("admin").send(route.method, fill(route.path));
        answers.push(`${route.key} -> ${response.status} ${String(response.body.message)}`);
      }
      expect(answers.filter((answer) => !answer.endsWith("-> 403 COMPANY_SUSPENDED"))).toEqual([]);
    });

    test("every write the ActiveCompanyGuard covers answers COMPANY_SUSPENDED to the worker", async (): Promise<void> => {
      const guarded = routesBy("ACTIVE_COMPANY_GUARD");
      expect(guarded.length).toBeGreaterThanOrEqual(12);
      const answers: string[] = [];
      for (const route of guarded) {
        const response = await as("worker").send(route.method, fill(route.path));
        answers.push(`${route.key} -> ${response.status} ${String(response.body.message)}`);
      }
      expect(answers.filter((answer) => !answer.endsWith("-> 403 COMPANY_SUSPENDED"))).toEqual([]);
    });

    test("the service-checked writes are refused with real records and valid bodies", async (): Promise<void> => {
      const refused = async (call: request.Test): Promise<void> => {
        const response = await call;
        expect([response.status, response.body.message]).toEqual([403, "COMPANY_SUSPENDED"]);
      };
      await refused(as("admin").send("POST", `/makeups/requests/${makeupId}/approve`, { approvalReason: "同意" }));
      await refused(as("admin").send("POST", `/makeups/requests/${makeupId}/reject`, { approvalReason: "不同意" }));
      await refused(as("worker").send("POST", `/safety-credit/me/violations/${violationId}/appeals`, { reason: "当时戴着" }));
      await refused(as("worker").send("POST", `/team-work/me/briefings/${briefingId}/acknowledge`));
      await refused(as("temporary").send("POST", "/team-work/me/join", { code: inviteCode }));

      // A real punch body and a real makeup request, refused before anything is written.
      const notice = (await as("worker").get(`/attendance/projects/${projectId}/safety?pointCode=START`).expect(200)).body as AttendanceSafetyNotice;
      await refused(
        as("worker").send("POST", `/attendance/projects/${projectId}/safety-confirmations`, {
          baselineVersion: notice.baselineVersion,
          briefingIds: notice.briefings.map((row) => row.id),
          pointCode: "START",
        }),
      );
      await refused(
        as("worker").send("POST", `/makeups/projects/${projectId}/requests`, {
          attendanceDate: "2030-01-06",
          pointCode: "END",
          reason: "忘记打卡",
          requestedOccurredAt: "2030-01-06T17:00:00+08:00",
        }),
      );

      expect(await db.makeupRequest.count({ where: { projectId } })).toBe(1);
      expect((await db.makeupRequest.findUniqueOrThrow({ where: { id: makeupId } })).status).toBe("PENDING");
      expect(await db.safetyCreditAppeal.count({ where: { violationId } })).toBe(0);
      expect(await db.teamSafetyAcknowledgement.count({ where: { briefingId } })).toBe(0);
      expect(await db.attendanceSafetyConfirmation.count({ where: { projectId } })).toBe(0);
      expect(await db.user.findUniqueOrThrow({ where: { id: users.temporary } })).toMatchObject({ isBound: false });
    });

    test("reading, exporting and signing in stay open; /auth/me says the company is suspended", async (): Promise<void> => {
      await as("admin").get(`/management/companies/${companyId}/overview`).expect(200);
      await as("admin").get(`/management/companies/${companyId}/profile`).expect(200);
      await as("admin").get(`/management/projects/${projectId}/teams`).expect(200);
      await as("leader").get(`/team-work/teams/${teamId}/tasks?date=${date}`).expect(200);
      await as("worker").get("/safety-credit/me").expect(200);
      const exported = await as("admin").send("POST", "/report-exports", { month: "2029-12", scope: "COMPANY", scopeId: companyId });
      expect(exported.status).toBe(201);
      const me = await as("worker").get("/auth/me").expect(200);
      expect(me.body.companies).toEqual([{ id: companyId, name: "暂停测试公司", status: "SUSPENDED" }]);
      expect((await as("system").get("/auth/me").expect(200)).body.companies).toEqual([]);
    });

    test("the platform administrator is never held back", async (): Promise<void> => {
      const answers: string[] = [];
      for (const route of [...routesBy("PERMISSIONS_GUARD"), ...routesBy("ACTIVE_COMPANY_GUARD")]) {
        const response = await as("system").send(route.method, fill(route.path));
        if (response.body.message === "COMPANY_SUSPENDED") answers.push(route.key);
      }
      expect(answers).toEqual([]);
      const profile = (await as("system").get(`/management/companies/${companyId}/profile`).expect(200)).body as { updatedAt: string };
      await as("system")
        .send("PUT", `/management/companies/${companyId}/profile`, {
          address: "上海",
          contactName: "王经理",
          contactPhone: "13930000009",
          expectedUpdatedAt: profile.updatedAt,
        })
        .expect(200);
    });

    test("resuming brings every refused write back", async (): Promise<void> => {
      await setStatus("ACTIVE");
      const notice = (await as("worker").get(`/attendance/projects/${projectId}/safety?pointCode=START`).expect(200)).body as AttendanceSafetyNotice;
      await as("worker")
        .send("POST", `/attendance/projects/${projectId}/safety-confirmations`, {
          baselineVersion: notice.baselineVersion,
          briefingIds: notice.briefings.map((row) => row.id),
          pointCode: "START",
        })
        .expect(201);
      await as("worker").send("POST", `/team-work/me/briefings/${briefingId}/acknowledge`).expect(201);
      await as("worker").send("POST", `/safety-credit/me/violations/${violationId}/appeals`, { reason: "当时戴着" }).expect(201);
      await as("admin").send("POST", `/makeups/requests/${makeupId}/reject`, { approvalReason: "不同意" }).expect(201);
      await as("temporary").send("POST", "/team-work/me/join", { code: inviteCode }).expect(201);
      const profile = (await as("admin").get(`/management/companies/${companyId}/profile`).expect(200)).body as { updatedAt: string };
      await as("admin")
        .send("PUT", `/management/companies/${companyId}/profile`, {
          address: "上海",
          contactName: "李经理",
          contactPhone: null,
          expectedUpdatedAt: profile.updatedAt,
        })
        .expect(200);
      expect(
        (await db.auditLog.findMany({ orderBy: { createdAt: "asc" }, where: { action: { in: ["COMPANY_SUSPENDED", "COMPANY_RESUMED"] }, companyId } })).map(
          (row) => [row.action, row.actorUserId],
        ),
      ).toEqual([
        ["COMPANY_SUSPENDED", users.system],
        ["COMPANY_RESUMED", users.system],
      ]);
    });
  },
);
