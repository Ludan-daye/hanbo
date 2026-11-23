import { createHash, randomBytes } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { AppModule } from "../src/app.module.js";
import { PrismaService } from "../src/infrastructure/database/prisma.service.js";
import { WechatCodeSessionConnector } from "../src/infrastructure/wechat/wechat-code-session.connector.js";
import { encryptPersonnelName } from "../src/management/personnel-name.js";
import type {
  CompanyAdminAppointed,
  PlatformSettings,
  SystemAccountPage,
  SystemCompanyDetail,
  SystemCompanyPage,
  SystemOverview,
} from "../src/system/system.types.js";

// The platform home against a real database (system admin plan phase 5, Q10-Q12): every
// number on it equals what you count by opening the list behind it, across every page and
// whatever the earlier suites left in the database; a super administrator's "only you"
// makeups leave out what a company administrator can approve (G8); platform settings are
// read by everyone, saved by super administrators only, and logged under 平台. Runs last.

const key = "ab".repeat(32);
const users = {
  adminA: "ph-company-admin-a",
  disabled: "ph-disabled",
  paA: "ph-project-admin-a",
  paB: "ph-project-admin-b",
  system: "ph-system",
  worker: "ph-worker",
} as const;
type UserKey = keyof typeof users;

type InboxPage = { items: { id: string; onlyYou: boolean; requesterUserId: string }[]; nextCursor: string | null };

describe.skipIf(process.env.DATABASE_FOUNDATION_TEST_URL === undefined)(
  "platform home over real HTTP",
  (): void => {
    let app: INestApplication;
    let database: PrismaService;
    const companies = { a: "", b: "", c: "", d: "" };
    const makeups = { adminA: "", paA: "", paB: "" };
    const tokens = new Map<UserKey, string>();

    const http = () => request(app.getHttpServer());
    const as = (user: UserKey) => ({
      get: (path: string) => http().get(path).auth(tokens.get(user)!, { type: "bearer" }),
      post: (path: string, body: object = {}) => http().post(path).auth(tokens.get(user)!, { type: "bearer" }).send(body),
      put: (path: string, body: object) => http().put(path).auth(tokens.get(user)!, { type: "bearer" }).send(body),
    });
    const read = async <T,>(user: UserKey, path: string): Promise<T> => (await as(user).get(path).expect(200)).body as T;
    const overview = (): Promise<SystemOverview> => read<SystemOverview>("system", "/system/overview");

    /** Every page of a cursor list, as the app reads it with “再读 30 个”. */
    const allPages = async <T,>(user: UserKey, path: string): Promise<T[]> => {
      const items: T[] = [];
      let cursor: string | null = null;
      do {
        const separator = path.includes("?") ? "&" : "?";
        const page: { items: T[]; nextCursor: string | null } = await read(
          user,
          cursor === null ? path : `${path}${separator}cursor=${encodeURIComponent(cursor)}`,
        );
        items.push(...page.items);
        cursor = page.nextCursor;
      } while (cursor !== null);
      return items;
    };
    const companyRows = (query: string) => allPages<SystemCompanyPage["items"][number]>("system", `/system/companies${query}`);
    const inbox = (user: UserKey, query: string) => allPages<InboxPage["items"][number]>(user, `/makeups/pending${query}`);

    const tokenFor = async (userId: string): Promise<string> => {
      const session = await database.userSession.create({
        data: {
          userId,
          tokenHash: createHash("sha256").update(`${userId}:${randomBytes(8).toString("hex")}`).digest("hex"),
          expiresAt: new Date(Date.now() + 3_600_000),
        },
      });
      return app
        .get(JwtService)
        .signAsync({ sid: session.id, sub: userId, sv: 1 }, { secret: process.env.JWT_ACCESS_TOKEN_SECRET!, expiresIn: 3600 });
    };

    const createProject = async (companyId: string, name: string): Promise<string> =>
      (
        await database.project.create({
          data: {
            companyId,
            name,
            address: "Test site",
            centerLatitude: "31",
            centerLongitude: "121",
            geofenceRadiusM: 300,
            status: "ACTIVE",
            plannedStartDate: new Date("2026-01-01"),
          },
        })
      ).id;

    /** A manager on a project, who then asks for a makeup punch for himself. */
    const managerMakeup = async (projectId: string, managerId: string, userId: string): Promise<string> => {
      await database.projectManagerMember.create({
        data: { enteredAt: new Date("2026-10-01T00:00:00+08:00"), managerId, projectId, roleCode: "PROJECT_ADMIN", status: "ACTIVE" },
      });
      return (
        await database.makeupRequest.create({
          data: {
            attendanceDate: new Date("2026-11-18"),
            participantId: managerId,
            participantType: "MANAGER",
            pointCode: "SEGMENT_1_START",
            projectId,
            reason: "手机没电",
            requestedOccurredAt: new Date("2026-11-18T08:00:00+08:00"),
            requesterUserId: userId,
            status: "PENDING",
          },
        })
      ).id;
    };

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

      let phone = 13950000000;
      const profiles = new Map<UserKey, string>();
      for (const [name, id] of Object.entries(users) as [UserKey, string][]) {
        phone += 1;
        await database.user.create({
          data: { encryptedRealName: encryptPersonnelName(`首页${name}`, key, randomBytes(12)), id, isBound: true, nickname: id, openid: id, phone: String(phone) },
        });
        if (name !== "worker")
          profiles.set(name, (await database.managerProfile.create({ data: { name: `首页${name}`, phone: String(phone), status: "ACTIVE", userId: id } })).id);
      }
      const systemAdmin = await database.role.findUniqueOrThrow({ where: { code: "SYSTEM_ADMIN" } });
      await database.userRole.create({ data: { roleId: systemAdmin.id, scopeId: "GLOBAL", scopeType: "GLOBAL", userId: users.system } });
      tokens.set("system", await tokenFor(users.system));

      // A: a bound administrator. B: nobody. C: a new person still to bind. D: suspended,
      // nobody bound either; a suspended company is not something to chase.
      for (const [slot, name] of [["a", "首页甲公司"], ["b", "首页乙公司"], ["c", "首页丙公司"], ["d", "首页丁公司"]] as const)
        companies[slot] = ((await as("system").post("/system/companies", { name }).expect(201)).body as SystemCompanyDetail).id;
      await as("system").post(`/system/companies/${companies.a}/admins`, { managerProfileId: profiles.get("adminA") }).expect(201);
      const invited = (await as("system").post(`/system/companies/${companies.c}/admins`, { name: "首页新人", phone: "13950000101" }).expect(201))
        .body as CompanyAdminAppointed;
      expect(invited.invitation).not.toBeNull();
      await as("system").post(`/system/companies/${companies.d}/admins`, { name: "首页丁新人", phone: "13950000102" }).expect(201);
      const d = (await as("system").get(`/system/companies/${companies.d}`).expect(200)).body as SystemCompanyDetail;
      await as("system").post(`/system/companies/${companies.d}/status`, { expectedUpdatedAt: d.updatedAt, status: "SUSPENDED" }).expect(201);

      const projectA = await createProject(companies.a, "首页甲项目");
      const projectB = await createProject(companies.b, "首页乙项目");
      const projectAdmin = await database.role.findUniqueOrThrow({ where: { code: "PROJECT_ADMIN" } });
      await database.userRole.createMany({
        data: [
          { roleId: projectAdmin.id, scopeId: projectA, scopeType: "PROJECT", userId: users.paA },
          { roleId: projectAdmin.id, scopeId: projectB, scopeType: "PROJECT", userId: users.paB },
          { roleId: projectAdmin.id, scopeId: projectA, scopeType: "PROJECT", userId: users.adminA },
        ],
      });
      // A's project admin: A's company administrator can approve it, so it is not the platform's.
      makeups.paA = await managerMakeup(projectA, profiles.get("paA")!, users.paA);
      // B has no company administrator: only the platform is above its project admin.
      makeups.paB = await managerMakeup(projectB, profiles.get("paB")!, users.paB);
      // A's company administrator, also on a project there: nobody but the platform is above him.
      makeups.adminA = await managerMakeup(projectA, profiles.get("adminA")!, users.adminA);

      for (const name of Object.keys(users) as UserKey[]) if (name !== "system") tokens.set(name, await tokenFor(users[name]));
    });
    afterAll(async (): Promise<void> => {
      if (app !== undefined) await app.close();
    });

    test("only super administrators open the platform home and settings", async (): Promise<void> => {
      for (const user of ["adminA", "paA", "worker"] as const) {
        await as(user).get("/system/overview").expect(403);
        await as(user).get("/system/settings").expect(403);
        await as(user).put("/system/settings", { announcement: "", expectedUpdatedAt: new Date().toISOString(), supportPhone: "" }).expect(403);
      }
      expect((await as("system").get("/system/companies?admin=SOME").expect(400)).body.message).toBe("INVALID_SYSTEM_COMPANY_QUERY");
      expect((await as("system").get("/system/overview").expect(200)).headers["cache-control"]).toBe("no-store");
    });

    test("every number on the home equals the rows of the list it opens", async (): Promise<void> => {
      const home = await overview();

      const withoutAdmin = await companyRows("?status=ACTIVE&admin=NONE");
      expect(home.todos.companiesWithoutAdmin).toBe(withoutAdmin.length);
      expect(withoutAdmin.every((row) => row.admins.length === 0 && row.status === "ACTIVE")).toBe(true);
      expect(withoutAdmin.map((row) => row.id)).toContain(companies.b);
      expect(withoutAdmin.map((row) => row.id)).not.toContain(companies.d);

      const notBound = await companyRows("?status=ACTIVE&admin=NOT_BOUND");
      expect(home.todos.pendingAdminInvitations).toBe(
        notBound.reduce((total, row) => total + row.admins.filter((admin) => !admin.isBound).length, 0),
      );
      expect(notBound.map((row) => row.id)).toEqual(expect.arrayContaining([companies.c]));
      expect(notBound.map((row) => row.id)).not.toContain(companies.d);
      expect(notBound.map((row) => row.id)).not.toContain(companies.a);

      const mine = await inbox("system", "?onlyMine=true");
      expect(home.todos.makeupOnlyYou).toBe(mine.length);
      expect(mine.map((row) => row.id)).toEqual(expect.arrayContaining([makeups.paB, makeups.adminA]));
      expect(mine.map((row) => row.id)).not.toContain(makeups.paA);
      expect(mine.every((row) => row.onlyYou)).toBe(true);

      const everyCompany = await companyRows("");
      expect(home.companies.active + home.companies.suspended).toBe(everyCompany.length);
      expect(home.companies.active).toBe((await companyRows("?status=ACTIVE")).length);
      expect(home.companies.suspended).toBe((await companyRows("?status=SUSPENDED")).length);
      expect(home.projects.active).toBe(everyCompany.reduce((total, row) => total + row.activeProjectCount, 0));

      const accounts = (status: string) => allPages<SystemAccountPage["items"][number]>("system", `/system/accounts?status=${status}`);
      expect(home.accounts.active).toBe((await accounts("ACTIVE")).length);
      expect(home.accounts.disabled).toBe((await accounts("DISABLED")).length);
    });

    test("only-you for the platform leaves out what a company administrator can approve", async (): Promise<void> => {
      const all = await inbox("system", "");
      const flag = (id: string) => all.find((row) => row.id === id)?.onlyYou;
      expect([flag(makeups.paA), flag(makeups.paB), flag(makeups.adminA)]).toEqual([false, true, true]);
      // Unchanged for the company administrator: his project admin's request is his alone.
      const companyMine = await inbox("adminA", "?onlyMine=true");
      expect(companyMine.map((row) => row.id)).toEqual([makeups.paA]);
    });

    test("the home follows what happens: a new company without administrator, a review, a binding", async (): Promise<void> => {
      const before = await overview();
      const added = (await as("system").post("/system/companies", { name: "首页戊公司" }).expect(201)).body as SystemCompanyDetail;
      await as("system").post(`/makeups/requests/${makeups.paB}/reject`, { approvalReason: "核对后驳回" }).expect(201);
      await database.managerProfile.updateMany({ where: { phone: "13950000101" }, data: { userId: users.worker } });
      const after = await overview();
      expect(after.todos).toEqual({
        companiesWithoutAdmin: before.todos.companiesWithoutAdmin + 1,
        makeupOnlyYou: before.todos.makeupOnlyYou - 1,
        pendingAdminInvitations: before.todos.pendingAdminInvitations - 1,
      });
      expect(after.companies.active).toBe(before.companies.active + 1);
      expect((await companyRows("?status=ACTIVE&admin=NONE")).map((row) => row.id)).toContain(added.id);
      await database.managerProfile.updateMany({ where: { phone: "13950000101" }, data: { userId: null } });
    });

    test("settings: everyone reads them, a super administrator saves them, the platform log has it", async (): Promise<void> => {
      const current = await read<PlatformSettings>("system", "/system/settings");
      const saved = (
        await as("system")
          .put("/system/settings", { announcement: "进场请佩戴安全帽", expectedUpdatedAt: current.updatedAt, supportPhone: "400-800-1234" })
          .expect(200)
      ).body as PlatformSettings;
      expect(saved).toMatchObject({ announcement: "进场请佩戴安全帽", supportPhone: "400-800-1234" });
      expect(
        (await as("system").put("/system/settings", { announcement: "旧版本", expectedUpdatedAt: current.updatedAt, supportPhone: "" }).expect(409))
          .body.message,
      ).toBe("PLATFORM_SETTINGS_CHANGED_RELOAD");
      for (const user of ["worker", "paB", "adminA"] as const)
        expect(await read(user, "/app/settings")).toEqual({ announcement: "进场请佩戴安全帽", supportPhone: "400-800-1234" });
      const row = await database.platformSetting.findUniqueOrThrow({ where: { id: "GLOBAL" } });
      expect(row.updatedByUserId).toBe(users.system);

      const log = (await read<{ items: { action: string; category: string; sentence: string }[] }>("system", "/system/audit-logs?type=PLATFORM")).items;
      expect(log[0]).toMatchObject({ action: "PLATFORM_SETTINGS_UPDATED", category: "PLATFORM" });
      expect(log[0]!.sentence).toContain("修改了首页公告、平台联系电话");

      // A disabled person cannot read the settings any more, so the refusal carries the phone (Q12).
      await as("system").post(`/system/accounts/${users.disabled}/disable`).expect(201);
      const refused = await http().post("/auth/wechat/login").send({ code: users.disabled }).expect(403);
      expect(refused.body).toMatchObject({ message: "USER_DISABLED", supportPhone: "400-800-1234" });
    });
  },
);
