import { createHash, randomBytes } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { AppModule } from "../src/app.module.js";
import { PrismaService } from "../src/infrastructure/database/prisma.service.js";
import { encryptPersonnelName, personnelNameSearchHashes } from "../src/management/personnel-name.js";
import type { CompanyOverviewResponse } from "../src/overview/company-overview.types.js";

// Company-admin features against a real database: the company home numbers equal
// the lists they open, "only you can approve" makeups, cross-company isolation.

const key = "ab".repeat(32);
const companyId = "ca-company";
const otherCompanyId = "ca-other-company";
const p1 = "ca-p1";
const p2 = "ca-p2";
const p3 = "ca-p3";
const x1 = "ca-x1";
const t1 = "ca-t1";
const t2 = "ca-t2";
const users = {
  company: "ca-company-admin",
  leader: "ca-leader",
  other: "ca-other-admin",
  pa1: "ca-pa1",
  w1: "ca-w1",
  w2: "ca-w2",
} as const;
type UserKey = keyof typeof users;

describe.skipIf(process.env.DATABASE_FOUNDATION_TEST_URL === undefined)(
  "company admin features over real HTTP",
  (): void => {
    let app: INestApplication;
    let database: PrismaService;
    const tokens = new Map<UserKey, string>();
    const workerIds = new Map<"w1" | "w2" | "leader", string>();
    const memberIds = new Map<string, string>();
    let managerId = "";

    const auth = (user: UserKey): string => tokens.get(user)!;
    const http = () => request(app.getHttpServer());
    const get = async (user: UserKey, path: string, status = 200) =>
      (await http().get(path).auth(auth(user), { type: "bearer" }).expect(status)).body;

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
        .signAsync(
          { sid: session.id, sub: userId, sv: 1 },
          { secret: process.env.JWT_ACCESS_TOKEN_SECRET!, expiresIn: 3600 },
        );
    };

    beforeAll(async (): Promise<void> => {
      const configuredUrl = process.env.DATABASE_FOUNDATION_TEST_URL;
      if (
        configuredUrl === undefined ||
        !new URL(configuredUrl).searchParams
          .get("schema")
          ?.startsWith("database_foundation_")
      )
        throw new Error("Run test:database against an isolated local schema.");
      process.env.DATABASE_URL = configuredUrl;
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = moduleRef.createNestApplication();
      await app.listen(0, "127.0.0.1");
      database = app.get(PrismaService);

      for (const [id, name] of [
        [companyId, "CA company"],
        [otherCompanyId, "CA other"],
      ] as const)
        await database.company.create({ data: { id, name, status: "ACTIVE" } });
      for (const [id, company, status] of [
        [p1, companyId, "ACTIVE"],
        [p2, companyId, "ACTIVE"],
        [p3, companyId, "PREPARING"],
        [x1, otherCompanyId, "ACTIVE"],
      ] as const)
        await database.project.create({
          data: {
            id,
            companyId: company,
            name: `项目${id}`,
            address: "Test site",
            centerLatitude: "31",
            centerLongitude: "121",
            geofenceRadiusM: 300,
            status,
            plannedStartDate: new Date("2026-01-01"),
          },
        });
      await database.team.create({ data: { id: t1, projectId: p1, name: "钢筋一班", status: "ACTIVE" } });
      await database.team.create({ data: { id: t2, projectId: p2, name: "木工一班", status: "ACTIVE" } });
      let phone = 13910000100;
      for (const [name, id] of Object.entries(users)) {
        phone += 1;
        await database.user.create({
          data: {
            id,
            openid: id,
            nickname: id,
            isBound: true,
            phone: String(phone),
            encryptedRealName: encryptPersonnelName(`测试${name}`, key, randomBytes(12)),
          },
        });
      }
      for (const name of ["w1", "w2", "leader"] as const) {
        const worker = await database.workerProfile.create({
          data: {
            userId: users[name],
            encryptedName: encryptPersonnelName(`工人${name}`, key, randomBytes(12)),
            phone: `1391000099${name === "w1" ? 1 : name === "w2" ? 2 : 3}`,
            workType: "钢筋工",
            realNameStatus: "PENDING",
            faceProfileStatus: "PENDING",
            employmentStatus: "ACTIVE",
          },
        });
        const member = await database.projectWorkerMember.create({
          data: {
            projectId: name === "w2" ? p2 : p1,
            workerId: worker.id,
            teamId: name === "w2" ? t2 : t1,
            enteredAt: new Date("2026-10-01T00:00:00+08:00"),
            projectRoleLabel: name === "leader" ? "TEAM_LEADER" : "钢筋工",
            status: "ACTIVE",
          },
        });
        workerIds.set(name, worker.id);
        memberIds.set(name, member.id);
      }
      await database.team.update({
        where: { id: t1 },
        data: { leaderWorkerMemberId: memberIds.get("leader")! },
      });
      const manager = await database.managerProfile.create({
        data: { userId: users.pa1, name: "项目经理甲", phone: "13910000555", status: "ACTIVE" },
      });
      managerId = manager.id;
      for (const projectId of [p1, p3]) {
        const member = await database.projectManagerMember.create({
          data: {
            projectId,
            managerId,
            roleCode: "PROJECT_ADMIN",
            enteredAt: new Date("2026-10-01T00:00:00+08:00"),
            status: "ACTIVE",
          },
        });
        memberIds.set(`pa1:${projectId}`, member.id);
      }
      const roles = await database.role.findMany();
      const roleId = (code: string): string => roles.find((role) => role.code === code)!.id;
      await database.userRole.createMany({
        data: [
          { userId: users.company, roleId: roleId("COMPANY_ADMIN"), scopeType: "COMPANY", scopeId: companyId },
          { userId: users.other, roleId: roleId("COMPANY_ADMIN"), scopeType: "COMPANY", scopeId: otherCompanyId },
          { userId: users.pa1, roleId: roleId("PROJECT_ADMIN"), scopeType: "PROJECT", scopeId: p1 },
          { userId: users.pa1, roleId: roleId("PROJECT_ADMIN"), scopeType: "PROJECT", scopeId: p3 },
          { userId: users.leader, roleId: roleId("TEAM_LEADER"), scopeType: "TEAM", scopeId: t1 },
        ],
      });
      for (const name of Object.keys(users) as UserKey[])
        tokens.set(name, await tokenFor(users[name]));
    });
    afterAll(async (): Promise<void> => {
      if (app !== undefined) await app.close();
    });

    describe("company overview and only-you makeups", (): void => {
      beforeAll(async (): Promise<void> => {
        const makeup = (requester: UserKey, projectId: string, participantType: "WORKER" | "MANAGER", participantId: string) =>
          database.makeupRequest.create({
            data: {
              projectId,
              requesterUserId: users[requester],
              participantType,
              participantId,
              attendanceDate: new Date("2026-11-18"),
              pointCode: "SEGMENT_1_START",
              requestedOccurredAt: new Date("2026-11-18T08:00:00+08:00"),
              reason: "手机没电",
              status: "PENDING",
            },
          });
        await makeup("w1", p1, "WORKER", workerIds.get("w1")!);
        await makeup("pa1", p1, "MANAGER", managerId);
        await makeup("w2", p2, "WORKER", workerIds.get("w2")!);
        await database.safetyViolation.create({
          data: {
            workerId: workerIds.get("w2")!,
            projectId: p2,
            teamId: t2,
            memberId: memberIds.get("w2")!,
            eventKey: "ca-violation-1",
            category: "未戴安全帽",
            severity: "GENERAL",
            occurredAt: new Date("2026-11-18T09:00:00+08:00"),
            description: "测试",
            points: 2,
            policyVersion: 1,
            status: "PENDING",
            createdByUserId: users.company,
          },
        });
        await database.faceProfile.create({
          data: {
            ownerType: "WORKER",
            ownerId: workerIds.get("w1")!,
            baselineObjectKey: "faces/ca-w1.jpg",
            baselineImageHash: "ca-w1",
            status: "PENDING",
            submittedByUserId: users.w1,
          },
        });
        await database.personnelTransferRequest.create({
          data: {
            companyId,
            sourceProjectId: p2,
            sourceMemberId: memberIds.get("w2")!,
            targetProjectId: p1,
            participantType: "WORKER",
            profileId: workerIds.get("w2")!,
            projectRoleLabel: "钢筋工",
            teamId: t1,
            requiresAttendance: true,
            enteredAt: new Date("2026-11-20T00:00:00+08:00"),
            requestedByUserId: users.pa1,
          },
        });
      });

      test("is for this company's admins only", async (): Promise<void> => {
        const path = `/management/companies/${companyId}/overview`;
        await get("pa1", path, 403);
        await get("other", path, 403);
        expect((await get("company", `${path}?date=2026-13-01`, 400)).message).toBe("INVALID_OVERVIEW_QUERY");
        await get("company", path);
      });

      test("every number equals the rows of the list it opens", async (): Promise<void> => {
        const date = "2026-11-18";
        const overview: CompanyOverviewResponse = await get(
          "company",
          `/management/companies/${companyId}/overview?date=${date}`,
        );
        expect(overview.projects.map((row) => [row.projectId, row.status])).toEqual([
          [p1, "ACTIVE"],
          [p2, "ACTIVE"],
          [p3, "PREPARING"],
        ]);
        const daily = await get("company", `/reports/companies/${companyId}/daily?date=${date}`);
        expect(overview.attendance).toEqual({
          expected: daily.totals.scheduledDays,
          missing: daily.totals.missingPunchCount,
          present: daily.totals.actualAttendedDays,
          workedMinutes: daily.totals.workedMinutes,
        });
        let activeExpected = 0;
        for (const project of overview.projects) {
          const own = await get("company", `/management/projects/${project.projectId}/overview?date=${date}`);
          // A preparing (suspended, completed) site has nobody expected on the company
          // home, even though its own page still lists its members.
          if (project.status === "ACTIVE") activeExpected += own.attendance.expected;
          else expect(own.attendance.expected).toBeGreaterThan(0);
          expect(project.attendance).toEqual(
            project.status === "ACTIVE"
              ? {
                  expected: own.attendance.expected,
                  missing: own.attendance.missing,
                  present: own.attendance.present,
                }
              : { expected: 0, missing: 0, present: 0 },
          );
          expect(project.todos).toEqual({
            facePending: own.todos.facePending,
            violationPending: own.todos.violationPending,
          });
        }
        expect(overview.attendance.expected).toBe(activeExpected);
        expect(overview.projects.find((row) => row.projectId === p1)!.todos.facePending).toBe(1);
        expect(overview.projects.find((row) => row.projectId === p2)!.todos.violationPending).toBe(1);
        const all = (await get("company", "/makeups/pending")) as { items: { requesterUserId: string; onlyYou: boolean }[] };
        const mine = (await get("company", "/makeups/pending?onlyMine=true")) as { items: { requesterUserId: string }[] };
        expect(overview.todos.makeupPending).toBe(all.items.length);
        expect(overview.todos.makeupOnlyYou).toBe(mine.items.length);
        // The project admin's own request and the request of a project without admins.
        expect(mine.items.map((row) => row.requesterUserId).sort()).toEqual([users.pa1, users.w2].sort());
        expect(all.items.find((row) => row.requesterUserId === users.w1)?.onlyYou).toBe(false);
        const transfers = await get("company", `/management/companies/${companyId}/transfer-requests`);
        expect(overview.todos.transferPending).toBe(transfers.items.length);
        expect(overview.todos.transferPending).toBe(1);
      });

      test("the project admin still sees the worker's request, never their own", async (): Promise<void> => {
        const inbox = (await get("pa1", "/makeups/pending")) as { items: { requesterUserId: string }[] };
        expect(inbox.items.map((row) => row.requesterUserId)).toEqual([users.w1]);
        expect(((await get("other", "/makeups/pending")) as { items: unknown[] }).items).toEqual([]);
        expect((await get("company", "/makeups/pending?onlyMine=yes", 400)).message).toBe("INVALID_MAKEUP_INBOX_QUERY");
      });
    });

    describe("a participant read can be saved back unchanged", (): void => {
      type Read = {
        additionalRoles: { roleCode: string; teamId: string | null }[];
        displayName: string; enteredAt: string; exitedAt: string | null; participantType: string;
        phone: string; profileUpdatedAt: string; projectRoleLabel: string; requiresAttendance: boolean;
        status: string; teamId: string | null; updatedAt: string; workType: string | null;
      };
      const writeBody = (read: Read) => ({
        additionalRoles: read.additionalRoles.map(({ roleCode, teamId }) => ({ roleCode, teamId })),
        displayName: read.displayName,
        enteredAt: read.enteredAt,
        exitedAt: read.exitedAt,
        expectedProfileUpdatedAt: read.profileUpdatedAt,
        expectedUpdatedAt: read.updatedAt,
        participantType: read.participantType,
        phone: read.phone,
        projectRoleLabel: read.projectRoleLabel,
        requiresAttendance: read.requiresAttendance,
        status: read.status,
        teamId: read.teamId,
        workType: read.workType,
      });

      test("a manager without a work type round-trips; a worker still needs one", async (): Promise<void> => {
        const managerPath = `/management/projects/${p1}/participants/${memberIds.get(`pa1:${p1}`)}`;
        const manager = (await get("company", managerPath)) as Read;
        expect(manager.workType).toBeNull();
        const saved = (
          await http().put(managerPath).auth(auth("company"), { type: "bearer" }).send(writeBody(manager)).expect(200)
        ).body as Read;
        expect(saved.workType).toBeNull();
        const workerPath = `/management/projects/${p1}/participants/${memberIds.get("w1")}`;
        const worker = (await get("company", workerPath)) as Read;
        const rejected = (
          await http()
            .put(workerPath)
            .auth(auth("company"), { type: "bearer" })
            .send({ ...writeBody(worker), workType: null })
            .expect(400)
        ).body as { message: string; issues: { path: string[] }[] };
        expect(rejected.message).toBe("INVALID_PARTICIPANT_REQUEST");
        expect(rejected.issues.map((issue) => issue.path.join("."))).toEqual(["workType"]);
      });
    });

    describe("a preparing project's attendance plan", (): void => {
      test("can be read by the company admin, still not changed", async (): Promise<void> => {
        const path = `/attendance/planning/${p3}/PROJECT/${p3}`;
        const plan = (await get("company", path)) as { points: unknown[] };
        expect(plan.points.length).toBeGreaterThan(0);
        const saved = await http()
          .post(path)
          .auth(auth("company"), { type: "bearer" })
          .send({ endsOn: null, expectedId: null, name: "筹备期", points: plan.points, startsOn: "2030-01-01", workdays: [1, 2, 3, 4, 5] })
          .expect(404);
        expect(saved.body.message).toBe("PROJECT_NOT_FOUND");
      });
    });

    describe("who runs each project, and offboarding", (): void => {
      const projectFields = {
        address: "测试工地",
        centerLatitude: "31.2304000",
        centerLongitude: "121.4737000",
        geofenceRadiusM: 300,
        name: "新开工地",
        plannedEndDate: null,
        plannedStartDate: "2026-11-21",
        status: "PREPARING",
      };

      test("lists each project's admins for this company's admins only", async (): Promise<void> => {
        const path = `/management/companies/${companyId}/project-admins`;
        await get("pa1", path, 403);
        await get("other", path, 403);
        const body = (await get("company", path)) as {
          projects: { projectId: string; admins: { profileId: string; displayName: string; isBound: boolean }[] }[];
        };
        const admins = (projectId: string) =>
          body.projects.find((row) => row.projectId === projectId)!.admins;
        expect(admins(p1)).toEqual([expect.objectContaining({ profileId: managerId, displayName: "项目经理甲", isBound: true })]);
        expect(admins(p2)).toEqual([]);
        expect(admins(p3).map((row) => row.profileId)).toEqual([managerId]);
        const projects = (await get("company", `/management/companies/${companyId}/projects`)) as {
          id: string; adminNames: string[]; activeMembers: number;
        }[];
        expect(projects.find((row) => row.id === p1)).toMatchObject({ adminNames: ["项目经理甲"], activeMembers: 3 });
        expect(projects.find((row) => row.id === p2)).toMatchObject({ adminNames: [], activeMembers: 1 });
      });

      test("a person's posts cover this company's projects only", async (): Promise<void> => {
        const person = await get("company", `/management/companies/${companyId}/people/MANAGER/${managerId}`);
        expect(person.memberships.map((row: { projectId: string }) => row.projectId).sort()).toEqual([p1, p3]);
        expect(person.memberships[0].roles).toEqual([{ roleCode: "PROJECT_ADMIN", teamId: null, teamName: null }]);
        await get("other", `/management/companies/${companyId}/people/MANAGER/${managerId}`, 403);
        expect((await get("other", `/management/companies/${otherCompanyId}/people/MANAGER/${managerId}`, 404)).message).toBe("COMPANY_PERSON_NOT_FOUND");
        expect((await get("company", `/management/companies/${companyId}/people/ADMIN/${managerId}`, 400)).message).toBe("INVALID_PARTICIPANT_TYPE");
      });

      test("offboarding revokes every management post in one go, then exits", async (): Promise<void> => {
        const base = `/management/companies/${companyId}/people`;
        const post = (user: UserKey, path: string, body: object, status: number) =>
          http().post(path).auth(auth(user), { type: "bearer" }).send(body).expect(status);
        await post("pa1", `${base}/MANAGER/${managerId}/offboard`, { effectiveDate: "2026-11-21" }, 403);
        expect((await post("company", `${base}/MANAGER/${managerId}/offboard`, { effectiveDate: "2026-11-31" }, 400)).body.message).toBe("INVALID_OFFBOARD_REQUEST");
        // Nobody offboards themselves.
        const own = await database.managerProfile.create({ data: { userId: users.company, name: "公司管理员本人", phone: "13910000666", status: "ACTIVE" } });
        await database.projectManagerMember.create({ data: { projectId: p2, managerId: own.id, roleCode: "WORKER", status: "ACTIVE" } });
        expect((await post("company", `${base}/MANAGER/${own.id}/offboard`, { effectiveDate: "2026-11-21", mode: "EXIT_ALL" }, 409)).body.message).toBe("CANNOT_CHANGE_OWN_MANAGEMENT_ASSIGNMENT");

        const revokedSince = new Date();
        const revoked = (await post("company", `${base}/MANAGER/${managerId}/offboard`, { effectiveDate: "2026-11-21" }, 201)).body;
        expect(revoked.memberships.map((row: { projectRoleLabel: string; status: string }) => [row.projectRoleLabel, row.status])).toEqual([
          ["WORKER", "ACTIVE"],
          ["WORKER", "ACTIVE"],
        ]);
        expect(await database.userRole.count({ where: { userId: users.pa1, role: { code: "PROJECT_ADMIN" } } })).toBe(0);
        expect(await database.userRole.count({ where: { userId: users.pa1, role: { code: "WORKER" } } })).toBe(2);
        const updates = await database.auditLog.findMany({ where: { action: "project.member.update", createdAt: { gte: revokedSince }, entityId: { in: [memberIds.get(`pa1:${p1}`)!, memberIds.get(`pa1:${p3}`)!] } } });
        expect(updates.map((row) => row.projectId).sort()).toEqual([p1, p3]);
        expect(await database.auditLog.count({ where: { action: "PERSONNEL_OFFBOARDED", entityId: managerId } })).toBe(1);
        expect((await post("company", `${base}/MANAGER/${managerId}/offboard`, { effectiveDate: "2026-11-21" }, 409)).body.message).toBe("OFFBOARD_NOTHING_TO_CHANGE");

        // A team leader loses the role and the team.
        await post("company", `${base}/WORKER/${workerIds.get("leader")}/offboard`, { effectiveDate: "2026-11-21", mode: "REVOKE_ADMIN" }, 201);
        expect((await database.team.findUniqueOrThrow({ where: { id: t1 } })).leaderWorkerMemberId).toBeNull();
        expect(await database.teamLeaderChange.count({ where: { teamId: t1, reason: "MEMBER_OFFBOARDED" } })).toBe(1);
        expect(await database.teamLeaderChange.count({ where: { teamId: t1, reason: "MEMBER_TRANSFERRED" } })).toBe(0);
        expect(await database.userRole.count({ where: { userId: users.leader, role: { code: "TEAM_LEADER" } } })).toBe(0);
        expect((await database.projectWorkerMember.findUniqueOrThrow({ where: { id: memberIds.get("leader")! } })).projectRoleLabel).toBe("钢筋工");

        const exited = (await post("company", `${base}/MANAGER/${managerId}/offboard`, { effectiveDate: "2026-11-21", mode: "EXIT_ALL" }, 201)).body;
        expect(exited.memberships.map((row: { status: string }) => row.status)).toEqual(["EXITED", "EXITED"]);
        expect(await database.userRole.count({ where: { userId: users.pa1 } })).toBe(0);
        // Makeup requests stay as they were.
        expect(await database.makeupRequest.count({ where: { requesterUserId: users.pa1, status: "PENDING" } })).toBe(1);
      });

      test("a new project can take a new administrator, who is bound later by invitation", async (): Promise<void> => {
        const path = `/management/companies/${companyId}/projects`;
        const create = (body: object, status: number) =>
          http().post(path).auth(auth("company"), { type: "bearer" }).send(body).expect(status);
        expect((await create({ ...projectFields, managerProfileIds: [] }, 400)).body.message).toBe("INVALID_CREATE_PROJECT_REQUEST");
        const before = await database.project.count({ where: { companyId } });
        const duplicate = (await create({ ...projectFields, managerProfileIds: [], newManagers: [{ name: "重名", phone: "13910000555" }] }, 409)).body;
        expect(duplicate).toMatchObject({ message: "PROJECT_MANAGER_PHONE_EXISTS", profileId: managerId });
        expect(await database.project.count({ where: { companyId } })).toBe(before);
        const created = (await create({ ...projectFields, managerProfileIds: [], newManagers: [{ name: "新经理", phone: "13910000777" }] }, 201)).body as { id: string };
        const admins = (await get("company", `/management/companies/${companyId}/project-admins`)) as {
          projects: { projectId: string; admins: { displayName: string; isBound: boolean }[] }[];
        };
        expect(admins.projects.find((row) => row.projectId === created.id)!.admins).toEqual([
          expect.objectContaining({ displayName: "新经理", isBound: false }),
        ]);
        const audit = await database.auditLog.findFirstOrThrow({ where: { action: "project.create", entityId: created.id } });
        expect(audit.projectId).toBe(created.id);
      });
    });

    describe("company people, one person per row", (): void => {
      type PageItem = { participantType: string; profileId: string; projectCount: number; projects: { projectId: string }[]; registrationStatus: string | null; faceStatus: string };
      const page = async (user: UserKey, companyQuery: string, status = 200) =>
        (await get(user, `/management/companies/${companyId}/people-page?${companyQuery}`, status)) as { items: PageItem[]; total: number };

      beforeAll(async (): Promise<void> => {
        // w2 also works on p1 and on another company's project.
        for (const projectId of [p1, x1])
          await database.projectWorkerMember.create({
            data: { projectId, workerId: workerIds.get("w2")!, enteredAt: new Date("2026-11-01T00:00:00+08:00"), projectRoleLabel: "木工", status: "ACTIVE" },
          });
        await database.workerProfile.update({ where: { id: workerIds.get("w1")! }, data: { realNameStatus: "VERIFIED" } });
        await database.workerProfile.update({
          where: { id: workerIds.get("w2")! },
          data: { nameSearchHashes: [...personnelNameSearchHashes("工人w2", key)] },
        });
      });

      test("checks the query and the caller", async (): Promise<void> => {
        expect((await page("company", "pageSize=101", 400) as unknown as { message: string }).message).toBe("INVALID_COMPANY_PEOPLE_PAGE");
        expect((await page("company", "registrationStatus=DONE", 400) as unknown as { message: string }).message).toBe("INVALID_COMPANY_PEOPLE_PAGE");
        await page("pa1", "", 403);
      });

      test("one row per person, with this company's projects only", async (): Promise<void> => {
        const all = await page("company", "page=1&pageSize=100");
        const w2 = all.items.filter((row) => row.profileId === workerIds.get("w2"));
        expect(w2).toHaveLength(1);
        expect(w2[0]!.projects.map((row) => row.projectId).sort()).toEqual([p1, p2]);
        expect(w2[0]!.projectCount).toBe(2);
        expect(all.total).toBe(all.items.length);
        const other = (await get("other", `/management/companies/${otherCompanyId}/people-page`)) as { items: PageItem[] };
        expect(other.items.map((row) => row.projects.map((p) => p.projectId))).toEqual([[x1]]);
        const paged = await page("company", "page=1&pageSize=2");
        expect(paged.items).toHaveLength(2);
        expect(paged.total).toBe(all.total);
      });

      test("filters by project, registration, photo and search on the server", async (): Promise<void> => {
        expect((await page("company", `projectId=${p2}`)).items.map((row) => row.profileId)).toEqual(
          expect.arrayContaining([workerIds.get("w2")]),
        );
        const verified = await page("company", "registrationStatus=VERIFIED");
        expect(verified.items.map((row) => row.profileId)).toEqual([workerIds.get("w1")]);
        expect(verified.items.every((row) => row.participantType === "WORKER")).toBe(true);
        const photos = await page("company", "faceStatus=PENDING");
        expect(photos.items.map((row) => row.profileId)).toEqual([workerIds.get("w1")]);
        const byName = await page("company", `search=${encodeURIComponent("工人w2")}`);
        expect(byName.items.map((row) => row.profileId)).toEqual([workerIds.get("w2")]);
        const managers = await page("company", "participantType=MANAGER");
        expect(managers.items.every((row) => row.participantType === "MANAGER")).toBe(true);
      });
    });

    describe("company defaults and profile", (): void => {
      const defaults = {
        name: "一天三次",
        points: [
          { code: "AM_START", graceMins: 5, kind: "START", label: "上午上班", time: "07:30" },
          { code: "AM_END", graceMins: 0, kind: "END", label: "上午下班", time: "11:30" },
          { code: "PM_START", graceMins: 5, kind: "START", label: "下午上班", time: "13:00" },
          { code: "PM_END", graceMins: 0, kind: "END", label: "下午下班", time: "17:30" },
        ],
        workdays: [1, 2, 3, 4, 5, 6],
        worktime: { lunchEnd: "13:00", lunchStart: "11:30", overtimeStart: "18:30", projectKind: "REGULAR" },
      };
      const path = `/management/companies/${companyId}/attendance-defaults`;
      const put = (user: UserKey, body: object, status: number) =>
        http().put(path).auth(auth(user), { type: "bearer" }).send(body).expect(status);

      test("only company admins save, versions guard concurrent edits, bad rules are refused", async (): Promise<void> => {
        const empty = await get("company", path);
        expect(empty).toMatchObject({ current: null, latestVersion: 0, fallback: { name: "每日两次" } });
        await put("pa1", { ...defaults, expectedVersion: 0 }, 403);
        const broken = await put("company", { ...defaults, expectedVersion: 0, workdays: [1, 1] }, 400);
        expect(broken.body).toMatchObject({ message: "INVALID_COMPANY_DEFAULTS", reason: "工作日不能重复。" });
        await put("company", { ...defaults, expectedVersion: 0, worktime: { ...defaults.worktime, lunchEnd: null } }, 400);
        const saved = (await put("company", { ...defaults, expectedVersion: 0 }, 200)).body;
        expect(saved.current).toMatchObject({ name: "一天三次", version: 1, workdays: [1, 2, 3, 4, 5, 6] });
        expect((await put("company", { ...defaults, expectedVersion: 0 }, 409)).body.message).toBe("COMPANY_DEFAULTS_VERSION_CONFLICT");
        expect(await database.auditLog.count({ where: { action: "COMPANY_DEFAULTS_SAVED" } })).toBe(1);
      });

      test("a new project starts with the company defaults unless told not to", async (): Promise<void> => {
        const fields = {
          address: "测试工地", centerLatitude: "31.2304000", centerLongitude: "121.4737000", geofenceRadiusM: 300,
          plannedEndDate: null, plannedStartDate: "2026-01-01", status: "ACTIVE", managerProfileIds: [],
        };
        const create = async (name: string, phone: string, extra: object) =>
          (await http().post(`/management/companies/${companyId}/projects`).auth(auth("company"), { type: "bearer" })
            .send({ ...fields, ...extra, name, newManagers: [{ name: `经理${phone.slice(-2)}`, phone }] }).expect(201)).body as { id: string; appliedDefaultsVersion: number | null };
        const applied = await create("套用默认的工地", "13910000881", {});
        expect(applied.appliedDefaultsVersion).toBe(1);
        const plan = await get("company", `/attendance/planning/${applied.id}/PROJECT/${applied.id}`);
        expect(plan).toMatchObject({ name: "一天三次", workdays: [1, 2, 3, 4, 5, 6] });
        expect(plan.points.map((point: { code: string }) => point.code)).toEqual(["AM_START", "AM_END", "PM_START", "PM_END"]);
        // Effective from today: the planned start is in the past.
        expect(plan.startsOn <= new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10)).toBe(true);
        const worktime = await get("company", `/worktime/projects/${applied.id}`);
        expect(worktime.current.config).toEqual(defaults.worktime);
        const plain = await create("不套用的工地", "13910000882", { applyCompanyDefaults: false });
        expect(plain.appliedDefaultsVersion).toBeNull();
        expect(await database.attendancePlan.count({ where: { projectId: plain.id } })).toBe(0);
        expect(await database.projectWorktimeRule.count({ where: { projectId: plain.id } })).toBe(0);
      });

      test("company admins change contacts and address, never the name", async (): Promise<void> => {
        const profilePath = `/management/companies/${companyId}/profile`;
        const before = await get("company", profilePath);
        await get("pa1", profilePath, 403);
        const send = (body: object, status: number) =>
          http().put(profilePath).auth(auth("company"), { type: "bearer" }).send(body).expect(status);
        expect((await send({ name: "改名", address: null, contactName: null, contactPhone: null, expectedUpdatedAt: before.updatedAt }, 400)).body.message).toBe("INVALID_COMPANY_PROFILE");
        const saved = (await send({ address: "上海市浦东新区", contactName: "王经理", contactPhone: "13910000999", expectedUpdatedAt: before.updatedAt }, 200)).body;
        expect(saved).toMatchObject({ address: "上海市浦东新区", contactName: "王经理", contactPhone: "13910000999", name: before.name });
        expect((await send({ address: null, contactName: null, contactPhone: null, expectedUpdatedAt: before.updatedAt }, 409)).body.message).toBe("COMPANY_CHANGED_RELOAD_BEFORE_SAVING");
        expect(await database.auditLog.count({ where: { action: "COMPANY_PROFILE_UPDATED", entityId: companyId } })).toBe(1);
      });
    });

    describe("company audit log and project health", (): void => {
      test("every new row knows its company; the company log shows company-level actions", async (): Promise<void> => {
        const row = await database.auditLog.create({
          data: { action: "project.update", actorUserId: users.company, entityId: p1, entityType: "project", metadata: {}, projectId: p1 },
        });
        expect(row.companyId).toBe(companyId);
        type Page = { items: { action: string; category: string | null; projectId: string | null }[]; nextCursor: string | null };
        const log = (await get("company", `/management/companies/${companyId}/audit-logs?type=COMPANY`)) as Page;
        const actions = new Set(log.items.map((item) => item.action));
        for (const action of ["project.create", "PERSONNEL_OFFBOARDED", "COMPANY_DEFAULTS_SAVED", "COMPANY_PROFILE_UPDATED"])
          expect(actions.has(action)).toBe(true);
        // 建项目 is reported under the filter that finds it.
        expect(log.items.filter((item) => item.action === "project.create").map((item) => item.category)).not.toContain("PROJECT");
        expect(log.items.find((item) => item.action === "project.create")?.category).toBe("COMPANY");
        const projectSettings = (await get("company", `/management/companies/${companyId}/audit-logs?type=PROJECT`)) as Page;
        expect(projectSettings.items.some((item) => item.action === "project.create")).toBe(false);
        expect(projectSettings.items.every((item) => item.category === "PROJECT")).toBe(true);
        const offboarded = log.items.find((item) => item.action === "PERSONNEL_OFFBOARDED")!;
        expect(offboarded.projectId).toBeNull();
        const other = (await get("other", `/management/companies/${otherCompanyId}/audit-logs`)) as Page;
        expect(other.items.some((item) => item.action === "PERSONNEL_OFFBOARDED")).toBe(false);
        const scoped = (await get("company", `/management/companies/${companyId}/audit-logs?projectId=${p1}`)) as Page;
        expect(scoped.items.every((item) => item.projectId === p1)).toBe(true);
      });

      test("reading a worker's registration leaves one record per viewer every 10 minutes", async (): Promise<void> => {
        const path = `/management/projects/${p1}/participants/${memberIds.get("w1")}/registration`;
        await get("company", path);
        await get("company", path);
        const rows = await database.auditLog.findMany({
          where: { action: "WORKER_REGISTRATION_VIEWED", entityId: workerIds.get("w1")!, actorUserId: users.company },
        });
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ projectId: p1, companyId });
        const people = (await get("company", `/management/companies/${companyId}/audit-logs?type=PEOPLE`)) as { items: { action: string; sentence: string }[] };
        expect(people.items.find((item) => item.action === "WORKER_REGISTRATION_VIEWED")?.sentence).toBe("测试company 查看了 工人w1 的用工资料");
      });

      test("project health counts backlogs per project", async (): Promise<void> => {
        const path = `/management/companies/${companyId}/project-health`;
        await get("pa1", path, 403);
        const health = (await get("company", path)) as {
          projects: { projectId: string; violationPending: number; facePending: number; registrationPending: number; lowCredit: number }[];
        };
        const of = (projectId: string) => health.projects.find((row) => row.projectId === projectId)!;
        expect(of(p2).violationPending).toBe(1);
        expect(of(p1).facePending).toBe(1);
        const pending = (await get("company", `/management/companies/${companyId}/people-page?projectId=${p1}&status=ACTIVE&registrationStatus=PENDING&participantType=WORKER`)) as { total: number };
        expect(of(p1).registrationPending).toBe(pending.total);
        expect(of(p1).lowCredit).toBe(0);
      });
    });

    describe("transfer requests move or keep the source post", (): void => {
      test("调走 exits the source membership the day before; 兼任 keeps it", async (): Promise<void> => {
        await database.user.create({
          data: { id: "ca-pa2", openid: "ca-pa2", nickname: "ca-pa2", isBound: true, phone: "13910000201", encryptedRealName: encryptPersonnelName("项目经理乙", key, randomBytes(12)) },
        });
        const role = await database.role.findUniqueOrThrow({ where: { code: "PROJECT_ADMIN" } });
        await database.userRole.create({ data: { userId: "ca-pa2", roleId: role.id, scopeType: "PROJECT", scopeId: p3 } });
        const pa2 = await tokenFor("ca-pa2");
        const worker = async (name: string, phone: string) => {
          const profile = await database.workerProfile.create({
            data: { encryptedName: encryptPersonnelName(name, key, randomBytes(12)), phone, workType: "木工", realNameStatus: "PENDING", faceProfileStatus: "PENDING", employmentStatus: "ACTIVE" },
          });
          return database.projectWorkerMember.create({
            data: { projectId: p2, workerId: profile.id, teamId: t2, enteredAt: new Date("2026-10-01T00:00:00+08:00"), projectRoleLabel: "木工", status: "ACTIVE" },
          });
        };
        const ask = async (sourceMemberId: string, mode?: string) => {
          const response = await http().post(`/management/projects/${p3}/transfer-requests`).auth(pa2, { type: "bearer" }).send({
            sourceProjectId: p2, sourceMemberId, participantType: "WORKER", projectRoleLabel: "木工", teamId: null,
            requiresAttendance: true, enteredAt: "2026-11-25T00:00:00+08:00", ...(mode === undefined ? {} : { mode }),
          });
          if (response.status !== 201) throw new Error(`${response.status} ${JSON.stringify(response.body)}`);
          return response.body as { id: string; mode: string };
        };
        const approve = (id: string) =>
          http().post(`/management/companies/${companyId}/transfer-requests/${id}/approve`).auth(auth("company"), { type: "bearer" }).send({}).expect(201);
        const moving = await worker("调走甲", "13910000301");
        const moved = await ask(moving.id);
        expect(moved.mode).toBe("MOVE");
        await approve(moved.id);
        const source = await database.projectWorkerMember.findUniqueOrThrow({ where: { id: moving.id } });
        expect(source.status).toBe("EXITED");
        expect(source.exitedAt?.toISOString()).toBe(new Date("2026-11-24T00:00:00+08:00").toISOString());
        expect(await database.projectWorkerMember.count({ where: { projectId: p3, workerId: moving.workerId, status: "ACTIVE" } })).toBe(1);
        const staying = await worker("兼任乙", "13910000302");
        const kept = await ask(staying.id, "CONCURRENT");
        await approve(kept.id);
        expect((await database.projectWorkerMember.findUniqueOrThrow({ where: { id: staying.id } })).status).toBe("ACTIVE");
        expect(await database.projectWorkerMember.count({ where: { projectId: p3, workerId: staying.workerId } })).toBe(1);
        const audit = await database.auditLog.findFirstOrThrow({ where: { action: "PERSONNEL_TRANSFER_APPROVED", entityId: moved.id } });
        expect(audit.metadata).toMatchObject({ mode: "MOVE" });
        expect(await database.auditLog.count({ where: { action: "project.member.update", entityId: moving.id, projectId: p2 } })).toBe(1);
      });
    });

    describe("project status belongs to the company", (): void => {
      test("a project admin keeps the attendance area but cannot pause or complete the project", async (): Promise<void> => {
        const pa2 = await tokenFor("ca-pa2");
        const path = `/management/projects/${p3}`;
        const current = (await http().get(path).auth(pa2, { type: "bearer" }).expect(200)).body;
        const denied = await http().put(path).auth(pa2, { type: "bearer" })
          .send({ ...current, expectedUpdatedAt: current.updatedAt, status: "SUSPENDED" }).expect(403);
        expect(denied.body.message).toBe("PROJECT_STATUS_REQUIRES_COMPANY_ADMIN");
        const moved = (await http().put(path).auth(pa2, { type: "bearer" })
          .send({ ...current, expectedUpdatedAt: current.updatedAt, geofenceRadiusM: 450 }).expect(200)).body;
        expect(moved.geofenceRadiusM).toBe(450);
        const paused = (await http().put(path).auth(auth("company"), { type: "bearer" })
          .send({ ...moved, expectedUpdatedAt: moved.updatedAt, status: "SUSPENDED" }).expect(200)).body;
        expect(paused.status).toBe("SUSPENDED");
      });
    });
  },
);
