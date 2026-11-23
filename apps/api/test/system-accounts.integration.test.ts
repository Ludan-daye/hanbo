import { createHash, randomBytes } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { AppModule } from "../src/app.module.js";
import { PrismaService } from "../src/infrastructure/database/prisma.service.js";
import { WechatCodeSessionConnector } from "../src/infrastructure/wechat/wechat-code-session.connector.js";
import { encryptPersonnelName, personnelNameSearchHashes } from "../src/management/personnel-name.js";
import {
  SystemAdminCommandError,
  grantSystemAdmin,
  listSystemAdmins,
  revokeSystemAdmin,
  runSystemAdminCommand,
} from "../src/system/system-admins.js";
import type { SystemAccountDetail, SystemAccountPage } from "../src/system/system.types.js";

// Platform accounts and super administrators against a real database (system admin plan
// phase 2): roles are listed with where they come from; disabling signs the person out at
// once (old access token, refresh token) and enabling lets them sign in again; super
// administrators come only from the server command, which never revokes the last one.

const key = "ab".repeat(32);
const company = "sb-company";
const project = "sb-project";
const team = "sb-team";
const users = {
  manager: "sb-manager",
  otherSystem: "sb-other-system",
  system: "sb-system",
  unbound: "sb-unbound",
  worker: "sb-worker",
} as const;
type UserKey = keyof typeof users;

describe.skipIf(process.env.DATABASE_FOUNDATION_TEST_URL === undefined)(
  "platform accounts and super administrators over real HTTP",
  (): void => {
    let app: INestApplication;
    let database: PrismaService;
    let managerProfileId = "";
    let managerMemberId = "";
    let workerProfileId = "";
    let workerMemberId = "";
    const tokens = new Map<string, string>();

    const http = () => request(app.getHttpServer());
    const as = (user: string) => ({
      get: (path: string) => http().get(path).auth(tokens.get(user)!, { type: "bearer" }),
      post: (path: string, body: object = {}) => http().post(path).auth(tokens.get(user)!, { type: "bearer" }).send(body),
    });

    const tokenFor = async (userId: string): Promise<string> => {
      const session = await database.userSession.create({
        data: {
          userId,
          tokenHash: createHash("sha256").update(`${userId}:${randomBytes(8).toString("hex")}`).digest("hex"),
          expiresAt: new Date(Date.now() + 3_600_000),
        },
      });
      const user = await database.user.findUniqueOrThrow({ where: { id: userId } });
      return app
        .get(JwtService)
        .signAsync({ sid: session.id, sub: userId, sv: user.sessionVersion }, { secret: process.env.JWT_ACCESS_TOKEN_SECRET!, expiresIn: 3600 });
    };

    const createUser = (id: string, name: string, phone: string, isBound: boolean) =>
      database.user.create({
        data: { id, openid: id, nickname: name, isBound, phone, encryptedRealName: encryptPersonnelName(name, key, randomBytes(12)) },
      });

    const roleId = async (code: "SYSTEM_ADMIN" | "COMPANY_ADMIN" | "PROJECT_ADMIN" | "TEAM_LEADER" | "WORKER"): Promise<string> =>
      (await database.role.findUniqueOrThrow({ where: { code } })).id;

    beforeAll(async (): Promise<void> => {
      const configuredUrl = process.env.DATABASE_FOUNDATION_TEST_URL;
      if (configuredUrl === undefined || !new URL(configuredUrl).searchParams.get("schema")?.startsWith("database_foundation_"))
        throw new Error("Run test:database against an isolated local schema.");
      process.env.DATABASE_URL = configuredUrl;
      // WeChat login without WeChat: the code is the openid.
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(WechatCodeSessionConnector)
        .useValue({ exchangeCode: async (code: string) => ({ openid: code, sessionKey: "session-key" }) })
        .compile();
      app = moduleRef.createNestApplication();
      await app.listen(0, "127.0.0.1");
      database = app.get(PrismaService);

      await database.company.create({ data: { id: company, name: "SB 公司", status: "ACTIVE" } });
      await database.project.create({
        data: {
          id: project,
          companyId: company,
          name: "SB 项目",
          address: "Test site",
          centerLatitude: "31",
          centerLongitude: "121",
          geofenceRadiusM: 300,
          status: "ACTIVE",
          plannedStartDate: new Date("2026-01-01"),
        },
      });
      await database.team.create({ data: { id: team, projectId: project, name: "钢筋班", status: "ACTIVE" } });
      await createUser(users.system, "平台庚", "13930000001", true);
      await createUser(users.otherSystem, "平台辛", "13930000002", true);
      await createUser(users.manager, "管理壬", "13930000003", true);
      await createUser(users.worker, "工人癸", "13930000004", true);
      await createUser(users.unbound, "未绑子", "13930000005", false);
      for (const id of [users.system, users.otherSystem])
        await database.managerProfile.create({ data: { userId: id, name: id === users.system ? "平台庚" : "平台辛", phone: id === users.system ? "13930000001" : "13930000002", status: "ACTIVE" } });
      managerProfileId = (
        await database.managerProfile.create({ data: { userId: users.manager, name: "管理壬", phone: "13930000003", status: "ACTIVE" } })
      ).id;
      workerProfileId = (
        await database.workerProfile.create({
          data: {
            userId: users.worker,
            encryptedName: encryptPersonnelName("工人癸", key, randomBytes(12)),
            nameSearchHashes: [...personnelNameSearchHashes("工人癸", key)],
            phone: "13930000004",
            workType: "钢筋工",
            realNameStatus: "PENDING",
            faceProfileStatus: "PENDING",
            employmentStatus: "ACTIVE",
            registrationCompletedAt: new Date(),
          },
        })
      ).id;
      managerMemberId = (
        await database.projectManagerMember.create({
          data: { projectId: project, managerId: managerProfileId, roleCode: "PROJECT_ADMIN", status: "ACTIVE" },
        })
      ).id;
      workerMemberId = (
        await database.projectWorkerMember.create({
          data: { projectId: project, workerId: workerProfileId, teamId: team, enteredAt: new Date(), projectRoleLabel: "班组长", status: "ACTIVE" },
        })
      ).id;
      await database.companyManagerMember.create({ data: { companyId: company, managerProfileId, status: "ACTIVE" } });
      for (const id of [users.system, users.otherSystem])
        await database.userRole.create({ data: { userId: id, roleId: await roleId("SYSTEM_ADMIN"), scopeType: "GLOBAL", scopeId: "GLOBAL" } });
      await database.userRole.createMany({
        data: [
          { userId: users.manager, roleId: await roleId("COMPANY_ADMIN"), scopeType: "COMPANY", scopeId: company },
          { userId: users.manager, roleId: await roleId("PROJECT_ADMIN"), scopeType: "PROJECT", scopeId: project },
          { userId: users.worker, roleId: await roleId("TEAM_LEADER"), scopeType: "TEAM", scopeId: team },
        ],
      });
      for (const name of Object.keys(users) as UserKey[]) tokens.set(name, await tokenFor(users[name]));
    });

    afterAll(async (): Promise<void> => {
      if (app !== undefined) await app.close();
    });

    test("finds bound accounts by name or mobile number and shows every role with its source", async (): Promise<void> => {
      const byPhone = (await as("system").get("/system/accounts?search=1393000").expect(200)).body as SystemAccountPage;
      // The unbound account cannot use anything, so it is not listed.
      expect(byPhone.items.map((row) => row.userId).sort()).toEqual(
        [users.manager, users.otherSystem, users.system, users.worker].sort(),
      );
      const byWorkerName = (await as("system").get(`/system/accounts?search=${encodeURIComponent("工人癸")}`).expect(200)).body as SystemAccountPage;
      expect(byWorkerName.items).toEqual([
        expect.objectContaining({ displayName: "工人癸", highestRoleCode: "TEAM_LEADER", profileType: "WORKER", roleCount: 1, userId: users.worker }),
      ]);
      const admins = (await as("system").get("/system/accounts?role=SYSTEM_ADMIN&search=1393").expect(200)).body as SystemAccountPage;
      expect(admins.items.map((row) => row.userId).sort()).toEqual([users.otherSystem, users.system].sort());

      const manager = (await as("system").get(`/system/accounts/${users.manager}`).expect(200)).body as SystemAccountDetail;
      expect(manager).toMatchObject({
        displayName: "管理壬",
        highestRoleCode: "COMPANY_ADMIN",
        isSystemAdmin: false,
        phone: "13930000003",
        profileId: managerProfileId,
        status: "ACTIVE",
      });
      expect(manager.roles).toEqual([
        { companyId: company, memberId: null, projectId: null, roleCode: "COMPANY_ADMIN", scopeId: company, scopeName: "SB 公司", scopeType: "COMPANY", source: "COMPANY_APPOINTMENT" },
        { companyId: company, memberId: managerMemberId, projectId: project, roleCode: "PROJECT_ADMIN", scopeId: project, scopeName: "SB 项目", scopeType: "PROJECT", source: "PROJECT_MEMBERSHIP" },
      ]);
      const worker = (await as("system").get(`/system/accounts/${users.worker}`).expect(200)).body as SystemAccountDetail;
      expect(worker.roles).toEqual([
        { companyId: company, memberId: workerMemberId, projectId: project, roleCode: "TEAM_LEADER", scopeId: team, scopeName: "SB 项目 / 钢筋班", scopeType: "TEAM", source: "PROJECT_MEMBERSHIP" },
      ]);
      const system = (await as("system").get(`/system/accounts/${users.otherSystem}`).expect(200)).body as SystemAccountDetail;
      expect(system).toMatchObject({ isSystemAdmin: true, roles: [{ scopeName: "全平台", source: "PLATFORM" }] });
      await as("system").get(`/system/accounts/${users.unbound}`).expect(404);
    });

    test("disabling signs the person out at once; enabling lets them sign in again; records stay", async (): Promise<void> => {
      const login = await http().post("/auth/wechat/login").send({ code: users.manager }).expect(201);
      await http().get("/auth/me").auth(login.body.accessToken, { type: "bearer" }).expect(200);
      await as("manager").get(`/management/companies/${company}/overview`).expect(200);

      const disabled = (await as("system").post(`/system/accounts/${users.manager}/disable`).expect(201)).body as SystemAccountDetail;
      expect(disabled).toMatchObject({ activeSessionCount: 0, status: "DISABLED" });
      // Every earlier token is refused: the session version moved and every session was revoked.
      const stale = await http().get("/auth/me").auth(login.body.accessToken, { type: "bearer" }).expect(401);
      expect(stale.body.message).toBe("ACCESS_TOKEN_SESSION_MISMATCH");
      await as("manager").get(`/management/companies/${company}/overview`).expect(401);
      expect((await http().post("/auth/refresh").send({ refreshToken: login.body.refreshToken }).expect(401)).body.message).toBe(
        "REFRESH_SESSION_INACTIVE",
      );
      expect((await http().post("/auth/wechat/login").send({ code: users.manager }).expect(403)).body.message).toBe("USER_DISABLED");
      const again = await as("system").post(`/system/accounts/${users.manager}/disable`).expect(409);
      expect(again.body.message).toBe("ACCOUNT_STATUS_CHANGED_RELOAD");
      const listed = (await as("system").get("/system/accounts?status=DISABLED&search=管理壬").expect(200)).body as SystemAccountPage;
      expect(listed.items.map((row) => row.userId)).toEqual([users.manager]);

      const enabled = (await as("system").post(`/system/accounts/${users.manager}/enable`).expect(201)).body as SystemAccountDetail;
      expect(enabled.status).toBe("ACTIVE");
      // Roles and memberships were never touched.
      expect(enabled.roles.map((row) => row.roleCode)).toEqual(["COMPANY_ADMIN", "PROJECT_ADMIN"]);
      expect(await database.projectManagerMember.findUniqueOrThrow({ where: { id: managerMemberId } })).toMatchObject({ status: "ACTIVE" });
      const relogin = await http().post("/auth/wechat/login").send({ code: users.manager }).expect(201);
      await http().get(`/management/companies/${company}/overview`).auth(relogin.body.accessToken, { type: "bearer" }).expect(200);
      await as("system").post(`/system/accounts/${users.manager}/enable`).expect(409);

      const logs = await database.auditLog.findMany({
        where: { entityId: users.manager, action: { in: ["ACCOUNT_DISABLED", "ACCOUNT_ENABLED"] } },
        orderBy: { createdAt: "asc" },
      });
      expect(logs.map((row) => [row.action, row.actorUserId, row.companyId, row.projectId])).toEqual([
        ["ACCOUNT_DISABLED", users.system, null, null],
        ["ACCOUNT_ENABLED", users.system, null, null],
      ]);
      expect(logs[0]!.metadata).toMatchObject({ participantType: "MANAGER", profileId: managerProfileId, revokedSessions: 2, userId: users.manager });
    });

    test("never oneself, never another super administrator", async (): Promise<void> => {
      expect((await as("system").post(`/system/accounts/${users.system}/disable`).expect(403)).body.message).toBe("CANNOT_DISABLE_SELF");
      expect((await as("system").post(`/system/accounts/${users.otherSystem}/disable`).expect(403)).body.message).toBe(
        "SYSTEM_ADMIN_MANAGED_BY_SCRIPT",
      );
      expect((await database.user.findUniqueOrThrow({ where: { id: users.otherSystem } })).status).toBe("ACTIVE");
      await as("manager").get("/system/accounts").expect(401);
      await as("worker").get("/system/accounts").expect(403);
    });

    test("the server command grants and revokes super administrators, never the last one", async (): Promise<void> => {
      const out: string[] = [];
      const output = { error: (line: string) => out.push(`ERR ${line}`), log: (line: string) => out.push(line) };
      // Only manager accounts that are bound and active.
      await expect(grantSystemAdmin(database, "13930000004")).rejects.toMatchObject({ code: "ACCOUNT_NOT_MANAGER" });
      await expect(grantSystemAdmin(database, "13930000005")).rejects.toMatchObject({ code: "ACCOUNT_NOT_BOUND" });
      await expect(grantSystemAdmin(database, "13930000009")).rejects.toMatchObject({ code: "ACCOUNT_NOT_FOUND" });
      // User.phone is not unique: two accounts on one number are listed, nothing changes.
      await createUser("sb-twin", "管理壬二号", "13930000003", true);
      const twin = await grantSystemAdmin(database, "13930000003").catch((error: unknown) => error);
      expect(twin).toBeInstanceOf(SystemAdminCommandError);
      expect((twin as SystemAdminCommandError).candidates.map((row) => row.userId).sort()).toEqual(["sb-twin", users.manager].sort());
      await database.user.delete({ where: { id: "sb-twin" } });

      expect(await runSystemAdminCommand(["grant", "--phone", "13930000003"], database, output)).toBe(0);
      expect(await runSystemAdminCommand(["grant", "--phone", "13930000003"], database, output)).toBe(0);
      expect(out.slice(-2)).toEqual(["已把 管理壬 设为超级管理员。", "管理壬 已经是超级管理员，没有改动。"]);
      await as("manager").get("/system/accounts").expect(401); // still the old, signed-out token
      tokens.set("manager", await tokenFor(users.manager));
      await as("manager").get("/system/accounts").expect(200);
      expect((await as("system").post(`/system/accounts/${users.manager}/disable`).expect(403)).body.message).toBe(
        "SYSTEM_ADMIN_MANAGED_BY_SCRIPT",
      );
      expect(await runSystemAdminCommand(["revoke", "--phone", "13930000003"], database, output)).toBe(0);
      expect(await runSystemAdminCommand(["revoke", "--phone", "13930000003"], database, output)).toBe(1);
      expect(out.at(-1)).toMatch(/^ERR NOT_SYSTEM_ADMIN/);
      expect(await runSystemAdminCommand(["grant", "--phone", "123"], database, output)).toBe(2);
      expect(await runSystemAdminCommand(["promote"], database, output)).toBe(2);

      // Other suites leave super administrators behind; put them aside to reach the last one.
      const others = await database.userRole.findMany({
        where: { role: { code: "SYSTEM_ADMIN" }, scopeType: "GLOBAL", userId: { notIn: [users.system, users.otherSystem] } },
      });
      await database.userRole.deleteMany({ where: { id: { in: others.map((row) => row.id) } } });
      try {
        await revokeSystemAdmin(database, "13930000002");
        expect((await listSystemAdmins(database)).map((row) => row.userId)).toEqual([users.system]);
        await expect(revokeSystemAdmin(database, "13930000001")).rejects.toMatchObject({ code: "LAST_SYSTEM_ADMIN" });
        expect((await listSystemAdmins(database)).map((row) => row.userId)).toEqual([users.system]);
      } finally {
        await database.userRole.createMany({ data: others });
      }
      const logs = await database.auditLog.findMany({
        where: { action: { in: ["SYSTEM_ADMIN_GRANTED", "SYSTEM_ADMIN_REVOKED"] }, entityId: { in: [users.manager, users.otherSystem] } },
        orderBy: { createdAt: "asc" },
      });
      expect(logs.map((row) => [row.action, row.entityId, row.actorUserId])).toEqual([
        ["SYSTEM_ADMIN_GRANTED", users.manager, null],
        ["SYSTEM_ADMIN_REVOKED", users.manager, null],
        ["SYSTEM_ADMIN_REVOKED", users.otherSystem, null],
      ]);
      expect(logs[0]!.metadata).toMatchObject({ managerProfileId, source: "cli" });
    });
  },
);
