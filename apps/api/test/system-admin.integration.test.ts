import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";

import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { AppModule } from "../src/app.module.js";
import { PrismaService } from "../src/infrastructure/database/prisma.service.js";
import { encryptPersonnelName } from "../src/management/personnel-name.js";
import type { CompanyAdminAppointed, SystemCompanyDetail, SystemCompanyPage } from "../src/system/system.types.js";

// Platform companies and company administrators against a real database (system admin
// plan phase 1): appointing a bound account grants the company at once and revoking takes it
// back; a new person binds with the issued code; the migration's backfill keeps existing
// company administrators.

const key = "ab".repeat(32);
const companyA = "sa-company-a";
const companyB = "sa-company-b";
const projectA = "sa-project-a";
const users = {
  legacy: "sa-legacy-admin",
  manager: "sa-manager",
  system: "sa-system",
  worker: "sa-worker",
} as const;
type UserKey = keyof typeof users;

describe.skipIf(process.env.DATABASE_FOUNDATION_TEST_URL === undefined)(
  "platform companies and company administrators over real HTTP",
  (): void => {
    let app: INestApplication;
    let database: PrismaService;
    let managerProfileId = "";
    let legacyProfileId = "";
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
      return app
        .get(JwtService)
        .signAsync({ sid: session.id, sub: userId, sv: 1 }, { secret: process.env.JWT_ACCESS_TOKEN_SECRET!, expiresIn: 3600 });
    };

    const createUser = (id: string, name: string, phone: string, isBound: boolean) =>
      database.user.create({
        data: { id, openid: id, nickname: name, isBound, phone, encryptedRealName: encryptPersonnelName(name, key, randomBytes(12)) },
      });

    const roleId = async (code: "COMPANY_ADMIN" | "SYSTEM_ADMIN"): Promise<string> =>
      (await database.role.findUniqueOrThrow({ where: { code } })).id;

    const companyRoles = (userId: string) =>
      database.userRole.findMany({ where: { userId, role: { code: "COMPANY_ADMIN" } }, select: { scopeId: true, scopeType: true } });

    beforeAll(async (): Promise<void> => {
      const configuredUrl = process.env.DATABASE_FOUNDATION_TEST_URL;
      if (configuredUrl === undefined || !new URL(configuredUrl).searchParams.get("schema")?.startsWith("database_foundation_"))
        throw new Error("Run test:database against an isolated local schema.");
      process.env.DATABASE_URL = configuredUrl;
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
      app = moduleRef.createNestApplication();
      await app.listen(0, "127.0.0.1");
      database = app.get(PrismaService);

      await database.company.create({ data: { id: companyA, name: "SA 甲公司", status: "ACTIVE" } });
      await database.company.create({ data: { id: companyB, name: "SA 乙公司", status: "ACTIVE" } });
      await database.project.create({
        data: {
          id: projectA,
          companyId: companyA,
          name: "SA 项目",
          address: "Test site",
          centerLatitude: "31",
          centerLongitude: "121",
          geofenceRadiusM: 300,
          status: "ACTIVE",
          plannedStartDate: new Date("2026-01-01"),
        },
      });
      await createUser(users.system, "平台甲", "13920000001", true);
      await createUser(users.manager, "管理乙", "13920000002", true);
      await createUser(users.worker, "工人丙", "13920000003", true);
      await createUser(users.legacy, "老管理丁", "13920000004", true);
      managerProfileId = (
        await database.managerProfile.create({ data: { userId: users.manager, name: "管理乙", phone: "13920000002", status: "ACTIVE" } })
      ).id;
      legacyProfileId = (
        await database.managerProfile.create({ data: { userId: users.legacy, name: "老管理丁", phone: "13920000004", status: "ACTIVE" } })
      ).id;
      await database.workerProfile.create({
        data: {
          userId: users.worker,
          encryptedName: encryptPersonnelName("工人丙", key, randomBytes(12)),
          phone: "13920000003",
          workType: "钢筋工",
          realNameStatus: "PENDING",
          faceProfileStatus: "PENDING",
          employmentStatus: "ACTIVE",
        },
      });
      await database.userRole.create({
        data: { userId: users.system, roleId: await roleId("SYSTEM_ADMIN"), scopeType: "GLOBAL", scopeId: "GLOBAL" },
      });
      for (const name of Object.keys(users) as UserKey[]) tokens.set(name, await tokenFor(users[name]));
    });

    afterAll(async (): Promise<void> => {
      if (app !== undefined) await app.close();
    });

    test("appointing a bound manager grants the company at once; revoking takes it back", async (): Promise<void> => {
      await as("manager").get(`/management/companies/${companyA}/overview`).expect(403);

      const candidates = await as("system").get(`/system/companies/${companyA}/admin-candidates?search=13920000`).expect(200);
      // Only manager accounts (Q1): the worker with a matching phone is not offered.
      expect(candidates.body.map((row: { managerProfileId: string }) => row.managerProfileId).sort()).toEqual(
        [legacyProfileId, managerProfileId].sort(),
      );

      const appointed = (await as("system").post(`/system/companies/${companyA}/admins`, { managerProfileId }).expect(201))
        .body as CompanyAdminAppointed;
      expect(appointed.invitation).toBeNull();
      expect(appointed.member).toMatchObject({ invitation: null, isBound: true, managerProfileId, name: "管理乙" });
      expect(await companyRoles(users.manager)).toEqual([{ scopeId: companyA, scopeType: "COMPANY" }]);

      await as("manager").get(`/management/companies/${companyA}/overview`).expect(200);
      await as("manager").get(`/management/companies/${companyB}/overview`).expect(403);
      // Already appointed: neither offered again nor appointed twice.
      const again = await as("system").get(`/system/companies/${companyA}/admin-candidates?search=管理乙`).expect(200);
      expect(again.body).toEqual([]);
      const twice = await as("system").post(`/system/companies/${companyA}/admins`, { managerProfileId }).expect(409);
      expect(twice.body.message).toBe("COMPANY_ADMIN_ALREADY_APPOINTED");

      const page = (await as("system").get("/system/companies?search=SA").expect(200)).body as SystemCompanyPage;
      const rowA = page.items.find((row) => row.id === companyA)!;
      expect(rowA).toMatchObject({ activeProjectCount: 1, admins: [{ isBound: true, name: "管理乙" }], projectCount: 1 });
      expect(page.items.find((row) => row.id === companyB)!.admins).toEqual([]);

      const revoked = await as("system").post(`/system/companies/${companyA}/admins/${appointed.member.memberId}/revoke`).expect(201);
      expect(revoked.body).toEqual({ remainingAdmins: 0 });
      expect(await companyRoles(users.manager)).toEqual([]);
      await as("manager").get(`/management/companies/${companyA}/overview`).expect(403);
      await as("system").post(`/system/companies/${companyA}/admins/${appointed.member.memberId}/revoke`).expect(404);

      const logs = await database.auditLog.findMany({
        where: { companyId: companyA, action: { in: ["COMPANY_ADMIN_APPOINTED", "COMPANY_ADMIN_REVOKED"] } },
        orderBy: { createdAt: "asc" },
      });
      expect(logs.map((row) => [row.action, row.actorUserId, row.entityId])).toEqual([
        ["COMPANY_ADMIN_APPOINTED", users.system, appointed.member.memberId],
        ["COMPANY_ADMIN_REVOKED", users.system, appointed.member.memberId],
      ]);
      // The company's own operation log tells the sentence with the appointee's name.
      const companyLog = await as("system").get(`/management/companies/${companyA}/audit-logs?type=COMPANY`).expect(200);
      expect(companyLog.body.items.map((row: { sentence: string }) => row.sentence)).toEqual(
        expect.arrayContaining([expect.stringContaining("任命 管理乙 为公司管理员"), expect.stringContaining("撤销了 管理乙 的公司管理员身份")]),
      );
    });

    test("a new person gets a code and becomes company administrator when binding", async (): Promise<void> => {
      const worker = await as("system").post(`/system/companies/${companyB}/admins`, { name: "工人丙", phone: "13920000003" }).expect(409);
      expect(worker.body.message).toBe("COMPANY_ADMIN_PHONE_IS_WORKER");
      const existing = await as("system").post(`/system/companies/${companyB}/admins`, { name: "别名", phone: "13920000002" }).expect(409);
      expect(existing.body).toMatchObject({ message: "MANAGER_PHONE_EXISTS", profileId: managerProfileId });

      const appointed = (await as("system").post(`/system/companies/${companyB}/admins`, { name: "新人戊", phone: "13920000005" }).expect(201))
        .body as CompanyAdminAppointed;
      expect(appointed.member).toMatchObject({ invitation: { status: "PENDING" }, isBound: false, name: "新人戊" });
      const firstCode = appointed.invitation!.code;
      // A fresh code replaces the first one.
      const reissued = await as("system").post(`/system/companies/${companyB}/admins/${appointed.member.memberId}/invitation`).expect(201);
      const code = reissued.body.code as string;
      expect(code).not.toBe(firstCode);

      await createUser("sa-newcomer", "新人戊", "13920000005", false);
      tokens.set("newcomer", await tokenFor("sa-newcomer"));
      const stale = await as("newcomer").post("/auth/bind", { invitationCode: firstCode }).expect(400);
      expect(stale.body.message).toBe("BINDING_INVITATION_NOT_AVAILABLE");
      await as("newcomer").post("/auth/bind", { invitationCode: code }).expect(201);
      expect(await companyRoles("sa-newcomer")).toEqual([{ scopeId: companyB, scopeType: "COMPANY" }]);
      await as("newcomer").get(`/management/companies/${companyB}/overview`).expect(200);

      const detail = (await as("system").get(`/system/companies/${companyB}`).expect(200)).body as SystemCompanyDetail;
      expect(detail.admins).toMatchObject([{ invitation: null, isBound: true, name: "新人戊" }]);
      // Already bound: no new code.
      await as("system").post(`/system/companies/${companyB}/admins/${appointed.member.memberId}/invitation`).expect(409);
    });

    test("revoking an appointee who never bound voids the code", async (): Promise<void> => {
      const appointed = (await as("system").post(`/system/companies/${companyA}/admins`, { name: "未到己", phone: "13920000006" }).expect(201))
        .body as CompanyAdminAppointed;
      await as("system").post(`/system/companies/${companyA}/admins/${appointed.member.memberId}/revoke`).expect(201);
      await createUser("sa-late", "未到己", "13920000006", false);
      tokens.set("late", await tokenFor("sa-late"));
      await as("late").post("/auth/bind", { invitationCode: appointed.invitation!.code }).expect(400);
    });

    test("the migration backfill turns an existing COMPANY_ADMIN role into an appointment", async (): Promise<void> => {
      // As the dev seed and test-login fixtures left them before this migration.
      await database.userRole.create({
        data: { userId: users.legacy, roleId: await roleId("COMPANY_ADMIN"), scopeType: "COMPANY", scopeId: companyB },
      });
      const migration = await readFile("prisma/migrations/20261122090000_company_manager_members/migration.sql", "utf8");
      const backfill = migration.slice(migration.indexOf('INSERT INTO "company_manager_members"'));
      await database.$executeRawUnsafe(`${backfill.trim().replace(/;$/, "")} AND ur."userId" = '${users.legacy}'`);

      const detail = (await as("system").get(`/system/companies/${companyB}`).expect(200)).body as SystemCompanyDetail;
      const legacy = detail.admins.find((row) => row.managerProfileId === legacyProfileId)!;
      expect(legacy).toMatchObject({ isBound: true, name: "老管理丁" });
      await as("legacy").get(`/management/companies/${companyB}/overview`).expect(200);
      await as("system").post(`/system/companies/${companyB}/admins/${legacy.memberId}/revoke`).expect(201);
      await as("legacy").get(`/management/companies/${companyB}/overview`).expect(403);
    });

    test("names and credit codes stay unique across the platform", async (): Promise<void> => {
      const created = await as("system")
        .post("/system/companies", { creditCode: "91310115MA1K3YJ12X", name: "SA 丙公司", contactPhone: "021-12345678" })
        .expect(201);
      expect(created.body).toMatchObject({ admins: [], creditCode: "91310115MA1K3YJ12X", projectCount: 0, status: "ACTIVE" });
      const sameName = await as("system").post("/system/companies", { name: "sa 丙公司" }).expect(409);
      expect(sameName.body.message).toBe("COMPANY_NAME_EXISTS");
      const sameCode = await as("system").post("/system/companies", { creditCode: "91310115ma1k3yj12x", name: "SA 丁公司" }).expect(409);
      expect(sameCode.body.message).toBe("COMPANY_CREDIT_CODE_EXISTS");
      const log = await database.auditLog.findFirstOrThrow({ where: { action: "COMPANY_CREATED", entityId: created.body.id } });
      expect(log).toMatchObject({ actorUserId: users.system, companyId: created.body.id, projectId: null });
    });
  },
);
