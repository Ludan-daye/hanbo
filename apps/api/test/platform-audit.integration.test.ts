import { createHash, randomBytes } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { AppModule } from "../src/app.module.js";
import type { AuditLogEntryResponse, AuditLogPageResponse } from "../src/audit/audit-log.types.js";
import { PrismaService } from "../src/infrastructure/database/prisma.service.js";
import { encryptPersonnelName } from "../src/management/personnel-name.js";
import type { SystemCompanyDetail } from "../src/system/system.types.js";

// The platform operation log against a real database (system admin plan phase 4): it sees
// both companies and the rows of no company, narrows to one company, a type or an actor
// (whose registrations a super admin read, Q8), pages with the cursor, and publishing the
// safety credit policy is recorded. Runs last in test:database, so its rows are the newest.

const key = "ab".repeat(32);
const users = {
  adminA: "pa-company-admin-a",
  system: "pa-system",
  workerA: "pa-worker-a",
} as const;
type UserKey = keyof typeof users;

const chinaDayAfter = (days: number): string =>
  new Date(Date.now() + 8 * 3_600_000 + days * 86_400_000).toISOString().slice(0, 10);

describe.skipIf(process.env.DATABASE_FOUNDATION_TEST_URL === undefined)(
  "platform operation log over real HTTP",
  (): void => {
    let app: INestApplication;
    let database: PrismaService;
    let companyA = "";
    let companyB = "";
    let projectA = "";
    let projectB = "";
    let memberA = "";
    const tokens = new Map<string, string>();

    const http = () => request(app.getHttpServer());
    const as = (user: UserKey) => ({
      get: (path: string) => http().get(path).auth(tokens.get(user)!, { type: "bearer" }),
      post: (path: string, body: object = {}) => http().post(path).auth(tokens.get(user)!, { type: "bearer" }).send(body),
    });
    const log = async (query: string): Promise<AuditLogPageResponse> =>
      (await as("system").get(`/system/audit-logs${query === "" ? "" : `?${query}`}`).expect(200)).body as AuditLogPageResponse;

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

    const createUser = (id: string, name: string, phone: string) =>
      database.user.create({
        data: { id, openid: id, nickname: `昵称${name}`, isBound: true, phone, encryptedRealName: encryptPersonnelName(name, key, randomBytes(12)) },
      });

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

    beforeAll(async (): Promise<void> => {
      const configuredUrl = process.env.DATABASE_FOUNDATION_TEST_URL;
      if (configuredUrl === undefined || !new URL(configuredUrl).searchParams.get("schema")?.startsWith("database_foundation_"))
        throw new Error("Run test:database against an isolated local schema.");
      process.env.DATABASE_URL = configuredUrl;
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
      app = moduleRef.createNestApplication();
      await app.listen(0, "127.0.0.1");
      database = app.get(PrismaService);

      await createUser(users.system, "平台审计甲", "13930000001");
      await createUser(users.adminA, "公司管理乙", "13930000002");
      await createUser(users.workerA, "工人丙", "13930000003");
      const role = async (code: "COMPANY_ADMIN" | "SYSTEM_ADMIN"): Promise<string> =>
        (await database.role.findUniqueOrThrow({ where: { code } })).id;
      await database.userRole.create({
        data: { userId: users.system, roleId: await role("SYSTEM_ADMIN"), scopeType: "GLOBAL", scopeId: "GLOBAL" },
      });
      for (const name of Object.keys(users) as UserKey[]) tokens.set(name, await tokenFor(users[name]));

      // Both companies are created over HTTP, so COMPANY_CREATED is written the real way.
      companyA = ((await as("system").post("/system/companies", { name: "PA 甲公司" }).expect(201)).body as SystemCompanyDetail).id;
      companyB = ((await as("system").post("/system/companies", { name: "PA 乙公司" }).expect(201)).body as SystemCompanyDetail).id;
      await database.userRole.create({
        data: { userId: users.adminA, roleId: await role("COMPANY_ADMIN"), scopeType: "COMPANY", scopeId: companyA },
      });
      projectA = await createProject(companyA, "PA 甲项目");
      projectB = await createProject(companyB, "PA 乙项目");
      const worker = await database.workerProfile.create({
        data: {
          userId: users.workerA,
          encryptedName: encryptPersonnelName("工人丙", key, randomBytes(12)),
          phone: "13930000003",
          workType: "钢筋工",
          realNameStatus: "PENDING",
          faceProfileStatus: "PENDING",
          employmentStatus: "ACTIVE",
          registrationCompletedAt: new Date(),
        },
      });
      memberA = (
        await database.projectWorkerMember.create({
          data: { projectId: projectA, workerId: worker.id, enteredAt: new Date("2026-10-01T00:00:00+08:00"), projectRoleLabel: "钢筋工", status: "ACTIVE" },
        })
      ).id;
    });

    afterAll(async (): Promise<void> => {
      if (app !== undefined) await app.close();
    });

    test("only the super admin reads it", async (): Promise<void> => {
      await as("adminA").get("/system/audit-logs").expect(403);
      await as("adminA").get(`/system/audit-logs?companyId=${companyA}`).expect(403);
      await as("workerA").get("/system/audit-logs").expect(403);
    });

    test("sees both companies and narrows to one", async (): Promise<void> => {
      // A row in each project; the trigger fills in companyId.
      for (const projectId of [projectA, projectB])
        await database.auditLog.create({
          data: { action: "project.update", actorUserId: users.adminA, entityId: projectId, entityType: "project", metadata: {}, projectId },
        });

      const all = await log("");
      const ours = all.items.filter((item) => item.companyId === companyA || item.companyId === companyB);
      expect(new Set(ours.map((item) => item.companyName))).toEqual(new Set(["PA 甲公司", "PA 乙公司"]));
      expect(ours.find((item) => item.projectId === projectB)).toMatchObject({
        category: "PROJECT",
        companyName: "PA 乙公司",
        projectName: "PA 乙项目",
        sentence: "公司管理乙 修改了项目设置",
      });

      const onlyA = await log(`companyId=${companyA}`);
      expect(onlyA.items.length).toBeGreaterThan(0);
      expect(onlyA.items.every((item) => item.companyId === companyA)).toBe(true);
      expect(onlyA.items.map((item) => item.action)).toEqual(["project.update", "COMPANY_CREATED"]);
      // Creating the company is a platform action here, 公司 in the company's own log.
      expect(onlyA.items[1]).toMatchObject({ actorName: "平台审计甲", category: "PLATFORM", sentence: "平台审计甲 创建了公司“PA 甲公司”" });
      const own = (await http()
        .get(`/management/companies/${companyA}/audit-logs?type=COMPANY`)
        .auth(tokens.get("adminA")!, { type: "bearer" })
        .expect(200)).body as AuditLogPageResponse;
      expect(own.items.map((item) => [item.action, item.category])).toEqual([["COMPANY_CREATED", "COMPANY"]]);
      expect((await log(`companyId=${companyA}&type=COMPANY`)).items).toEqual([]);
      // The company log still refuses the platform-only type.
      await http().get(`/management/companies/${companyA}/audit-logs?type=PLATFORM`).auth(tokens.get("adminA")!, { type: "bearer" }).expect(400);
    });

    test("records the safety credit policy, which belongs to no company, under 平台", async (): Promise<void> => {
      const startsOn = chinaDayAfter(45);
      const published = await as("system")
        .post("/safety-credit/policies", {
          startsOn,
          generalPoints: 5,
          seriousPoints: 10,
          majorPoints: 20,
          recoveryWorkdays: 10,
          recoveryPoints: 5,
        })
        .expect(201);
      const version = (published.body as { version: number }).version;
      const platform = await log("type=PLATFORM");
      expect(platform.items.every((item) => item.category === "PLATFORM")).toBe(true);
      const [, month, day] = startsOn.split("-");
      expect(platform.items[0]).toMatchObject({
        action: "SAFETY_POLICY_PUBLISHED",
        actorUserId: users.system,
        companyId: null,
        projectId: null,
        sentence: `平台审计甲 发布了第 ${version} 版安全信用规则，${startsOn.slice(0, 4)}年${Number(month)}月${Number(day)}日起执行`,
      });
      const created = platform.items.filter((item) => item.action === "COMPANY_CREATED").map((item) => item.companyId);
      expect(created).toEqual(expect.arrayContaining([companyA, companyB]));
      const row = await database.auditLog.findFirstOrThrow({ where: { action: "SAFETY_POLICY_PUBLISHED", actorUserId: users.system } });
      expect(row.metadata).toMatchObject({ generalPoints: 5, startsOn, version });
    });

    test("a super admin's reads of registrations show up by actor (Q8)", async (): Promise<void> => {
      await as("system").get(`/management/projects/${projectA}/participants/${memberA}/registration`).expect(200);
      const viewed = await log(`actorUserId=${users.system}&type=PEOPLE`);
      expect(viewed.items.map((item) => [item.action, item.sentence, item.companyName, item.projectName])).toEqual([
        ["WORKER_REGISTRATION_VIEWED", "平台审计甲 查看了 工人丙 的用工资料", "PA 甲公司", "PA 甲项目"],
      ]);
      const byActor = await log(`actorUserId=${users.system}`);
      expect(byActor.items.every((item) => item.actorUserId === users.system)).toBe(true);
      expect(byActor.items.map((item) => item.action)).toEqual(
        expect.arrayContaining(["WORKER_REGISTRATION_VIEWED", "SAFETY_POLICY_PUBLISHED", "COMPANY_CREATED"]),
      );
      expect((await log("actorUserId=nobody")).items).toEqual([]);
    });

    test("pages newest first with the cursor, without repeats", async (): Promise<void> => {
      const start = Date.now();
      for (let index = 0; index < 32; index += 1)
        await database.auditLog.create({
          data: {
            action: "project.update",
            actorUserId: users.adminA,
            createdAt: new Date(start + index * 1000),
            entityId: projectB,
            entityType: "project",
            metadata: { index },
            projectId: projectB,
          },
        });
      const seen: AuditLogEntryResponse[] = [];
      let cursor: string | null = null;
      do {
        const page: AuditLogPageResponse = await log(`companyId=${companyB}${cursor === null ? "" : `&cursor=${encodeURIComponent(cursor)}`}`);
        expect(page.items.length).toBeLessThanOrEqual(30);
        seen.push(...page.items);
        cursor = page.nextCursor;
      } while (cursor !== null);
      // 32 here, plus the earlier edit and COMPANY_CREATED.
      expect(seen).toHaveLength(34);
      expect(new Set(seen.map((item) => item.id)).size).toBe(34);
      const times = seen.map((item) => Date.parse(item.createdAt));
      expect([...times].sort((a, b) => b - a)).toEqual(times);
      expect(seen.at(-1)?.action).toBe("COMPANY_CREATED");
    });
  },
);
