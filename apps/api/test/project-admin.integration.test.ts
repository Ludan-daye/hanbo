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
  temp: "pa-temp-worker",
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
            phone: `1390000099${name.slice(1)}`,
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

    describe("worker registration verification", (): void => {
      const registration = {
        idNumber: "320106199003071234",
        residentialAddress: "测试市测试路 8 号",
        emergencyContactName: "王测试",
        emergencyContactPhone: "13900002001",
        hasLongTermMedication: true,
        medicationDetails: "高血压，每天服药",
        hasPersonalInsurance: true,
        insuranceDetails: "意外险，2027 年到期",
        payrollBankCard: "6222020200112233445",
      };
      const path = () =>
        `/management/projects/${projectId}/participants/${memberIds.get("w2")}/registration`;

      test("only project admins and above in scope read it, unmasked", async (): Promise<void> => {
        const empty = (
          await http()
            .get(path())
            .auth(auth("admin"), { type: "bearer" })
            .expect(200)
        ).body;
        expect(empty).toMatchObject({
          registration: null,
          submittedAt: null,
          verification: { status: "PENDING", version: 0 },
        });
        await http()
          .put("/account/worker-registration")
          .auth(auth("w2"), { type: "bearer" })
          .send(registration)
          .expect(200);
        const read = (
          await http()
            .get(path())
            .auth(auth("admin"), { type: "bearer" })
            .expect(200)
        ).body;
        expect(read.registration).toEqual(registration);
        expect(read.displayName).toBe("工人w2");
        expect(read.verification).toMatchObject({ status: "PENDING", version: 1 });
        await http()
          .get(path())
          .auth(auth("leader"), { type: "bearer" })
          .expect(403);
        await http()
          .get(
            `/management/projects/${otherProjectId}/participants/${memberIds.get("w3")}/registration`,
          )
          .auth(auth("admin"), { type: "bearer" })
          .expect(403);
        // A member of another project is not reachable through this project.
        await http()
          .get(
            `/management/projects/${projectId}/participants/${memberIds.get("w3")}/registration`,
          )
          .auth(auth("admin"), { type: "bearer" })
          .expect(404);
        await http()
          .get(path())
          .auth(auth("company"), { type: "bearer" })
          .expect(200);
      });

      test("marks 已核实 or 需更正 with a version check and an audit row; resubmission resets it", async (): Promise<void> => {
        const verify = (user: UserKey, body: object) =>
          http()
            .post(`${path()}/verification`)
            .auth(auth(user), { type: "bearer" })
            .send(body);
        const before = await database.workerProfile.findUniqueOrThrow({
          where: { id: workerIds.get("w2")! },
        });
        expect(
          (await verify("admin", { status: "VERIFIED", expectedVersion: 1, note: "x" }).expect(400))
            .body.message,
        ).toBe("INVALID_REGISTRATION_VERIFICATION_REQUEST");
        await verify("leader", { status: "VERIFIED", expectedVersion: 1 }).expect(403);
        const verified = (
          await verify("admin", { status: "VERIFIED", expectedVersion: 1 }).expect(201)
        ).body;
        expect(verified.verification).toMatchObject({
          status: "VERIFIED",
          verifiedByName: "测试admin",
          version: 2,
        });
        expect(
          (await verify("admin", { status: "NEEDS_UPDATE", expectedVersion: 1 }).expect(409))
            .body.message,
        ).toBe("REGISTRATION_CHANGED_RELOAD_BEFORE_SAVING");
        const after = await database.workerProfile.findUniqueOrThrow({
          where: { id: workerIds.get("w2")! },
        });
        expect(after.realNameStatus).toBe("VERIFIED");
        // Marking is not a profile edit: open person forms keep their version.
        expect(after.updatedAt.toISOString()).toBe(before.updatedAt.toISOString());
        const audit = await database.auditLog.findFirstOrThrow({
          where: { action: "WORKER_REGISTRATION_VERIFIED", entityId: after.id },
        });
        expect(audit).toMatchObject({ actorUserId: users.admin, projectId });
        expect(audit.metadata).toMatchObject({ previousStatus: "PENDING", status: "VERIFIED" });
        await verify("admin", { status: "NEEDS_UPDATE", expectedVersion: 2 }).expect(201);
        await http()
          .put("/account/worker-registration")
          .auth(auth("w2"), { type: "bearer" })
          .send({ ...registration, residentialAddress: "测试市新路 9 号" })
          .expect(200);
        const reset = (
          await http().get(path()).auth(auth("admin"), { type: "bearer" }).expect(200)
        ).body;
        expect(reset.verification).toMatchObject({
          status: "PENDING",
          verifiedAt: null,
          verifiedByName: null,
          version: 4,
        });
        // Nobody marks their own registration.
        await database.userRole.create({
          data: {
            userId: users.w1,
            roleId: (await database.role.findUniqueOrThrow({ where: { code: "PROJECT_ADMIN" } })).id,
            scopeType: "PROJECT",
            scopeId: projectId,
          },
        });
        await database.workerProfile.update({
          where: { id: workerIds.get("w1")! },
          data: { registrationCompletedAt: new Date() },
        });
        expect(
          (
            await http()
              .post(
                `/management/projects/${projectId}/participants/${memberIds.get("w1")}/registration/verification`,
              )
              .auth(auth("w1"), { type: "bearer" })
              .send({ status: "VERIFIED", expectedVersion: 0 })
              .expect(403)
          ).body.message,
        ).toBe("REGISTRATION_SELF_VERIFY_FORBIDDEN");
      });
    });

    test("project admins act on any team of their project, not other projects", async (): Promise<void> => {
      const date = chinaDate(new Date());
      for (const path of [
        `/team-work/teams/${teamId}/tasks?date=${date}`,
        `/team-work/teams/${teamId}/daily?date=${date}`,
        `/safety-credit/teams/${teamId}`,
        `/reports/teams/${teamId}/daily?date=${date}`,
      ])
        await http().get(path).auth(auth("admin"), { type: "bearer" }).expect(200);
      await http()
        .get(`/team-work/teams/${otherTeamId}/tasks?date=${date}`)
        .auth(auth("admin"), { type: "bearer" })
        .expect(403);
    });

    test("a project admin asks for a person of another project; a company admin approves or rejects", async (): Promise<void> => {
      const base = `/management/projects/${projectId}`;
      const sources = (
        await http().get(`${base}/transfer-sources`).auth(auth("admin"), { type: "bearer" }).expect(200)
      ).body as { id: string }[];
      expect(sources.map((row) => row.id)).toEqual([otherProjectId]);
      const candidates = (
        await http()
          .get(`${base}/transfer-candidates?sourceProjectId=${otherProjectId}&page=1&pageSize=20&search=`)
          .auth(auth("admin"), { type: "bearer" })
          .expect(200)
      ).body as { items: { memberId: string; phone: string }[] };
      const w3 = candidates.items.find((row) => row.memberId === memberIds.get("w3"));
      expect(w3?.phone).toBe("139****0993");
      const ask = (memberId: string) =>
        http()
          .post(`${base}/transfer-requests`)
          .auth(auth("admin"), { type: "bearer" })
          .send({
            sourceProjectId: otherProjectId,
            sourceMemberId: memberId,
            participantType: "WORKER",
            projectRoleLabel: "钢筋工",
            teamId,
            requiresAttendance: true,
            enteredAt: "2026-11-20T00:00:00+08:00",
          });
      const asked = (await ask(memberIds.get("w3")!).expect(201)).body as { id: string; status: string; displayName: string };
      expect(asked).toMatchObject({ status: "PENDING", displayName: "工人w3" });
      expect((await ask(memberIds.get("w3")!).expect(409)).body.message).toBe("TRANSFER_REQUEST_ALREADY_PENDING");
      const companyPath = `/management/companies/${companyId}/transfer-requests`;
      await http().get(companyPath).auth(auth("admin"), { type: "bearer" }).expect(403);
      const pending = (
        await http().get(companyPath).auth(auth("company"), { type: "bearer" }).expect(200)
      ).body as { id: string }[];
      expect(pending.map((row) => row.id)).toContain(asked.id);
      await http()
        .post(`${companyPath}/${asked.id}/approve`)
        .auth(auth("admin"), { type: "bearer" })
        .send({})
        .expect(403);
      const approved = (
        await http()
          .post(`${companyPath}/${asked.id}/approve`)
          .auth(auth("company"), { type: "bearer" })
          .send({})
          .expect(201)
      ).body as { status: string; createdMemberId: string };
      expect(approved.status).toBe("APPROVED");
      expect(
        await database.projectWorkerMember.findUniqueOrThrow({ where: { id: approved.createdMemberId } }),
      ).toMatchObject({ projectId, workerId: workerIds.get("w3"), teamId });
      await http()
        .post(`${companyPath}/${asked.id}/reject`)
        .auth(auth("company"), { type: "bearer" })
        .send({})
        .expect(409);
      // Rejecting another request leaves the person where they are.
      const worker = await database.workerProfile.create({
        data: {
          encryptedName: encryptPersonnelName("工人w4", key, randomBytes(12)),
          phone: "13900000444",
          workType: "木工",
          realNameStatus: "PENDING",
          faceProfileStatus: "PENDING",
          employmentStatus: "ACTIVE",
        },
      });
      const member = await database.projectWorkerMember.create({
        data: {
          projectId: otherProjectId,
          workerId: worker.id,
          teamId: otherTeamId,
          enteredAt: new Date("2026-10-01T00:00:00+08:00"),
          projectRoleLabel: "木工",
          status: "ACTIVE",
        },
      });
      const second = (await ask(member.id).expect(201)).body as { id: string };
      const rejected = (
        await http()
          .post(`${companyPath}/${second.id}/reject`)
          .auth(auth("company"), { type: "bearer" })
          .send({ reason: "那边还要用" })
          .expect(201)
      ).body;
      expect(rejected).toMatchObject({ status: "REJECTED", reviewReason: "那边还要用" });
      expect(await database.projectWorkerMember.count({ where: { projectId, workerId: worker.id } })).toBe(0);
      const actions = (
        await database.auditLog.findMany({ where: { entityType: "personnel_transfer_request" } })
      ).map((row) => row.action);
      expect(actions).toEqual(
        expect.arrayContaining([
          "PERSONNEL_TRANSFER_REQUESTED",
          "PERSONNEL_TRANSFER_APPROVED",
          "PERSONNEL_TRANSFER_REJECTED",
        ]),
      );
      // A project admin who manages both projects reuses directly instead of asking.
      expect(
        (await http().get(`${base}/transfer-sources`).auth(auth("company"), { type: "bearer" }).expect(200)).body,
      ).toEqual([]);
    });
    test("a temporary worker who forgot to start is reminded and applies for a start makeup", async (): Promise<void> => {
      const worker = await database.workerProfile.create({
        data: {
          userId: users.temp,
          encryptedName: encryptPersonnelName("临时工甲", key, randomBytes(12)),
          phone: "13900000555",
          registrationCompletedAt: new Date(),
          workType: "普工",
          realNameStatus: "PENDING",
          faceProfileStatus: "PENDING",
          employmentStatus: "ACTIVE",
        },
      });
      const member = await database.projectWorkerMember.create({
        data: {
          projectId,
          workerId: worker.id,
          teamId,
          enteredAt: new Date("2026-10-01T00:00:00+08:00"),
          projectRoleLabel: "WORKER",
          status: "ACTIVE",
          taskAttendanceOnly: true,
        },
      });
      const now = Date.now();
      const task = await database.teamWorkTask.create({
        data: {
          teamId,
          title: "清理楼面",
          description: "",
          workType: "普工",
          startsAt: new Date(now - 90 * 60000),
          endsAt: new Date(now + 60 * 60000),
          createdByUserId: users.leader,
          assignments: { create: [{ memberId: member.id, source: "ASSIGNED" }] },
        },
      });
      const later = await database.teamWorkTask.create({
        data: {
          teamId,
          title: "明天的活",
          description: "",
          workType: "普工",
          startsAt: new Date(now + 3600000),
          endsAt: new Date(now + 7200000),
          createdByUserId: users.leader,
          assignments: { create: [{ memberId: member.id, source: "ASSIGNED" }] },
        },
      });
      const remind = (taskId: string, user: UserKey) =>
        http()
          .post(`/team-work/teams/${teamId}/tasks/${taskId}/members/${member.id}/start-reminder`)
          .auth(auth(user), { type: "bearer" });
      expect((await remind(later.id, "admin").expect(400)).body.message).toBe("TASK_START_REMINDER_TOO_EARLY");
      await remind(task.id, "temp").expect(403);
      const reminded = (await remind(task.id, "admin").expect(201)).body as {
        assignments: { memberId: string; startReminderAt: string | null; startedAt: string | null }[];
      };
      expect(reminded.assignments[0]).toMatchObject({ memberId: member.id, startedAt: null });
      expect(reminded.assignments[0]!.startReminderAt).not.toBeNull();
      expect(
        await database.auditLog.count({ where: { action: "TEAM_TASK_START_MAKEUP_REMINDED", projectId, entityId: task.id } }),
      ).toBe(1);
      // The worker sees the reminder on 我的任务; no hours were created.
      const mine = (
        await http().get(`/team-work/me/tasks?date=${chinaDate(new Date())}`).auth(auth("temp"), { type: "bearer" }).expect(200)
      ).body as { id: string; assignments: { startReminderAt: string | null; startedAt: string | null }[] }[];
      expect(mine.find((row) => row.id === task.id)?.assignments[0]).toMatchObject({ startedAt: null });
      expect(mine.find((row) => row.id === task.id)?.assignments[0]?.startReminderAt).not.toBeNull();

      const at = (offsetMinutes: number) => new Date(now + offsetMinutes * 60000);
      const ask = (code: string, occurredAt: Date) =>
        http()
          .post(`/makeups/projects/${projectId}/requests`)
          .auth(auth("temp"), { type: "bearer" })
          .send({
            attendanceDate: chinaDate(occurredAt),
            pointCode: code,
            reason: "忘了开工打卡",
            requestedOccurredAt: occurredAt.toISOString(),
          });
      const start = `TASK_${task.id}_START`;
      expect((await ask(start, at(-120)).expect(400)).body.message).toBe("TASK_START_MAKEUP_OUTSIDE_TASK_TIME");
      expect((await ask(start, at(5)).expect(400)).body.message).toBeDefined();
      await ask(`TASK_${task.id}_END`, at(-10)).expect(400);
      const requested = (await ask(start, at(-60)).expect(201)).body as { id: string; pointLabel: string };
      expect(requested.pointLabel).toContain("任务开工");
      await ask(start, at(-50)).expect(409);
      await http()
        .post(`/makeups/requests/${requested.id}/approve`)
        .auth(auth("temp"), { type: "bearer" })
        .send({ approvalReason: "自己批" })
        .expect(403);
      await http()
        .post(`/makeups/requests/${requested.id}/approve`)
        .auth(auth("leader"), { type: "bearer" })
        .send({ approvalReason: "核实属实" })
        .expect(201);
      const assignment = await database.teamTaskAssignment.findUniqueOrThrow({
        where: { taskId_memberId: { taskId: task.id, memberId: member.id } },
      });
      expect(assignment.startedAt?.toISOString()).toBe(at(-60).toISOString());
      expect(assignment.finishedAt).toBeNull();
      expect(
        await database.auditLog.count({ where: { action: "MAKEUP_APPROVED", entityId: requested.id, projectId } }),
      ).toBe(1);
      expect((await ask(start, at(-40)).expect(409)).body.message).toBe("TASK_START_MAKEUP_ALREADY_STARTED");
      expect((await remind(task.id, "admin").expect(409)).body.message).toBe("TASK_START_REMINDER_NOT_APPLICABLE");
      // The existing finish makeup now works on top of the approved start.
      const finish = (await ask(`TASK_${task.id}_END`, at(-10)).expect(201)).body as { pointLabel: string };
      expect(finish.pointLabel).toContain("任务完工");
    });
    test("project and company reports filter by team or by the team's current leader", async (): Promise<void> => {
      const date = chinaDate(new Date());
      const spare = await database.team.create({
        data: { projectId, name: "空班组", status: "ACTIVE" },
      });
      await database.team.update({
        where: { id: teamId },
        data: { leaderWorkerMemberId: memberIds.get("w1")! },
      });
      try {
        const daily = async (query: string, user: UserKey = "admin", expected = 200) =>
          (
            await http()
              .get(`/reports/projects/${projectId}/daily?date=${date}${query}`)
              .auth(auth(user), { type: "bearer" })
              .expect(expected)
          ).body as DailyAttendanceReportResponse & { message?: string };
        const all = await daily("");
        const byTeam = await daily(`&teamId=${teamId}`);
        expect(byTeam.participants.length).toBeGreaterThan(0);
        expect(byTeam.participants.every((row) => row.teamId === teamId)).toBe(true);
        expect(byTeam.participants[0]!.teamLeaderName).toBe("工人w1");
        expect(all.participants.length).toBeGreaterThanOrEqual(byTeam.participants.length);
        const byLeader = await daily(`&leaderMemberId=${memberIds.get("w1")}`);
        expect(byLeader.participants.map((row) => row.memberId).sort()).toEqual(
          byTeam.participants.map((row) => row.memberId).sort(),
        );
        expect((await daily(`&teamId=${spare.id}`)).participants).toEqual([]);
        // w2 leads no team: the filter is valid and keeps nobody.
        expect((await daily(`&leaderMemberId=${memberIds.get("w2")}`)).participants).toEqual([]);
        expect((await daily(`&teamId=${otherTeamId}`, "admin", 400)).message).toBe("REPORT_TEAM_OUT_OF_SCOPE");
        expect((await daily(`&leaderMemberId=${memberIds.get("w3")}`, "admin", 400)).message).toBe(
          "REPORT_LEADER_OUT_OF_SCOPE",
        );
        expect((await daily(`&teamId=${teamId}&leaderMemberId=${memberIds.get("w1")}`, "admin", 400)).message).toBe(
          "INVALID_REPORT_TEAM_FILTER",
        );
        const month = date.slice(0, 7);
        const monthly = (
          await http()
            .get(`/reports/projects/${projectId}/monthly?month=${month}&teamId=${teamId}`)
            .auth(auth("admin"), { type: "bearer" })
            .expect(200)
        ).body as DailyAttendanceReportResponse;
        expect(monthly.participants.every((row) => row.teamId === teamId)).toBe(true);
        const options = (
          await http().get(`/reports/projects/${projectId}/team-options`).auth(auth("admin"), { type: "bearer" }).expect(200)
        ).body as { teamId: string; leaderMemberId: string | null; leaderName: string | null }[];
        expect(options.find((row) => row.teamId === teamId)).toMatchObject({
          leaderMemberId: memberIds.get("w1"),
          leaderName: "工人w1",
        });
        expect(options.map((row) => row.teamId)).not.toContain(otherTeamId);
        await http().get(`/reports/projects/${projectId}/team-options`).auth(auth("leader"), { type: "bearer" }).expect(403);
        const company = (
          await http()
            .get(`/reports/companies/${companyId}/weekly?weekStartDate=${date}&teamId=${otherTeamId}`)
            .auth(auth("company"), { type: "bearer" })
            .expect(200)
        ).body as DailyAttendanceReportResponse;
        expect(company.participants.every((row) => row.teamId === otherTeamId)).toBe(true);
        const companyOptions = (
          await http().get(`/reports/companies/${companyId}/team-options`).auth(auth("company"), { type: "bearer" }).expect(200)
        ).body as { teamId: string }[];
        expect(companyOptions.map((row) => row.teamId)).toEqual(expect.arrayContaining([teamId, otherTeamId]));
      } finally {
        await database.team.update({ where: { id: teamId }, data: { leaderWorkerMemberId: null } });
      }
    });
  },
);
