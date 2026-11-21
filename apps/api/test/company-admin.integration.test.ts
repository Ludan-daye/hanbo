import { createHash, randomBytes } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { AppModule } from "../src/app.module.js";
import { PrismaService } from "../src/infrastructure/database/prisma.service.js";
import { encryptPersonnelName } from "../src/management/personnel-name.js";
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
          tokenHash: createHash("sha256").update(userId).digest("hex"),
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
        for (const project of overview.projects) {
          const own = await get("company", `/management/projects/${project.projectId}/overview?date=${date}`);
          expect(project.attendance).toEqual({
            expected: own.attendance.expected,
            missing: own.attendance.missing,
            present: own.attendance.present,
          });
          expect(project.todos).toEqual({
            facePending: own.todos.facePending,
            violationPending: own.todos.violationPending,
          });
        }
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
  },
);
