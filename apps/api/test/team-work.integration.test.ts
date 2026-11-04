import { createHash, createHmac, randomBytes } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { AppModule } from "../src/app.module.js";
import { PrismaService } from "../src/infrastructure/database/prisma.service.js";
import { encryptPersonnelName } from "../src/management/personnel-name.js";

const key: string = "ab".repeat(32);
const teamId: string = "team-work-team";
const otherTeamId: string = "team-work-other";
const projectId: string = "team-work-project";
const date: string = new Date(Date.now() + 8 * 3600000)
  .toISOString()
  .slice(0, 10);
const taskBody = {
  title: "维修测试任务",
  description: "检查并更换灯具",
  workType: "电工",
  startsAt: new Date(Date.now() + 60000).toISOString(),
  endsAt: new Date(Date.now() + 3 * 3600000).toISOString(),
  memberIds: [],
};
const path: string = `/team-work/teams/${teamId}`;

describe.skipIf(process.env.DATABASE_FOUNDATION_TEST_URL === undefined)(
  "team work real HTTP and database",
  () => {
    let app: INestApplication;
    let db: PrismaService;
    let leaderToken: string;
    let workerToken: string;
    let strangerToken: string;
    let taskId: string;
    let memberId: string;

    const makeUser = async (
      id: string,
      name: string,
      phone: string,
      bound: boolean,
    ): Promise<string> => {
      await db.user.create({
        data: {
          id,
          openid: id,
          nickname: name,
          phone,
          isBound: bound,
          encryptedRealName: encryptPersonnelName(name, key, randomBytes(12)),
          avatarObjectKey: "test/avatar.png",
        },
      });
      const session = await db.userSession.create({
        data: {
          userId: id,
          tokenHash: createHash("sha256").update(id).digest("hex"),
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
      return app
        .get(JwtService)
        .signAsync(
          { sub: id, sid: session.id, sv: 1 },
          { secret: process.env.JWT_ACCESS_TOKEN_SECRET!, expiresIn: 3600 },
        );
    };
    beforeAll(async () => {
      const url: string | undefined = process.env.DATABASE_FOUNDATION_TEST_URL;
      if (
        !url ||
        !new URL(url).searchParams
          .get("schema")
          ?.startsWith("database_foundation_")
      )
        throw new Error("Use isolated database integration schema.");
      vi.stubEnv("DATABASE_URL", url);
      vi.stubEnv("PERSONNEL_ENCRYPTION_KEY", key);
      app = (
        await Test.createTestingModule({ imports: [AppModule] }).compile()
      ).createNestApplication();
      await app.init();
      db = app.get(PrismaService);
      await db.company.create({
        data: { id: "team-work-company", name: "测试公司", status: "ACTIVE" },
      });
      await db.project.create({
        data: {
          id: projectId,
          companyId: "team-work-company",
          name: "测试项目",
          address: "测试工地",
          centerLatitude: 31,
          centerLongitude: 121,
          geofenceRadiusM: 200,
          status: "ACTIVE",
          plannedStartDate: new Date("2026-01-01"),
        },
      });
      for (const id of [teamId, otherTeamId])
        await db.team.create({
          data: { id, projectId, name: id, status: "ACTIVE" },
        });
      leaderToken = await makeUser(
        "team-work-leader",
        "测试班长",
        "13800000701",
        true,
      );
      workerToken = await makeUser(
        "team-work-worker",
        "临工测试",
        "13800000702",
        false,
      );
      strangerToken = await makeUser(
        "team-work-stranger",
        "其他人员",
        "13800000703",
        true,
      );
      const leaderRole = await db.role.findUniqueOrThrow({
        where: { code: "TEAM_LEADER" },
      });
      await db.userRole.create({
        data: {
          userId: "team-work-leader",
          roleId: leaderRole.id,
          scopeType: "TEAM",
          scopeId: teamId,
        },
      });
    });
    afterAll(async () => {
      if (app) await app.close();
      vi.unstubAllEnvs();
    });

    test("scopes tasks and atomically joins invitation without bypassing onboarding", async () => {
      const server = app.getHttpServer();
      await request(server)
        .post(`/team-work/teams/${otherTeamId}/tasks`)
        .auth(leaderToken, { type: "bearer" })
        .send(taskBody)
        .expect(403);
      await request(server)
        .post(`${path}/tasks`)
        .auth(strangerToken, { type: "bearer" })
        .send(taskBody)
        .expect(403);
      await request(server)
        .post(`${path}/tasks`)
        .auth(leaderToken, { type: "bearer" })
        .send({ ...taskBody, endsAt: taskBody.startsAt })
        .expect(400);
      const created = await request(server)
        .post(`${path}/tasks`)
        .auth(leaderToken, { type: "bearer" })
        .send(taskBody)
        .expect(201);
      taskId = created.body.id;
      const invited = await request(server)
        .post(`${path}/tasks/${taskId}/invitations`)
        .auth(leaderToken, { type: "bearer" })
        .send({ realName: "临工测试", phone: "13800000702" })
        .expect(201);
      expect(invited.body.code).toMatch(/^\d{6}$/);
      expect(invited.body.phoneMasked).toBe("138****0702");
      const storedInvite = await db.temporaryTaskInvitation.findUniqueOrThrow({
        where: { id: invited.body.id },
      });
      expect(storedInvite).toMatchObject({
        status: "PENDING",
        taskId,
        phone: "13800000702",
        codeHash: createHmac("sha256", process.env.JWT_ACCESS_TOKEN_SECRET!)
          .update(`temporary-task-invite\0${invited.body.code}`)
          .digest("hex"),
      });
      expect(storedInvite.expiresAt.toISOString()).toBe(taskBody.endsAt);
      expect(storedInvite).not.toHaveProperty("code");
      await request(server)
        .post(`${path}/tasks/${taskId}/invitations`)
        .auth(leaderToken, { type: "bearer" })
        .send({ realName: "临工测试", phone: "13800000702" })
        .expect(409);
      await request(server)
        .post("/team-work/me/join")
        .auth(strangerToken, { type: "bearer" })
        .send({ code: invited.body.code })
        .expect(403);
      const results = await Promise.all(
        [0, 1].map(() =>
          request(server)
            .post("/team-work/me/join")
            .auth(workerToken, { type: "bearer" })
            .send({ code: invited.body.code })
            .expect(201),
        ),
      );
      memberId = results[0]!.body.memberId;
      expect(results[0]!.body).toMatchObject({ taskId, projectId, memberId });
      expect(results[1]!.body.memberId).toBe(memberId);
      const joinedMember = await db.projectWorkerMember.findUniqueOrThrow({
        where: { id: memberId },
        include: { worker: true },
      });
      expect(joinedMember).toMatchObject({
        projectId,
        teamId,
        taskAttendanceOnly: true,
        worker: {
          userId: "team-work-worker",
          phone: "13800000702",
          workType: "电工",
        },
      });
      expect(
        await db.temporaryTaskInvitation.findUniqueOrThrow({
          where: { id: invited.body.id },
        }),
      ).toMatchObject({
        status: "ACCEPTED",
        acceptedByUserId: "team-work-worker",
      });
      expect(
        await db.workerProfile.count({ where: { phone: "13800000702" } }),
      ).toBe(1);
      expect(await db.teamTaskAssignment.count({ where: { taskId } })).toBe(1);
      expect(
        (
          await db.userRole.findMany({
            where: { userId: "team-work-worker" },
            include: { role: true },
          })
        ).map((row) => row.role.code),
      ).toEqual(["WORKER"]);
      expect(
        await db.projectMemberHistory.count({
          where: { workerMemberId: memberId },
        }),
      ).toBe(1);
      const blocked = await request(server)
        .get(`/team-work/me/tasks?date=${date}`)
        .auth(workerToken, { type: "bearer" })
        .expect(403);
      expect(blocked.body.message).toBe("WORKER_REGISTRATION_REQUIRED");
      await db.workerProfile.update({
        where: { userId: "team-work-worker" },
        data: { registrationCompletedAt: new Date() },
      });
      const own = await request(server)
        .get(`/team-work/me/tasks?date=${date}`)
        .auth(workerToken, { type: "bearer" })
        .expect(200);
      expect(own.body[0]).toMatchObject({
        id: taskId,
        supervisorName: "测试班长",
        assignments: [{ memberId, source: "TEMPORARY_INVITE" }],
      });
      await request(server)
        .get(`${path}/tasks?date=${date}`)
        .auth(workerToken, { type: "bearer" })
        .expect(403);
    });

    test("lists database workers scoped to the project and team and safely adds them to existing work", async () => {
      const server = app.getHttpServer();
      const otherProject = await db.project.create({
        data: {
          companyId: "team-work-company",
          name: "其他项目",
          address: "其他工地",
          centerLatitude: 31,
          centerLongitude: 121,
          geofenceRadiusM: 200,
          status: "ACTIVE",
          plannedStartDate: new Date("2026-01-01"),
        },
      });
      const otherProjectTeam = await db.team.create({
        data: {
          projectId: otherProject.id,
          name: "其他项目班组",
          status: "ACTIVE",
        },
      });
      const invalidIds: string[] = [];
      for (const fixture of [
        {
          projectId,
          teamId: otherTeamId,
          status: "ACTIVE" as const,
          enteredAt: new Date(0),
          employmentStatus: "ACTIVE",
        },
        {
          projectId: otherProject.id,
          teamId: otherProjectTeam.id,
          status: "ACTIVE" as const,
          enteredAt: new Date(0),
          employmentStatus: "ACTIVE",
        },
        {
          projectId,
          teamId,
          status: "SUSPENDED" as const,
          enteredAt: new Date(0),
          employmentStatus: "ACTIVE",
        },
        {
          projectId,
          teamId,
          status: "ACTIVE" as const,
          enteredAt: new Date(Date.now() + 86400000),
          employmentStatus: "ACTIVE",
        },
        {
          projectId,
          teamId,
          status: "ACTIVE" as const,
          enteredAt: new Date(0),
          employmentStatus: "INACTIVE",
        },
      ]) {
        const worker = await db.workerProfile.create({
          data: {
            encryptedName: encryptPersonnelName(
              "范围测试工人",
              key,
              randomBytes(12),
            ),
            phone: "13800000711",
            workType: "木工",
            realNameStatus: "PENDING",
            faceProfileStatus: "PENDING",
            employmentStatus: fixture.employmentStatus,
          },
        });
        const person = await db.projectWorkerMember.create({
          data: {
            projectId: fixture.projectId,
            teamId: fixture.teamId,
            workerId: worker.id,
            status: fixture.status,
            enteredAt: fixture.enteredAt,
            projectRoleLabel: "WORKER",
          },
        });
        invalidIds.push(person.id);
      }
      const workers = await request(server)
        .get(`${path}/workers`)
        .auth(leaderToken, { type: "bearer" })
        .expect(200);
      expect(workers.body).toEqual([
        expect.objectContaining({
          memberId,
          projectId,
          teamId,
          name: "临工测试",
          workType: "电工",
          phoneMasked: "138****0702",
        }),
      ]);
      await request(server)
        .get(`/team-work/teams/${otherTeamId}/workers`)
        .auth(leaderToken, { type: "bearer" })
        .expect(403);
      await request(server)
        .get(`${path}/workers`)
        .auth(workerToken, { type: "bearer" })
        .expect(403);
      const task = await request(server)
        .post(`${path}/tasks`)
        .auth(leaderToken, { type: "bearer" })
        .send(taskBody)
        .expect(201);
      const membersPath: string = `${path}/tasks/${task.body.id}/members`;
      for (const invalid of invalidIds)
        await request(server)
          .post(membersPath)
          .auth(leaderToken, { type: "bearer" })
          .send({ memberIds: [invalid] })
          .expect(400);
      await request(server)
        .post(membersPath)
        .auth(strangerToken, { type: "bearer" })
        .send({ memberIds: [memberId] })
        .expect(403);
      await request(server)
        .post(membersPath)
        .auth(leaderToken, { type: "bearer" })
        .send({ memberIds: [memberId, memberId] })
        .expect(400);
      const results = await Promise.all(
        [1, 2].map(() =>
          request(server)
            .post(membersPath)
            .auth(leaderToken, { type: "bearer" })
            .send({ memberIds: [memberId] })
            .expect(201),
        ),
      );
      expect(results[0]!.body.assignments).toHaveLength(1);
      expect(
        await db.teamTaskAssignment.count({ where: { taskId: task.body.id } }),
      ).toBe(1);
      expect(
        await db.auditLog.count({
          where: { entityId: task.body.id, action: "TEAM_TASK_MEMBERS_ADDED" },
        }),
      ).toBe(1);
      await request(server)
        .put(`${path}/tasks/${task.body.id}/status`)
        .auth(leaderToken, { type: "bearer" })
        .send({ status: "CANCELLED" })
        .expect(200);
      await request(server)
        .post(membersPath)
        .auth(leaderToken, { type: "bearer" })
        .send({ memberIds: [memberId] })
        .expect(409);
    });

    test("preserves existing profile, rejects expired/revoked codes and cross-team reassignment", async () => {
      const server = app.getHttpServer();
      const prior = await db.workerProfile.findUniqueOrThrow({
        where: { userId: "team-work-worker" },
      });
      const next = await request(server)
        .post(`${path}/tasks`)
        .auth(leaderToken, { type: "bearer" })
        .send(taskBody)
        .expect(201);
      const createInvite = () =>
        request(server)
          .post(`${path}/tasks/${next.body.id}/invitations`)
          .auth(leaderToken, { type: "bearer" })
          .send({ realName: "临工测试", phone: "13800000702" })
          .expect(201);
      const expired = await createInvite();
      await db.temporaryTaskInvitation.update({
        where: { id: expired.body.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await request(server)
        .post("/team-work/me/join")
        .auth(workerToken, { type: "bearer" })
        .send({ code: expired.body.code })
        .expect(409);
      const revoked = await createInvite();
      await request(server)
        .post(
          `${path}/tasks/${next.body.id}/invitations/${revoked.body.id}/revoke`,
        )
        .auth(leaderToken, { type: "bearer" })
        .expect(201);
      await request(server)
        .post("/team-work/me/join")
        .auth(workerToken, { type: "bearer" })
        .send({ code: revoked.body.code })
        .expect(409);
      const accepted = await createInvite();
      await request(server)
        .post("/team-work/me/join")
        .auth(workerToken, { type: "bearer" })
        .send({ code: accepted.body.code })
        .expect(201);
      const after = await db.workerProfile.findUniqueOrThrow({
        where: { userId: "team-work-worker" },
      });
      expect(after.id).toBe(prior.id);
      expect(after.registrationCompletedAt).toEqual(
        prior.registrationCompletedAt,
      );
      expect(after.faceProfileStatus).toBe(prior.faceProfileStatus);
      const moveTask = await request(server)
        .post(`${path}/tasks`)
        .auth(leaderToken, { type: "bearer" })
        .send(taskBody)
        .expect(201);
      const moveInvite = await request(server)
        .post(`${path}/tasks/${moveTask.body.id}/invitations`)
        .auth(leaderToken, { type: "bearer" })
        .send({ realName: "临工测试", phone: "13800000702" })
        .expect(201);
      await db.projectWorkerMember.update({
        where: { id: memberId },
        data: { teamId: otherTeamId },
      });
      await request(server)
        .post("/team-work/me/join")
        .auth(workerToken, { type: "bearer" })
        .send({ code: moveInvite.body.code })
        .expect(409);
      expect(
        (
          await db.projectWorkerMember.findUniqueOrThrow({
            where: { id: memberId },
          })
        ).teamId,
      ).toBe(otherTeamId);
      expect(
        (
          await db.temporaryTaskInvitation.findUniqueOrThrow({
            where: { id: moveInvite.body.id },
          })
        ).status,
      ).toBe("PENDING");
      await db.projectWorkerMember.update({
        where: { id: memberId },
        data: { teamId },
      });
      await request(server)
        .put(`${path}/tasks/${moveTask.body.id}/status`)
        .auth(leaderToken, { type: "bearer" })
        .send({ status: "CANCELLED" })
        .expect(200);
      expect(
        (
          await db.temporaryTaskInvitation.findUniqueOrThrow({
            where: { id: moveInvite.body.id },
          })
        ).status,
      ).toBe("REVOKED");
    });

    test("persists briefings, acknowledgements, rectifications and actual-only daily snapshots", async () => {
      const server = app.getHttpServer();
      await request(server)
        .post(`${path}/briefings`)
        .auth(leaderToken, { type: "bearer" })
        .send({
          workDate: date,
          title: "用电安全",
          content: "维修前必须断电，并经现场负责人确认。",
        })
        .expect(201);
      const briefings = await request(server)
        .get(`/team-work/me/briefings?date=${date}`)
        .auth(workerToken, { type: "bearer" })
        .expect(200);
      const id: string = briefings.body[0].id;
      await request(server)
        .post(`/team-work/me/briefings/${id}/acknowledge`)
        .auth(strangerToken, { type: "bearer" })
        .expect(403);
      await request(server)
        .post(`/team-work/me/briefings/${id}/acknowledge`)
        .auth(workerToken, { type: "bearer" })
        .expect(201);
      await request(server)
        .post(`/team-work/me/briefings/${id}/acknowledge`)
        .auth(workerToken, { type: "bearer" })
        .expect(201);
      expect(
        await db.teamSafetyAcknowledgement.count({ where: { briefingId: id } }),
      ).toBe(1);
      await request(server)
        .post(`${path}/issues`)
        .auth(leaderToken, { type: "bearer" })
        .send({
          workDate: date,
          memberId,
          severity: "GENERAL",
          description: "临时电线摆放不规范",
        })
        .expect(201);
      const issues = await request(server)
        .get(`${path}/issues?date=${date}`)
        .auth(leaderToken, { type: "bearer" })
        .expect(200);
      await request(server)
        .put(`${path}/issues/${issues.body[0].id}/resolution`)
        .auth(leaderToken, { type: "bearer" })
        .send({ resolution: "" })
        .expect(400);
      await request(server)
        .put(`${path}/issues/${issues.body[0].id}/resolution`)
        .auth(leaderToken, { type: "bearer" })
        .send({ resolution: "已整理电线并复查" })
        .expect(200);
      await request(server)
        .put(`${path}/tasks/${taskId}/status`)
        .auth(leaderToken, { type: "bearer" })
        .send({ status: "COMPLETED" })
        .expect(200);
      const missing = await request(server)
        .get(`${path}/daily/${date}`)
        .auth(leaderToken, { type: "bearer" })
        .expect(200);
      expect(missing.headers["content-type"]).toContain("application/json");
      expect(missing.body).toEqual({ snapshot: null });
      const daily = await request(server)
        .post(`${path}/daily/${date}`)
        .auth(leaderToken, { type: "bearer" })
        .expect(201);
      expect(daily.body).toMatchObject({
        completedTaskCount: 1,
        temporaryWorkerCount: 1,
        briefingCount: 1,
        acknowledgementCount: 1,
        resolvedIssueCount: 1,
        openIssueCount: 0,
        workedMinutes: 0,
      });
      expect(await db.teamDailyLog.count({ where: { teamId } })).toBe(1);
      await request(server)
        .post(`${path}/issues`)
        .auth(leaderToken, { type: "bearer" })
        .send({
          workDate: date,
          memberId: null,
          severity: "GENERAL",
          description: "保存后新增待整改项",
        })
        .expect(201);
      const saved = await request(server)
        .get(`${path}/daily/${date}`)
        .auth(leaderToken, { type: "bearer" })
        .expect(200);
      expect(saved.body).toEqual({ snapshot: daily.body });
      const live = await request(server)
        .get(`${path}/daily?date=${date}`)
        .auth(leaderToken, { type: "bearer" })
        .expect(200);
      expect(live.body.openIssueCount).toBe(1);
      await request(server)
        .get(`${path}/daily/${date}`)
        .auth(strangerToken, { type: "bearer" })
        .expect(403);
      await request(server)
        .post(`${path}/daily/${date}`)
        .auth(leaderToken, { type: "bearer" })
        .expect(201);
      const updated = await request(server)
        .get(`${path}/daily/${date}`)
        .auth(leaderToken, { type: "bearer" })
        .expect(200);
      expect(updated.body.snapshot.openIssueCount).toBe(1);
      expect(await db.attendanceRecord.count({ where: { projectId } })).toBe(0);
    });

    test("reuses scoped task history with optional notes and resolves the effective team shift", async () => {
      const server = app.getHttpServer();
      const details = { ...taskBody, description: "", workType: "", title: "可复用夜班模板", startsAt: "2038-01-01T22:00:00+08:00", endsAt: "2038-01-02T02:00:00+08:00" };
      const created = await request(server).post(`${path}/tasks`).auth(leaderToken, { type: "bearer" }).send(details).expect(201);
      await request(server).get(`/team-work/teams/${otherTeamId}/task-templates`).auth(leaderToken, { type: "bearer" }).expect(403);
      await request(server).get(`${path}/task-templates`).auth(workerToken, { type: "bearer" }).expect(403);
      const history = await request(server).get(`${path}/task-templates`).query({ search: "可复用夜班" }).auth(leaderToken, { type: "bearer" }).expect(200);
      expect(history.body.items).toHaveLength(1);
      expect(history.body.items[0]).toMatchObject({ id: created.body.id, description: "", workType: "", memberIds: [], previousMemberCount: 0 });
      expect(history.body.items[0]).not.toHaveProperty("assignments");
      const copy = await request(server).post(`${path}/tasks`).auth(leaderToken, { type: "bearer" }).send({ ...details, title: "模板复制后修改", startsAt: "2038-01-03T22:00:00+08:00", endsAt: "2038-01-04T02:00:00+08:00" }).expect(201);
      expect(copy.body.id).not.toBe(created.body.id);
      expect((await db.teamWorkTask.findUniqueOrThrow({ where: { id: created.body.id } })).title).toBe(details.title);
      await db.teamWorkTask.createMany({ data: Array.from({ length: 31 }, (_, index) => ({ title: `分页模板${index}`, description: "", workType: "", teamId, startsAt: new Date(details.startsAt), endsAt: new Date(details.endsAt), createdByUserId: "team-work-leader" })) });
      const page = await request(server).get(`${path}/task-templates`).query({ search: "分页模板" }).auth(leaderToken, { type: "bearer" }).expect(200);
      expect(page.body.items).toHaveLength(30);
      const rest = await request(server).get(`${path}/task-templates`).query({ search: "分页模板", cursor: page.body.nextCursor }).auth(leaderToken, { type: "bearer" }).expect(200);
      expect(rest.body.items).toHaveLength(1);
      expect(rest.body.nextCursor).toBeNull();
      expect(page.body.items.map((row: { id: string }) => row.id)).not.toContain(rest.body.items[0].id);
      const points = [{ code: "START", label: "上班", kind: "START", time: "09:00", graceMins: 0 }, { code: "END", label: "下班", kind: "END", time: "18:00", graceMins: 0 }];
      const rule = await db.attendancePlan.create({ data: { projectId, scopeType: "PROJECT", scopeId: projectId, authorRoleLevel: 3, name: "项目白班", points, startsOn: new Date("2038-01-01"), workdayMask: 127 } });
      const teamRule = await db.attendancePlan.create({ data: { projectId, scopeType: "TEAM", scopeId: teamId, authorRoleLevel: 2, name: "班组调整", points: points.map((point) => ({ ...point, time: point.kind === "START" ? "10:00" : "19:00" })), startsOn: new Date("2038-01-02"), endsOn: new Date("2038-01-04"), workdayMask: 1 } });
      for (const [day, name, start, isWorkday] of [["2038-01-01", "项目白班", "09:00", true], ["2038-01-03", "班组调整", "10:00", false], ["2038-01-05", "项目白班", "09:00", true]] as const) {
        const config = await request(server).get(`${path}/task-defaults?date=${day}`).auth(leaderToken, { type: "bearer" }).expect(200);
        expect(config.body).toMatchObject({ name, isWorkday });
        expect(config.body.points[0].time).toBe(start);
      }
      await request(server).get(`/team-work/teams/${otherTeamId}/task-defaults?date=2038-01-01`).auth(leaderToken, { type: "bearer" }).expect(403);
      await db.attendancePlan.deleteMany({ where: { id: { in: [rule.id, teamRule.id] } } });
    });

    test("edits overnight tasks, revokes stale invitations and removes only unstarted assignments", async () => {
      const server = app.getHttpServer();
      const created = await request(server)
        .post(`${path}/tasks`)
        .auth(leaderToken, { type: "bearer" })
        .send({ ...taskBody, memberIds: [memberId] })
        .expect(201);
      const editPath: string = `${path}/tasks/${created.body.id}`;
      const invite = await request(server)
        .post(`${editPath}/invitations`)
        .auth(leaderToken, { type: "bearer" })
        .send({ realName: "临工测试", phone: "13800000702" })
        .expect(201);
      const tomorrow: string = new Date(Date.now() + 86400000 + 8 * 3600000)
        .toISOString()
        .slice(0, 10);
      const nextDay: string = new Date(Date.now() + 2 * 86400000 + 8 * 3600000)
        .toISOString()
        .slice(0, 10);
      const details = {
        title: "夜间维修",
        workType: "电工",
        description: "次日凌晨完工",
        startsAt: `${tomorrow}T19:00:00+08:00`,
        endsAt: `${nextDay}T02:00:00+08:00`,
      };
      await request(server)
        .put(editPath)
        .auth(strangerToken, { type: "bearer" })
        .send(details)
        .expect(403);
      await request(server)
        .put(editPath)
        .auth(leaderToken, { type: "bearer" })
        .send({ ...details, endsAt: `${nextDay}T20:00:00+08:00` })
        .expect(400);
      const updated = await request(server)
        .put(editPath)
        .auth(leaderToken, { type: "bearer" })
        .send(details)
        .expect(200);
      expect(updated.body.title).toBe(details.title);
      expect(
        Date.parse(updated.body.endsAt) - Date.parse(updated.body.startsAt),
      ).toBe(7 * 3600000);
      expect(
        (
          await db.temporaryTaskInvitation.findUniqueOrThrow({
            where: { id: invite.body.id },
          })
        ).status,
      ).toBe("REVOKED");
      const overnight = await request(server)
        .get(`${path}/tasks?date=${nextDay}`)
        .auth(leaderToken, { type: "bearer" })
        .expect(200);
      expect(
        overnight.body.some(
          (row: { id: string }) => row.id === created.body.id,
        ),
      ).toBe(true);
      await request(server)
        .delete(`${editPath}/members/${memberId}`)
        .auth(strangerToken, { type: "bearer" })
        .expect(403);
      await request(server)
        .delete(`${editPath}/members/${memberId}`)
        .auth(leaderToken, { type: "bearer" })
        .expect(200);
      expect(
        await db.teamTaskAssignment.count({
          where: { taskId: created.body.id },
        }),
      ).toBe(0);
      expect(
        (
          await db.projectWorkerMember.findUniqueOrThrow({
            where: { id: memberId },
          })
        ).status,
      ).toBe("ACTIVE");
      await request(server)
        .post(`${editPath}/members`)
        .auth(leaderToken, { type: "bearer" })
        .send({ memberIds: [memberId] })
        .expect(201);
      await db.teamTaskAssignment.update({
        where: { taskId_memberId: { taskId: created.body.id, memberId } },
        data: { startedAt: new Date(details.startsAt) },
      });
      await request(server)
        .put(editPath)
        .auth(leaderToken, { type: "bearer" })
        .send(details)
        .expect(409);
      await request(server)
        .delete(`${editPath}/members/${memberId}`)
        .auth(leaderToken, { type: "bearer" })
        .expect(409);
      expect(
        await db.auditLog.count({
          where: { entityId: created.body.id, action: "TEAM_TASK_UPDATED" },
        }),
      ).toBe(1);
    });

    test("shows old unresolved issues across dates with scoped pagination and removes resolved rows", async () => {
      const server = app.getHttpServer();
      await db.teamSafetyIssue.createMany({
        data: Array.from({ length: 51 }, (_, index) => ({
          teamId,
          workDate: new Date("2025-01-01"),
          description: `Old unresolved ${index}`,
          severity: "GENERAL",
          createdByUserId: "team-work-leader",
        })),
      });
      await request(server)
        .get(`/team-work/teams/${otherTeamId}/issues/open`)
        .auth(leaderToken, { type: "bearer" })
        .expect(403);
      const first = await request(server)
        .get(`${path}/issues/open`)
        .auth(leaderToken, { type: "bearer" })
        .expect(200);
      expect(first.body.items).toHaveLength(50);
      expect(
        first.body.items.some(
          (row: { workDate: string }) => row.workDate === "2025-01-01",
        ),
      ).toBe(true);
      const second = await request(server)
        .get(`${path}/issues/open?cursor=${first.body.nextCursor}`)
        .auth(leaderToken, { type: "bearer" })
        .expect(200);
      expect(second.body.nextCursor).toBeNull();
      const ids = [...first.body.items, ...second.body.items].map(
        (row: { id: string }) => row.id,
      );
      expect(new Set(ids).size).toBe(52);
      await request(server)
        .put(`${path}/issues/${first.body.items[0].id}/resolution`)
        .auth(leaderToken, { type: "bearer" })
        .send({ resolution: "现场已整改复核" })
        .expect(200);
      const after = await request(server)
        .get(`${path}/issues/open`)
        .auth(leaderToken, { type: "bearer" })
        .expect(200);
      expect(
        after.body.items.some(
          (row: { id: string }) => row.id === first.body.items[0].id,
        ),
      ).toBe(false);
    });

    test("limits invitation guessing persistently", async () => {
      for (let index: number = 0; index < 10; index += 1)
        await request(app.getHttpServer())
          .post("/team-work/me/join")
          .auth(strangerToken, { type: "bearer" })
          .send({ code: "000000" });
      await request(app.getHttpServer())
        .post("/team-work/me/join")
        .auth(strangerToken, { type: "bearer" })
        .send({ code: "000000" })
        .expect(429);
      expect(
        (
          await db.temporaryInviteAttempt.findUniqueOrThrow({
            where: { userId: "team-work-stranger" },
          })
        ).count,
      ).toBeGreaterThan(10);
    });
  },
);
