import { createHash, randomBytes } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { defaultWorktimeRule } from "@construction/domain";

import { chinaDate } from "../src/attendance/attendance-plans.js";
import { AppModule } from "../src/app.module.js";
import { PrismaService } from "../src/infrastructure/database/prisma.service.js";
import { encryptPersonnelName } from "../src/management/personnel-name.js";
import type { ProjectOverviewResponse } from "../src/overview/project-overview.types.js";
import type { DailyAttendanceReportResponse } from "../src/reports/reports.types.js";

// Project-admin features against a real database: overview counts equal the lists
// they open, peer-level role guard, worker registration verification, audit rows.

const key = "ab".repeat(32);
const companyId = "pa-company";
const projectId = "pa-project";
const otherProjectId = "pa-other-project";
const teamId = "pa-team";
const otherTeamId = "pa-other-team";
const users = {
  admin: "pa-admin",
  company: "pa-company-admin",
  leader: "pa-leader",
  w1: "pa-worker-1",
  w2: "pa-worker-2",
  w3: "pa-worker-3",
} as const;
type UserKey = keyof typeof users;

describe.skipIf(process.env.DATABASE_FOUNDATION_TEST_URL === undefined)(
  "project admin features over real HTTP",
  (): void => {
    let app: INestApplication;
    let database: PrismaService;
    const tokens = new Map<UserKey, string>();
    const workerIds = new Map<UserKey, string>();
    const memberIds = new Map<UserKey, string>();

    const auth = (user: UserKey): string => tokens.get(user)!;
    const http = () => request(app.getHttpServer());

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

      await database.company.create({
        data: { id: companyId, name: "PA company", status: "ACTIVE" },
      });
      for (const id of [projectId, otherProjectId])
        await database.project.create({
          data: {
            id,
            companyId,
            name: id,
            address: "Test site",
            centerLatitude: "31",
            centerLongitude: "121",
            geofenceRadiusM: 300,
            status: "ACTIVE",
            plannedStartDate: new Date("2026-01-01"),
          },
        });
      await database.team.create({
        data: { id: teamId, projectId, name: "钢筋一班", status: "ACTIVE" },
      });
      await database.team.create({
        data: {
          id: otherTeamId,
          projectId: otherProjectId,
          name: "木工一班",
          status: "ACTIVE",
        },
      });
      let phone = 13900000100;
      for (const [name, id] of Object.entries(users)) {
        phone += 1;
        await database.user.create({
          data: {
            id,
            openid: id,
            nickname: id,
            isBound: true,
            phone: String(phone),
            encryptedRealName: encryptPersonnelName(
              `测试${name}`,
              key,
              randomBytes(12),
            ),
          },
        });
      }
      for (const name of ["w1", "w2", "w3"] as const) {
        const worker = await database.workerProfile.create({
          data: {
            userId: users[name],
            encryptedName: encryptPersonnelName(
              `工人${name}`,
              key,
              randomBytes(12),
            ),
            phone: "13900000999",
            workType: "钢筋工",
            realNameStatus: "PENDING",
            faceProfileStatus: "PENDING",
            employmentStatus: "ACTIVE",
          },
        });
        const member = await database.projectWorkerMember.create({
          data: {
            projectId: name === "w3" ? otherProjectId : projectId,
            workerId: worker.id,
            teamId: name === "w3" ? otherTeamId : teamId,
            enteredAt: new Date("2026-10-01T00:00:00+08:00"),
            projectRoleLabel: "钢筋工",
            status: "ACTIVE",
          },
        });
        workerIds.set(name, worker.id);
        memberIds.set(name, member.id);
      }
      const roles = await database.role.findMany();
      const roleId = (code: string): string =>
        roles.find((role) => role.code === code)!.id;
      await database.userRole.createMany({
        data: [
          {
            userId: users.admin,
            roleId: roleId("PROJECT_ADMIN"),
            scopeType: "PROJECT",
            scopeId: projectId,
          },
          {
            userId: users.company,
            roleId: roleId("COMPANY_ADMIN"),
            scopeType: "COMPANY",
            scopeId: companyId,
          },
          {
            userId: users.leader,
            roleId: roleId("TEAM_LEADER"),
            scopeType: "TEAM",
            scopeId: teamId,
          },
        ],
      });
      for (const name of Object.keys(users) as UserKey[])
        tokens.set(name, await tokenFor(users[name]));
    });
    afterAll(async (): Promise<void> => {
      if (app !== undefined) await app.close();
    });

    describe("project overview", (): void => {
      beforeAll(async (): Promise<void> => {
        const makeup = (name: "w1" | "w3") =>
          database.makeupRequest.create({
            data: {
              projectId: name === "w3" ? otherProjectId : projectId,
              requesterUserId: users[name],
              participantType: "WORKER",
              participantId: workerIds.get(name)!,
              attendanceDate: new Date("2026-11-18"),
              pointCode: "SEGMENT_1_START",
              requestedOccurredAt: new Date("2026-11-18T08:00:00+08:00"),
              reason: "手机没电",
              status: "PENDING",
            },
          });
        await makeup("w1");
        await makeup("w3");
        const violation = (
          name: "w1" | "w2" | "w3",
          status: string,
          index: number,
        ) =>
          database.safetyViolation.create({
            data: {
              workerId: workerIds.get(name)!,
              projectId: name === "w3" ? otherProjectId : projectId,
              teamId: name === "w3" ? otherTeamId : teamId,
              memberId: memberIds.get(name)!,
              eventKey: `pa-violation-${index}`,
              category: "未戴安全帽",
              severity: "GENERAL",
              occurredAt: new Date("2026-11-18T09:00:00+08:00"),
              description: "测试",
              points: 2,
              policyVersion: 1,
              status,
              createdByUserId: users.leader,
            },
          });
        await violation("w1", "PENDING", 1);
        const confirmed = await violation("w2", "CONFIRMED", 2);
        await database.safetyCreditDecision.create({
          data: {
            violationId: confirmed.id,
            action: "CONFIRM",
            reason: "属实",
            actorUserId: users.admin,
          },
        });
        await database.safetyCreditAppeal.create({
          data: {
            violationId: confirmed.id,
            workerId: workerIds.get("w2")!,
            reason: "我戴了",
          },
        });
        await violation("w3", "PENDING", 3);
        const face = (name: "w1" | "w2" | "w3", status: string) =>
          database.faceProfile.create({
            data: {
              ownerType: "WORKER",
              ownerId: workerIds.get(name)!,
              baselineObjectKey: `faces/${name}.jpg`,
              baselineImageHash: name,
              status,
              submittedByUserId: users[name],
            },
          });
        await face("w1", "PENDING");
        await face("w2", "APPROVED");
        await face("w3", "PENDING");
      });

      test("is for project admins and above in scope only", async (): Promise<void> => {
        await http()
          .get(`/management/projects/${projectId}/overview`)
          .auth(auth("leader"), { type: "bearer" })
          .expect(403);
        await http()
          .get(`/management/projects/${otherProjectId}/overview`)
          .auth(auth("admin"), { type: "bearer" })
          .expect(403);
        const invalid = await http()
          .get(`/management/projects/${projectId}/overview?date=2026-02-30`)
          .auth(auth("admin"), { type: "bearer" })
          .expect(400);
        expect(invalid.body.message).toBe("INVALID_OVERVIEW_QUERY");
        await http()
          .get(`/management/projects/${otherProjectId}/overview`)
          .auth(auth("company"), { type: "bearer" })
          .expect(200);
      });

      test("every number equals the rows of the list it opens", async (): Promise<void> => {
        const date = "2026-11-18";
        const overview: ProjectOverviewResponse = (
          await http()
            .get(`/management/projects/${projectId}/overview?date=${date}`)
            .auth(auth("admin"), { type: "bearer" })
            .expect(200)
        ).body;
        const daily: DailyAttendanceReportResponse = (
          await http()
            .get(`/reports/projects/${projectId}/daily?date=${date}`)
            .auth(auth("admin"), { type: "bearer" })
            .expect(200)
        ).body;
        expect(overview.attendance).toEqual({
          expected: daily.totals.scheduledDays,
          missing: daily.totals.missingPunchCount,
          present: daily.totals.actualAttendedDays,
          workedMinutes: daily.totals.workedMinutes,
        });
        const inbox = (
          await http()
            .get(`/makeups/pending?projectId=${projectId}`)
            .auth(auth("admin"), { type: "bearer" })
            .expect(200)
        ).body as { items: { projectId: string }[] };
        expect(inbox.items.map((item) => item.projectId)).toEqual([projectId]);
        const board = (
          await http()
            .get(`/safety-credit/projects/${projectId}`)
            .auth(auth("admin"), { type: "bearer" })
            .expect(200)
        ).body as {
          violations: { status: string; appeals: { status: string }[] }[];
        };
        const faces = (
          await http()
            .get(`/face-profiles/projects/${projectId}`)
            .auth(auth("admin"), { type: "bearer" })
            .expect(200)
        ).body as { status: string }[];
        expect(overview.todos).toEqual({
          appealPending: board.violations.filter((row) =>
            row.appeals.some((appeal) => appeal.status === "PENDING"),
          ).length,
          facePending: faces.filter((row) => row.status === "PENDING").length,
          makeupPending: inbox.items.length,
          violationPending: board.violations.filter(
            (row) => row.status === "PENDING",
          ).length,
        });
        expect(overview.todos).toEqual({
          appealPending: 1,
          facePending: 1,
          makeupPending: 1,
          violationPending: 1,
        });
      });

      test("the makeup inbox filters by project on the server", async (): Promise<void> => {
        const all = (
          await http()
            .get("/makeups/pending")
            .auth(auth("company"), { type: "bearer" })
            .expect(200)
        ).body as { items: { projectId: string }[] };
        expect(all.items.map((item) => item.projectId).sort()).toEqual(
          [otherProjectId, projectId].sort(),
        );
        const one = (
          await http()
            .get(`/makeups/pending?projectId=${otherProjectId}`)
            .auth(auth("company"), { type: "bearer" })
            .expect(200)
        ).body as { items: { projectId: string }[] };
        expect(one.items.map((item) => item.projectId)).toEqual([
          otherProjectId,
        ]);
        // A project outside the admin's scope gives an empty list, not 403.
        const outside = (
          await http()
            .get(`/makeups/pending?projectId=${otherProjectId}`)
            .auth(auth("admin"), { type: "bearer" })
            .expect(200)
        ).body as { items: unknown[] };
        expect(outside.items).toEqual([]);
      });
    });

    describe("peer-level role guard and audit", (): void => {
      const person = (phone: string, role: string) => ({
        displayName: "测试管理员",
        phone,
        participantType: role === "PROJECT_ADMIN" ? "MANAGER" : "WORKER",
        projectRoleLabel: role,
        workType: "管理",
        teamId: role === "TEAM_LEADER" ? teamId : null,
        requiresAttendance: true,
        status: "ACTIVE",
        enteredAt: "2026-10-01T00:00:00+08:00",
        exitedAt: null,
        expectedUpdatedAt: null,
        expectedProfileUpdatedAt: null,
      });
      const participants = `/management/projects/${projectId}/participants`;

      test("a project admin cannot appoint, change or remove another project admin", async (): Promise<void> => {
        const denied = await http()
          .post(participants)
          .auth(auth("admin"), { type: "bearer" })
          .send(person("13900001001", "PROJECT_ADMIN"))
          .expect(403);
        expect(denied.body).toMatchObject({
          message: "MANAGEMENT_ASSIGNMENT_REQUIRES_HIGHER_ROLE",
          roleCode: "PROJECT_ADMIN",
        });
        await http()
          .post(participants)
          .auth(auth("admin"), { type: "bearer" })
          .send(person("13900001002", "TEAM_LEADER"))
          .expect(201);
        const peer = (
          await http()
            .post(participants)
            .auth(auth("company"), { type: "bearer" })
            .send(person("13900001003", "PROJECT_ADMIN"))
            .expect(201)
        ).body as {
          memberId: string;
          updatedAt: string;
          profileUpdatedAt: string;
        };
        const edit = {
          ...person("13900001003", "PROJECT_ADMIN"),
          expectedUpdatedAt: peer.updatedAt,
          expectedProfileUpdatedAt: peer.profileUpdatedAt,
        };
        for (const change of [
          { projectRoleLabel: "TEAM_LEADER", teamId },
          { status: "EXITED", exitedAt: new Date().toISOString() },
        ])
          expect(
            (
              await http()
                .put(`${participants}/${peer.memberId}`)
                .auth(auth("admin"), { type: "bearer" })
                .send({ ...edit, ...change })
                .expect(403)
            ).body.message,
          ).toBe("MANAGEMENT_ASSIGNMENT_REQUIRES_HIGHER_ROLE");
        // Editing contact details without touching the role stays allowed.
        await http()
          .put(`${participants}/${peer.memberId}`)
          .auth(auth("admin"), { type: "bearer" })
          .send({ ...edit, workType: "安全员" })
          .expect(200);
        const current = (
          await http()
            .get(`${participants}/${peer.memberId}`)
            .auth(auth("company"), { type: "bearer" })
            .expect(200)
        ).body as { updatedAt: string; profileUpdatedAt: string };
        await http()
          .put(`${participants}/${peer.memberId}`)
          .auth(auth("company"), { type: "bearer" })
          .send({
            ...edit,
            workType: "安全员",
            expectedUpdatedAt: current.updatedAt,
            expectedProfileUpdatedAt: current.profileUpdatedAt,
            status: "EXITED",
            exitedAt: new Date().toISOString(),
          })
          .expect(200);
      });

      test("review actions write project audit rows", async (): Promise<void> => {
        const makeup = await database.makeupRequest.findFirstOrThrow({
          where: { projectId, status: "PENDING" },
        });
        await http()
          .post(`/makeups/requests/${makeup.id}/reject`)
          .auth(auth("admin"), { type: "bearer" })
          .send({ approvalReason: "没有现场记录" })
          .expect(201);
        const face = await database.faceProfile.findFirstOrThrow({
          where: { ownerId: workerIds.get("w1")!, status: "PENDING" },
        });
        await http()
          .post(`/face-profiles/projects/${projectId}/${face.id}/review`)
          .auth(auth("admin"), { type: "bearer" })
          .send({ decision: "APPROVED", reason: "清晰" })
          .expect(201);
        const violation = await database.safetyViolation.findFirstOrThrow({
          where: { projectId, status: "PENDING" },
        });
        await http()
          .post(
            `/safety-credit/projects/${projectId}/violations/${violation.id}/review`,
          )
          .auth(auth("admin"), { type: "bearer" })
          .send({ action: "CONFIRM", reason: "属实" })
          .expect(201);
        const appealed = await database.safetyCreditAppeal.findFirstOrThrow({
          where: { status: "PENDING", violation: { projectId } },
        });
        await http()
          .post(
            `/safety-credit/projects/${projectId}/violations/${appealed.violationId}/appeals/${appealed.id}/review`,
          )
          .auth(auth("admin"), { type: "bearer" })
          .send({ accept: false, reason: "照片清楚" })
          .expect(201);
        const tomorrow = chinaDate(new Date(Date.now() + 86_400_000));
        await http()
          .put(`/worktime/projects/${projectId}`)
          .auth(auth("admin"), { type: "bearer" })
          .send({
            expectedVersion: 0,
            startsOn: tomorrow,
            config: defaultWorktimeRule,
          })
          .expect(200);
        const rows = await database.auditLog.findMany({
          where: { projectId, actorUserId: users.admin },
          orderBy: { createdAt: "asc" },
        });
        expect(rows.map((row) => row.action)).toEqual(
          expect.arrayContaining([
            "MAKEUP_REJECTED",
            "FACE_PROFILE_REVIEWED",
            "SAFETY_VIOLATION_REVIEWED",
            "SAFETY_APPEAL_REVIEWED",
            "WORKTIME_RULE_SAVED",
          ]),
        );
        expect(
          rows.find((row) => row.action === "MAKEUP_REJECTED"),
        ).toMatchObject({ entityId: makeup.id, entityType: "makeup_request" });
      });
    });
  },
);
