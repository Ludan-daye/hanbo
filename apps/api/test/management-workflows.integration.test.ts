import { createHash, randomBytes } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

import { AppModule } from "../src/app.module.js";
import { PrismaService } from "../src/infrastructure/database/prisma.service.js";
import type {
  AttendanceReportTotals,
  DailyAttendanceReportResponse,
  RangeAttendanceReportResponse,
} from "../src/reports/reports.types.js";
import type { ManagedProjectResponse } from "../src/management/management.types.js";
import type {
  ManagedTeamResponse,
  TeamWriteRequest,
} from "../src/management/teams.types.js";
import type {
  ManagedParticipantResponse,
  ParticipantWriteRequest,
} from "../src/management/participants.types.js";
import {
  encryptPersonnelName,
  personnelNameSearchHashes,
} from "../src/management/personnel-name.js";

const companyId: string = "workflow-company";
const projectId: string = "workflow-project";
const otherProjectId: string = "workflow-other-project";
const actorId: string = "workflow-admin";
const workerUserId: string = "workflow-worker";
const leaderUserId: string = "workflow-leader";
const otherUserId: string = "workflow-other-admin";
const teamId: string = "workflow-team";
const secondTeamId: string = "workflow-second-team";

const newPerson = (phone: string): ParticipantWriteRequest => ({
  displayName: "测试木工",
  phone,
  participantType: "WORKER",
  projectRoleLabel: "模板施工",
  workType: "木工",
  teamId,
  requiresAttendance: true,
  status: "ACTIVE",
  enteredAt: "2026-10-01T00:00:00+08:00",
  exitedAt: null,
  expectedUpdatedAt: null,
  expectedProfileUpdatedAt: null,
});
const editPerson = (
  person: ManagedParticipantResponse,
): ParticipantWriteRequest => ({
  displayName: person.displayName!,
  phone: person.phone,
  participantType: person.participantType,
  projectRoleLabel: person.projectRoleLabel,
  workType: person.workType!,
  teamId: person.teamId,
  requiresAttendance: person.requiresAttendance,
  status: person.status,
  enteredAt: person.enteredAt,
  exitedAt: person.exitedAt,
  expectedUpdatedAt: person.updatedAt,
  expectedProfileUpdatedAt: person.profileUpdatedAt,
});

describe.skipIf(process.env.DATABASE_FOUNDATION_TEST_URL === undefined)(
  "real HTTP personnel and project management",
  (): void => {
    let app: INestApplication;
    let database: PrismaService;
    let adminToken: string;
    let otherToken: string;
    let workerToken: string;
    let leaderToken: string;

    const tokenFor = async (userId: string): Promise<string> => {
      const session = await database.userSession.create({
        data: {
          userId,
          tokenHash: createHash("sha256").update(userId).digest("hex"),
          expiresAt: new Date(Date.now() + 3_600_000),
        },
      });
      const secret: string | undefined = process.env.JWT_ACCESS_TOKEN_SECRET;
      if (secret === undefined)
        throw new Error(
          "Missing JWT secret for isolated HTTP integration test.",
        );
      return app
        .get(JwtService)
        .signAsync(
          { sid: session.id, sub: userId, sv: 1 },
          { secret, expiresIn: 3600 },
        );
    };

    beforeAll(async (): Promise<void> => {
      const configuredUrl: string | undefined =
        process.env.DATABASE_FOUNDATION_TEST_URL;
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
      await app.init();
      database = app.get(PrismaService);
      await database.company.create({
        data: {
          id: companyId,
          name: "Workflow test company",
          status: "ACTIVE",
        },
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
      for (const id of [teamId, secondTeamId])
        await database.team.create({
          data: { id, projectId, name: id, status: "ACTIVE" },
        });
      for (const id of [actorId, workerUserId, leaderUserId, otherUserId])
        await database.user.create({
          data: {
            id,
            openid: id,
            nickname: id,
            isBound: id === actorId || id === otherUserId,
            phone: id === leaderUserId ? "13800000102" : "13800000101",
            encryptedRealName: encryptPersonnelName(
              id === leaderUserId ? "测试班组长" : "测试木工",
              "ab".repeat(32),
              randomBytes(12),
            ),
            avatarObjectKey: "test/avatar.jpg",
            avatarContentType: "image/jpeg",
          },
        });
      const role = await database.role.findUniqueOrThrow({
        where: { code: "PROJECT_ADMIN" },
      });
      await database.userRole.createMany({
        data: [
          {
            userId: actorId,
            roleId: role.id,
            scopeType: "PROJECT",
            scopeId: projectId,
          },
          {
            userId: otherUserId,
            roleId: role.id,
            scopeType: "PROJECT",
            scopeId: otherProjectId,
          },
        ],
      });
      [adminToken, otherToken, workerToken, leaderToken] = await Promise.all([
        tokenFor(actorId),
        tokenFor(otherUserId),
        tokenFor(workerUserId),
        tokenFor(leaderUserId),
      ]);
    });
    afterAll(async (): Promise<void> => {
      if (app !== undefined) await app.close();
    });

    test("creates encrypted personnel with a work type, binds an account, transfers and exits without losing history", async (): Promise<void> => {
      const created = await request(app.getHttpServer())
        .post(`/management/projects/${projectId}/participants`)
        .auth(adminToken, { type: "bearer" })
        .send(newPerson("13800000101"))
        .expect(201);
      let person: ManagedParticipantResponse = created.body;
      expect(person.displayName).toBe("测试木工");
      expect(person.workType).toBe("木工");
      const profile = await database.workerProfile.findUniqueOrThrow({
        where: { id: person.profileId },
      });
      expect(profile.encryptedName).not.toContain("测试木工");
      expect(profile.encryptedName).toMatch(/^name-v1:/);
      expect(profile.encryptedIdNumber).toBeNull();
      const invitation = await request(app.getHttpServer())
        .post(`/bindings/projects/${projectId}/invitations`)
        .auth(adminToken, { type: "bearer" })
        .send({ targetType: "WORKER", profileId: person.profileId })
        .expect(201);
      await request(app.getHttpServer())
        .post("/auth/bind")
        .auth(workerToken, { type: "bearer" })
        .send({ invitationCode: invitation.body.code })
        .expect(201);
      expect(
        await database.userRole.count({
          where: {
            userId: workerUserId,
            scopeId: projectId,
            role: { code: "WORKER" },
          },
        }),
      ).toBe(1);
      person = (
        await request(app.getHttpServer())
          .get(
            `/management/projects/${projectId}/participants/${person.memberId}`,
          )
          .auth(adminToken, { type: "bearer" })
          .expect(200)
      ).body;
      const transferred = await request(app.getHttpServer())
        .put(
          `/management/projects/${projectId}/participants/${person.memberId}`,
        )
        .auth(adminToken, { type: "bearer" })
        .send({ ...editPerson(person), teamId: secondTeamId })
        .expect(200);
      person = transferred.body;
      expect(person.teamId).toBe(secondTeamId);
      const exited = await request(app.getHttpServer())
        .put(
          `/management/projects/${projectId}/participants/${person.memberId}`,
        )
        .auth(adminToken, { type: "bearer" })
        .send({
          ...editPerson(person),
          status: "EXITED",
          exitedAt: "2026-10-27T00:00:00+08:00",
        })
        .expect(200);
      expect(exited.body.status).toBe("EXITED");
      expect(
        await database.projectMemberHistory.count({
          where: { workerMemberId: person.memberId },
        }),
      ).toBe(3);
      expect(
        await database.userRole.count({
          where: {
            userId: workerUserId,
            scopeId: projectId,
            role: { code: "WORKER" },
          },
        }),
      ).toBe(0);
      const reread = await request(app.getHttpServer())
        .get(
          `/management/projects/${projectId}/participants/${person.memberId}`,
        )
        .auth(adminToken, { type: "bearer" })
        .expect(200);
      expect(reread.body.displayName).toBe("测试木工");
      expect(reread.body.exitedAt).toBe("2026-10-26T16:00:00.000Z");
    });

    test("updates a bound team leader's permissions and rejects out-of-scope or stale writes", async (): Promise<void> => {
      const created = await request(app.getHttpServer())
        .post(`/management/projects/${projectId}/participants`)
        .auth(adminToken, { type: "bearer" })
        .send({
          ...newPerson("13800000102"),
          displayName: "测试班组长",
          participantType: "MANAGER",
          projectRoleLabel: "TEAM_LEADER",
          workType: "钢筋工",
        })
        .expect(201);
      let person: ManagedParticipantResponse = created.body;
      const invitation = await request(app.getHttpServer())
        .post(`/bindings/projects/${projectId}/invitations`)
        .auth(adminToken, { type: "bearer" })
        .send({ targetType: "MANAGER", profileId: person.profileId })
        .expect(201);
      await request(app.getHttpServer())
        .post("/auth/bind")
        .auth(leaderToken, { type: "bearer" })
        .send({ invitationCode: invitation.body.code })
        .expect(201);
      person = (
        await request(app.getHttpServer())
          .get(
            `/management/projects/${projectId}/participants/${person.memberId}`,
          )
          .auth(adminToken, { type: "bearer" })
          .expect(200)
      ).body;
      await request(app.getHttpServer())
        .put(
          `/management/projects/${projectId}/participants/${person.memberId}`,
        )
        .auth(otherToken, { type: "bearer" })
        .send(editPerson(person))
        .expect(403);
      await request(app.getHttpServer())
        .put(
          `/management/projects/${projectId}/participants/${person.memberId}`,
        )
        .auth(adminToken, { type: "bearer" })
        .send({ ...editPerson(person), teamId: secondTeamId })
        .expect(200);
      expect(
        await database.userRole.count({
          where: { userId: leaderUserId, scopeId: teamId },
        }),
      ).toBe(0);
      expect(
        await database.userRole.count({
          where: {
            userId: leaderUserId,
            scopeId: secondTeamId,
            role: { code: "TEAM_LEADER" },
          },
        }),
      ).toBe(1);
      await request(app.getHttpServer())
        .put(
          `/management/projects/${projectId}/participants/${person.memberId}`,
        )
        .auth(adminToken, { type: "bearer" })
        .send(editPerson(person))
        .expect(409);
      await request(app.getHttpServer())
        .get(
          `/management/projects/${projectId}/participants/${person.memberId}`,
        )
        .auth(workerToken, { type: "bearer" })
        .expect(403);
    });

    test("returns bounded searchable pages and prevents cross-project member access", async (): Promise<void> => {
      const key: string = process.env.PERSONNEL_ENCRYPTION_KEY!;
      const data = Array.from({ length: 120 }, (_entry, index) => ({
        id: `workflow-page-worker-${index}`,
        encryptedName: encryptPersonnelName(
          `分页测试${index}`,
          key,
          randomBytes(12),
        ),
        nameSearchHashes: [
          ...personnelNameSearchHashes(`分页测试${index}`, key),
        ],
        phone: String(13900000000 + index),
        workType: "电工",
        realNameStatus: "PENDING",
        faceProfileStatus: "PENDING",
        employmentStatus: "ACTIVE",
      }));
      await database.workerProfile.createMany({ data });
      await database.projectWorkerMember.createMany({
        data: data.map((profile) => ({
          workerId: profile.id,
          projectId,
          teamId,
          projectRoleLabel: "电气安装",
          status: "ACTIVE" as const,
          enteredAt: new Date("2026-10-01"),
        })),
      });
      const path: string = `/management/projects/${projectId}/participant-page?pageSize=50&search=${encodeURIComponent("分页")}`;
      const first = await request(app.getHttpServer())
        .get(`${path}&page=1`)
        .auth(adminToken, { type: "bearer" })
        .expect(200);
      const second = await request(app.getHttpServer())
        .get(`${path}&page=2`)
        .auth(adminToken, { type: "bearer" })
        .expect(200);
      expect(first.body.total).toBe(120);
      expect(first.body.items).toHaveLength(50);
      expect(second.body.items).toHaveLength(50);
      const ids: Set<string> = new Set(
        (first.body.items as ManagedParticipantResponse[]).map(
          (person): string => person.memberId,
        ),
      );
      expect(
        (second.body.items as ManagedParticipantResponse[]).some(
          (person): boolean => ids.has(person.memberId),
        ),
      ).toBe(false);
      expect(JSON.stringify(first.body)).not.toContain("encryptedName");
      await database.projectWorkerMember.updateMany({
        where: {
          workerId: { in: data.slice(0, 90).map((profile) => profile.id) },
        },
        data: { status: "EXITED", exitedAt: new Date("2026-10-10") },
      });
      await database.projectWorkerMember.updateMany({
        where: {
          workerId: { in: data.slice(90, 110).map((profile) => profile.id) },
        },
        data: { status: "SUSPENDED" },
      });
      await request(app.getHttpServer())
        .post(`/management/projects/${projectId}/participants`)
        .auth(adminToken, { type: "bearer" })
        .send({
          ...newPerson("13800000129"),
          displayName: "分页班组长",
          participantType: "MANAGER",
          projectRoleLabel: "TEAM_LEADER",
        })
        .expect(201);
      const candidatePath: string = `/management/projects/${projectId}/participant-page?pageSize=7&search=${encodeURIComponent("分页")}&status=ACTIVE&teamId=${teamId}`;
      const activeFirst = await request(app.getHttpServer())
        .get(`${candidatePath}&page=1`)
        .auth(adminToken, { type: "bearer" })
        .expect(200);
      const activeSecond = await request(app.getHttpServer())
        .get(`${candidatePath}&page=2`)
        .auth(adminToken, { type: "bearer" })
        .expect(200);
      expect(activeFirst.body.total).toBe(11);
      expect(activeFirst.body.items).toHaveLength(7);
      expect(activeSecond.body.items).toHaveLength(4);
      const candidates: ManagedParticipantResponse[] = [
        ...activeFirst.body.items,
        ...activeSecond.body.items,
      ];
      expect(new Set(candidates.map((person) => person.memberId)).size).toBe(
        11,
      );
      expect(
        candidates.every(
          (person) => person.status === "ACTIVE" && person.teamId === teamId,
        ),
      ).toBe(true);
      expect(
        candidates.filter((person) => person.participantType === "MANAGER"),
      ).toHaveLength(1);
      const leaders = await request(app.getHttpServer())
        .get(`${candidatePath}&page=1&permissionRole=TEAM_LEADER`)
        .auth(adminToken, { type: "bearer" })
        .expect(200);
      expect(leaders.body.total).toBe(1);
      expect(leaders.body.items).toHaveLength(1);
      expect(leaders.body.items[0].projectRoleLabel).toBe("TEAM_LEADER");
      const workers = await request(app.getHttpServer())
        .get(`${candidatePath}&page=1&permissionRole=WORKER`)
        .auth(adminToken, { type: "bearer" })
        .expect(200);
      expect(workers.body.total).toBe(10);
      expect(workers.body.items).toHaveLength(7);
      expect(
        (workers.body.items as ManagedParticipantResponse[]).every(
          (person) => person.participantType === "WORKER",
        ),
      ).toBe(true);
      await request(app.getHttpServer())
        .get(`${candidatePath}&page=1&permissionRole=SYSTEM_ADMIN`)
        .auth(adminToken, { type: "bearer" })
        .expect(400);
      await request(app.getHttpServer())
        .get(`${path}&page=1&status=UNKNOWN`)
        .auth(adminToken, { type: "bearer" })
        .expect(400);
      await request(app.getHttpServer())
        .get(
          `/management/projects/${projectId}/participant-page?page=1&pageSize=101&search=`,
        )
        .auth(adminToken, { type: "bearer" })
        .expect(400);
      await request(app.getHttpServer())
        .get(`${path}&page=1`)
        .auth(otherToken, { type: "bearer" })
        .expect(403);
      await request(app.getHttpServer())
        .get(
          `/management/projects/${otherProjectId}/participants/${first.body.items[0].memberId}`,
        )
        .auth(otherToken, { type: "bearer" })
        .expect(404);
    });

    test("serializes duplicate creation and detects concurrent edits", async (): Promise<void> => {
      const body: ParticipantWriteRequest = newPerson("13800000999");
      const results = await Promise.all(
        [0, 1].map(() =>
          request(app.getHttpServer())
            .post(`/management/projects/${projectId}/participants`)
            .auth(adminToken, { type: "bearer" })
            .send(body),
        ),
      );
      expect(results.map((response): number => response.status).sort()).toEqual(
        [201, 409],
      );
      expect(
        await database.workerProfile.count({ where: { phone: body.phone } }),
      ).toBe(1);
      const person: ManagedParticipantResponse = results.find(
        (response): boolean => response.status === 201,
      )!.body;
      const edits = await Promise.all(
        [false, true].map((requiresAttendance) =>
          request(app.getHttpServer())
            .put(
              `/management/projects/${projectId}/participants/${person.memberId}`,
            )
            .auth(adminToken, { type: "bearer" })
            .send({ ...editPerson(person), requiresAttendance }),
        ),
      );
      expect(edits.map((response): number => response.status).sort()).toEqual([
        200, 409,
      ]);
    });

    test.each(["WORKER", "MANAGER"] as const)(
      "rejects a %s assignment edit when the profile changes after the request starts",
      async (participantType): Promise<void> => {
        const created = await request(app.getHttpServer())
          .post(`/management/projects/${projectId}/participants`)
          .auth(adminToken, { type: "bearer" })
          .send({
            ...newPerson(
              participantType === "WORKER" ? "13800000981" : "13800000982",
            ),
            participantType,
            projectRoleLabel:
              participantType === "WORKER" ? "模板施工" : "TEAM_LEADER",
          })
          .expect(201);
        const person: ManagedParticipantResponse = created.body;
        let pendingEdit: Promise<request.Response> | null = null;
        try {
          await database.$transaction(async (transaction): Promise<void> => {
            await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`member-phone:${person.phone}`}, 0))`;
            const processes: readonly { readonly pid: number }[] =
              await transaction.$queryRaw`SELECT pg_backend_pid() AS pid`;
            const blockerPid: number = processes[0]!.pid;
            pendingEdit = request(app.getHttpServer())
              .put(
                `/management/projects/${projectId}/participants/${person.memberId}`,
              )
              .auth(adminToken, { type: "bearer" })
              .send({ ...editPerson(person), teamId: secondTeamId })
              .then((response): request.Response => response);
            // The HTTP request has read the old profile and is waiting to write.
            await vi.waitFor(
              async (): Promise<void> => {
                const blocked: readonly { readonly pid: number }[] =
                  await transaction.$queryRaw`SELECT pid FROM pg_stat_activity WHERE ${blockerPid} = ANY(pg_blocking_pids(pid))`;
                expect(blocked.length).toBeGreaterThan(0);
              },
              { timeout: 2000, interval: 10 },
            );
            const data = {
              workType: "电工",
              updatedAt: new Date(
                new Date(person.profileUpdatedAt).getTime() + 1000,
              ),
            };
            if (participantType === "WORKER")
              await transaction.workerProfile.update({
                where: { id: person.profileId },
                data,
              });
            else
              await transaction.managerProfile.update({
                where: { id: person.profileId },
                data,
              });
          });
        } finally {
          if (pendingEdit !== null) await pendingEdit;
        }
        const result = await pendingEdit;
        expect(result).toMatchObject({
          status: 409,
          body: { message: "MEMBER_CHANGED_RELOAD_BEFORE_SAVING" },
        });
        const current = await request(app.getHttpServer())
          .get(
            `/management/projects/${projectId}/participants/${person.memberId}`,
          )
          .auth(adminToken, { type: "bearer" })
          .expect(200);
        expect(current.body.teamId).toBe(teamId);
        expect(current.body.workType).toBe("电工");
        const retried = await request(app.getHttpServer())
          .put(
            `/management/projects/${projectId}/participants/${person.memberId}`,
          )
          .auth(adminToken, { type: "bearer" })
          .send({ ...editPerson(current.body), teamId: secondTeamId })
          .expect(200);
        expect(retried.body.teamId).toBe(secondTeamId);
      },
    );

    test("edits team details, validates the responsible person and clears the designation on transfer", async (): Promise<void> => {
      const created = await request(app.getHttpServer())
        .post(`/management/projects/${projectId}/participants`)
        .auth(adminToken, { type: "bearer" })
        .send(newPerson("13800000771"))
        .expect(201);
      const person: ManagedParticipantResponse = created.body;
      const initial = await request(app.getHttpServer())
        .get(`/management/projects/${projectId}/teams/${teamId}`)
        .auth(adminToken, { type: "bearer" })
        .expect(200);
      const team: ManagedTeamResponse = initial.body;
      const body: TeamWriteRequest = {
        name: "钢筋测试班",
        status: "ACTIVE",
        workType: "钢筋工",
        remark: "Team details through HTTP",
        leader: { memberId: person.memberId, participantType: "WORKER" },
        expectedUpdatedAt: team.updatedAt,
      };
      const saved = await request(app.getHttpServer())
        .put(`/management/projects/${projectId}/teams/${teamId}`)
        .auth(adminToken, { type: "bearer" })
        .send(body)
        .expect(200);
      expect(saved.body.leader.memberId).toBe(person.memberId);
      expect(saved.body.workType).toBe("钢筋工");
      expect(saved.body.memberCount).toBeGreaterThan(0);
      await request(app.getHttpServer())
        .put(`/management/projects/${projectId}/teams/${teamId}`)
        .auth(adminToken, { type: "bearer" })
        .send(body)
        .expect(409);
      await request(app.getHttpServer())
        .put(`/management/projects/${projectId}/teams/${teamId}`)
        .auth(otherToken, { type: "bearer" })
        .send({ ...body, expectedUpdatedAt: saved.body.updatedAt })
        .expect(403);
      await request(app.getHttpServer())
        .put(`/management/projects/${projectId}/teams/${secondTeamId}`)
        .auth(adminToken, { type: "bearer" })
        .send({ ...body, expectedUpdatedAt: saved.body.updatedAt })
        .expect(400);
      await request(app.getHttpServer())
        .put(
          `/management/projects/${projectId}/participants/${person.memberId}`,
        )
        .auth(adminToken, { type: "bearer" })
        .send({ ...editPerson(person), teamId: secondTeamId })
        .expect(200);
      const cleared = await request(app.getHttpServer())
        .get(`/management/projects/${projectId}/teams/${teamId}`)
        .auth(adminToken, { type: "bearer" })
        .expect(200);
      expect(cleared.body.leader).toBeNull();
      expect(cleared.body.updatedAt).not.toBe(saved.body.updatedAt);
      expect(
        await database.auditLog.count({
          where: { entityId: teamId, action: "team.leader.cleared" },
        }),
      ).toBe(1);
      await request(app.getHttpServer())
        .put(`/management/projects/${projectId}/teams/${teamId}`)
        .auth(adminToken, { type: "bearer" })
        .send({
          ...body,
          expectedUpdatedAt: cleared.body.updatedAt,
          leader: null,
          name: (
            await database.team.findUniqueOrThrow({
              where: { id: secondTeamId },
            })
          ).name,
        })
        .expect(409);
      const concurrent = await Promise.all(
        [0, 1].map((index) =>
          request(app.getHttpServer())
            .put(`/management/projects/${projectId}/teams/${teamId}`)
            .auth(adminToken, { type: "bearer" })
            .send({
              ...body,
              leader: null,
              expectedUpdatedAt: cleared.body.updatedAt,
              remark: String(index),
            }),
        ),
      );
      expect(concurrent.map((result): number => result.status).sort()).toEqual([
        200, 409,
      ]);
    });

    test("reuses worker and manager profiles with their bound accounts and independent project history", async (): Promise<void> => {
      const targetId: string = "reuse-target-project";
      await database.project.create({
        data: {
          id: targetId,
          companyId,
          name: "Reuse target",
          address: "Test site",
          centerLatitude: "31",
          centerLongitude: "121",
          geofenceRadiusM: 300,
          status: "ACTIVE",
          plannedStartDate: new Date("2026-01-01"),
        },
      });
      const targetTeam = await database.team.create({
        data: {
          projectId: targetId,
          name: "Reuse target team",
          status: "ACTIVE",
        },
      });
      const adminRole = await database.role.findUniqueOrThrow({
        where: { code: "PROJECT_ADMIN" },
      });
      await database.userRole.create({
        data: {
          userId: actorId,
          roleId: adminRole.id,
          scopeType: "PROJECT",
          scopeId: targetId,
        },
      });
      const sources = await request(app.getHttpServer())
        .get(`/management/projects/${targetId}/reuse-projects`)
        .auth(adminToken, { type: "bearer" })
        .expect(200);
      expect(
        sources.body.map((source: { id: string }): string => source.id),
      ).toContain(projectId);
      expect(
        sources.body.map((source: { id: string }): string => source.id),
      ).not.toContain(otherProjectId);
      for (const participantType of ["WORKER", "MANAGER"] as const) {
        const userId: string = `reuse-${participantType.toLowerCase()}`;
        await database.user.create({
          data: {
            id: userId,
            openid: userId,
            nickname: "Test reuse",
            phone: participantType === "WORKER" ? "13800000781" : "13800000782",
            encryptedRealName: encryptPersonnelName(
              "测试木工",
              "ab".repeat(32),
              randomBytes(12),
            ),
            avatarObjectKey: "test/avatar.jpg",
            avatarContentType: "image/jpeg",
          },
        });
        const token: string = await tokenFor(userId);
        const created = await request(app.getHttpServer())
          .post(`/management/projects/${projectId}/participants`)
          .auth(adminToken, { type: "bearer" })
          .send({
            ...newPerson(
              participantType === "WORKER" ? "13800000781" : "13800000782",
            ),
            participantType,
            projectRoleLabel:
              participantType === "WORKER" ? "模板施工" : "TEAM_LEADER",
          })
          .expect(201);
        const invitation = await request(app.getHttpServer())
          .post(`/bindings/projects/${projectId}/invitations`)
          .auth(adminToken, { type: "bearer" })
          .send({
            targetType: participantType,
            profileId: created.body.profileId,
          })
          .expect(201);
        await request(app.getHttpServer())
          .post("/auth/bind")
          .auth(token, { type: "bearer" })
          .send({ invitationCode: invitation.body.code })
          .expect(201);
        const source: ManagedParticipantResponse = (
          await request(app.getHttpServer())
            .get(
              `/management/projects/${projectId}/participants/${created.body.memberId}`,
            )
            .auth(adminToken, { type: "bearer" })
            .expect(200)
        ).body;
        const profileCount: number =
          participantType === "WORKER"
            ? await database.workerProfile.count()
            : await database.managerProfile.count();
        const body = {
          sourceProjectId: projectId,
          sourceMemberId: source.memberId,
          participantType,
          expectedSourceUpdatedAt: source.updatedAt,
          expectedProfileUpdatedAt: source.profileUpdatedAt,
          projectRoleLabel: source.projectRoleLabel,
          teamId: targetTeam.id,
          requiresAttendance: true,
          enteredAt: "2026-10-20T00:00:00+08:00",
        };
        const results = await Promise.all(
          [0, 1].map(() =>
            request(app.getHttpServer())
              .post(`/management/projects/${targetId}/reused-participants`)
              .auth(adminToken, { type: "bearer" })
              .send(body),
          ),
        );
        expect(results.map((result): number => result.status).sort()).toEqual([
          201, 409,
        ]);
        const reused: ManagedParticipantResponse = results.find(
          (result): boolean => result.status === 201,
        )!.body;
        expect(reused.profileId).toBe(source.profileId);
        expect(reused.memberId).not.toBe(source.memberId);
        expect(reused.workType).toBe(source.workType);
        expect(
          participantType === "WORKER"
            ? await database.workerProfile.count()
            : await database.managerProfile.count(),
        ).toBe(profileCount);
        expect(
          await database.userRole.count({
            where: {
              userId,
              scopeId: participantType === "WORKER" ? targetId : targetTeam.id,
              role: {
                code: participantType === "WORKER" ? "WORKER" : "TEAM_LEADER",
              },
            },
          }),
        ).toBe(1);
        expect(
          await database.projectMemberHistory.count({
            where:
              participantType === "WORKER"
                ? { workerMemberId: reused.memberId }
                : { managerMemberId: reused.memberId },
          }),
        ).toBe(1);
        const beforeExit: ManagedTeamResponse = (
          await request(app.getHttpServer())
            .get(`/management/projects/${targetId}/teams/${targetTeam.id}`)
            .auth(adminToken, { type: "bearer" })
            .expect(200)
        ).body;
        await request(app.getHttpServer())
          .put(`/management/projects/${targetId}/teams/${targetTeam.id}`)
          .auth(adminToken, { type: "bearer" })
          .send({
            name: beforeExit.name,
            status: "ACTIVE",
            workType: null,
            remark: null,
            leader: { memberId: reused.memberId, participantType },
            expectedUpdatedAt: beforeExit.updatedAt,
          })
          .expect(200);
        await request(app.getHttpServer())
          .put(
            `/management/projects/${targetId}/participants/${reused.memberId}`,
          )
          .auth(adminToken, { type: "bearer" })
          .send({
            ...editPerson(reused),
            status: "EXITED",
            exitedAt: "2026-10-27T00:00:00+08:00",
          })
          .expect(200);
        expect(
          (
            await request(app.getHttpServer())
              .get(`/management/projects/${targetId}/teams/${targetTeam.id}`)
              .auth(adminToken, { type: "bearer" })
              .expect(200)
          ).body.leader,
        ).toBeNull();
        const original = await request(app.getHttpServer())
          .get(
            `/management/projects/${projectId}/participants/${source.memberId}`,
          )
          .auth(adminToken, { type: "bearer" })
          .expect(200);
        expect(original.body).toEqual(source);
        expect(
          await database.userRole.count({
            where: {
              userId,
              scopeId: participantType === "WORKER" ? projectId : teamId,
              role: {
                code: participantType === "WORKER" ? "WORKER" : "TEAM_LEADER",
              },
            },
          }),
        ).toBe(1);
        expect(
          await database.userRole.count({
            where: {
              userId,
              scopeId: participantType === "WORKER" ? targetId : targetTeam.id,
            },
          }),
        ).toBe(0);
      }
    });

    test("rejects unauthorized, cross-company and stale personnel reuse", async (): Promise<void> => {
      const created = await request(app.getHttpServer())
        .post(`/management/projects/${projectId}/participants`)
        .auth(adminToken, { type: "bearer" })
        .send(newPerson("13800000791"))
        .expect(201);
      const source: ManagedParticipantResponse = created.body;
      const body = {
        sourceProjectId: projectId,
        sourceMemberId: source.memberId,
        participantType: "WORKER",
        expectedSourceUpdatedAt: source.updatedAt,
        expectedProfileUpdatedAt: source.profileUpdatedAt,
        projectRoleLabel: "照明安装",
        teamId: null,
        requiresAttendance: true,
        enteredAt: "2026-10-20T00:00:00+08:00",
      };
      await request(app.getHttpServer())
        .post(`/management/projects/${otherProjectId}/reused-participants`)
        .auth(otherToken, { type: "bearer" })
        .send(body)
        .expect(403);
      const role = await database.role.findUniqueOrThrow({
        where: { code: "PROJECT_ADMIN" },
      });
      await database.userRole.create({
        data: {
          userId: actorId,
          roleId: role.id,
          scopeType: "PROJECT",
          scopeId: otherProjectId,
        },
      });
      try {
        await request(app.getHttpServer())
          .post(`/management/projects/${otherProjectId}/reused-participants`)
          .auth(adminToken, { type: "bearer" })
          .send({
            ...body,
            expectedProfileUpdatedAt: "2026-01-01T00:00:00.000Z",
          })
          .expect(409);
        await request(app.getHttpServer())
          .post(`/management/projects/${otherProjectId}/reused-participants`)
          .auth(adminToken, { type: "bearer" })
          .send({ ...body, sourceProjectId: "unknown-project" })
          .expect(403);
        await database.company.create({
          data: {
            id: "foreign-reuse-company",
            name: "Foreign test",
            status: "ACTIVE",
          },
        });
        await database.project.create({
          data: {
            id: "foreign-reuse-project",
            companyId: "foreign-reuse-company",
            name: "Foreign project",
            address: "Test",
            centerLatitude: "31",
            centerLongitude: "121",
            geofenceRadiusM: 300,
            status: "ACTIVE",
            plannedStartDate: new Date("2026-01-01"),
          },
        });
        await database.userRole.create({
          data: {
            userId: actorId,
            roleId: role.id,
            scopeType: "PROJECT",
            scopeId: "foreign-reuse-project",
          },
        });
        await request(app.getHttpServer())
          .post(
            "/management/projects/foreign-reuse-project/reused-participants",
          )
          .auth(adminToken, { type: "bearer" })
          .send(body)
          .expect(403);
        expect(
          await database.projectWorkerMember.count({
            where: { projectId: otherProjectId, workerId: source.profileId },
          }),
        ).toBe(0);
      } finally {
        await database.userRole.deleteMany({
          where: {
            userId: actorId,
            roleId: role.id,
            scopeType: "PROJECT",
            scopeId: otherProjectId,
          },
        });
      }
    });

    test("allows local assignment changes but requires all project permissions for shared profile changes", async (): Promise<void> => {
      const created = await request(app.getHttpServer())
        .post(`/management/projects/${projectId}/participants`)
        .auth(adminToken, { type: "bearer" })
        .send(newPerson("13800000888"))
        .expect(201);
      let person: ManagedParticipantResponse = created.body;
      await database.projectWorkerMember.create({
        data: {
          workerId: person.profileId,
          projectId: otherProjectId,
          projectRoleLabel: "木工作业",
          status: "ACTIVE",
          enteredAt: new Date("2026-10-01"),
        },
      });
      const rejected = await request(app.getHttpServer())
        .put(
          `/management/projects/${projectId}/participants/${person.memberId}`,
        )
        .auth(adminToken, { type: "bearer" })
        .send({ ...editPerson(person), workType: "电工" })
        .expect(403);
      expect(rejected.body.message).toBe(
        "SHARED_PROFILE_REQUIRES_ALL_PROJECT_PERMISSIONS",
      );
      const saved = await request(app.getHttpServer())
        .put(
          `/management/projects/${projectId}/participants/${person.memberId}`,
        )
        .auth(adminToken, { type: "bearer" })
        .send({ ...editPerson(person), teamId: secondTeamId })
        .expect(200);
      person = saved.body;
      expect(person.workType).toBe("木工");
      const role = await database.role.findUniqueOrThrow({
        where: { code: "PROJECT_ADMIN" },
      });
      await database.userRole.create({
        data: {
          userId: actorId,
          roleId: role.id,
          scopeType: "PROJECT",
          scopeId: otherProjectId,
        },
      });
      try {
        const updated = await request(app.getHttpServer())
          .put(
            `/management/projects/${projectId}/participants/${person.memberId}`,
          )
          .auth(adminToken, { type: "bearer" })
          .send({
            ...editPerson(person),
            workType: "电工",
            phone: "13800000889",
          })
          .expect(200);
        expect(updated.body.workType).toBe("电工");
        const shared = await request(app.getHttpServer())
          .get(
            `/management/projects/${otherProjectId}/participant-page?page=1&pageSize=50&search=13800000889`,
          )
          .auth(otherToken, { type: "bearer" })
          .expect(200);
        expect(shared.body.items).toHaveLength(1);
        expect(shared.body.items[0].profileId).toBe(person.profileId);
        expect(shared.body.items[0].workType).toBe("电工");
      } finally {
        await database.userRole.deleteMany({
          where: {
            userId: actorId,
            roleId: role.id,
            scopeType: "PROJECT",
            scopeId: otherProjectId,
          },
        });
      }
    });

    test("keeps company attendance results and schedules separate for profiles reused across projects", async (): Promise<void> => {
      const reportCompanyId: string = "cross-project-report-company";
      const reportProjectIds: readonly string[] = [
        "report-project-a",
        "report-project-b",
      ];
      await database.company.create({
        data: {
          id: reportCompanyId,
          name: "Report test company",
          status: "ACTIVE",
        },
      });
      const companyRole = await database.role.findUniqueOrThrow({
        where: { code: "COMPANY_ADMIN" },
      });
      await database.userRole.create({
        data: {
          userId: actorId,
          roleId: companyRole.id,
          scopeType: "COMPANY",
          scopeId: reportCompanyId,
        },
      });
      const worker = await database.workerProfile.create({
        data: {
          encryptedName: encryptPersonnelName(
            "跨项目报表工人",
            process.env.PERSONNEL_ENCRYPTION_KEY!,
            randomBytes(12),
          ),
          phone: "13800000991",
          workType: "木工",
          realNameStatus: "PENDING",
          faceProfileStatus: "PENDING",
          employmentStatus: "ACTIVE",
        },
      });
      const manager = await database.managerProfile.create({
        data: {
          name: "跨项目报表管理员",
          phone: "13800000992",
          status: "ACTIVE",
        },
      });
      for (const [index, reportProjectId] of reportProjectIds.entries()) {
        await database.project.create({
          data: {
            id: reportProjectId,
            companyId: reportCompanyId,
            name: reportProjectId,
            address: "Test site",
            centerLatitude: "31",
            centerLongitude: "121",
            geofenceRadiusM: 300,
            status: "ACTIVE",
            plannedStartDate: new Date("2026-01-01"),
          },
        });
        await database.projectWorkerMember.create({
          data: {
            projectId: reportProjectId,
            workerId: worker.id,
            projectRoleLabel: "木工",
            status: "ACTIVE",
            enteredAt: new Date("2026-01-01"),
            requiresAttendance: true,
          },
        });
        await database.projectManagerMember.create({
          data: {
            projectId: reportProjectId,
            managerId: manager.id,
            roleCode: "PROJECT_ADMIN",
            status: "ACTIVE",
            enteredAt: new Date("2026-01-01"),
            requiresAttendance: true,
          },
        });
        const shift = await database.shift.create({
          data: {
            projectId: reportProjectId,
            name: "Report test shift",
            isDefault: true,
            segments: { create: [{ sequence: 1, startTime: "08:00", endTime: "12:00", lateGraceMins: 0, earlyGraceMins: 0 }, { sequence: 2, startTime: "13:30", endTime: "17:30", lateGraceMins: 0, earlyGraceMins: 0 }] },
          },
        });
        await database.schedule.create({
          data: {
            shiftId: shift.id,
            ownerType: "PROJECT",
            ownerId: reportProjectId,
            startsOn: new Date("2026-01-01"),
            workdayMask: index === 0 ? 3 : 4,
          },
        });
        await database.attendanceResult.createMany({
          data: [
            {
              projectId: reportProjectId,
              attendanceDate: new Date("2026-10-05"),
              participantType: "WORKER",
              participantId: worker.id,
              workedMinutes: index === 0 ? 120 : 30,
              isAbsent: false,
              isLate: false,
              isEarlyLeave: false,
              isMissingPunch: false,
            },
            {
              projectId: reportProjectId,
              attendanceDate: new Date("2026-10-05"),
              participantType: "MANAGER",
              participantId: manager.id,
              workedMinutes: index === 0 ? 60 : 15,
              isAbsent: false,
              isLate: false,
              isEarlyLeave: false,
              isMissingPunch: false,
            },
          ],
        });
      }
      for (const period of [
        "daily?date=2026-10-05",
        "daily?date=2026-10-06",
        "weekly?weekStartDate=2026-10-05",
        "monthly?month=2026-10",
      ]) {
        const companyResponse = await request(app.getHttpServer())
          .get(`/reports/companies/${reportCompanyId}/${period}`)
          .auth(adminToken, { type: "bearer" })
          .expect(200);
        const companyReport:
          | DailyAttendanceReportResponse
          | RangeAttendanceReportResponse = companyResponse.body;
        const projects = await Promise.all(
          reportProjectIds.map((id) =>
            request(app.getHttpServer())
              .get(`/reports/projects/${id}/${period}`)
              .auth(adminToken, { type: "bearer" })
              .expect(200),
          ),
        );
        const reports: (
          | DailyAttendanceReportResponse
          | RangeAttendanceReportResponse
        )[] = projects.map((response) => response.body);
        for (const key of Object.keys(
          companyReport.totals,
        ) as (keyof AttendanceReportTotals)[])
          expect(companyReport.totals[key], `${period}: ${key}`).toBe(
            reports.reduce((sum, report) => sum + report.totals[key], 0),
          );
        expect(companyReport.participants).toHaveLength(4);
        for (const report of reports)
          for (const person of report.participants)
            expect(
              companyReport.participants.find(
                (row) => row.memberId === person.memberId,
              ),
            ).toEqual(person);
        if (period === "daily?date=2026-10-05") {
          expect(companyReport.totals.workedMinutes).toBe(225);
          expect(companyReport.totals.scheduledDays).toBe(2);
        }
        if (period === "daily?date=2026-10-06") {
          expect(companyReport.totals.absenceCount).toBe(2);
          expect(companyReport.totals.scheduledDays).toBe(2);
        }
      }
    });

    test("persists project settings and geofence changes with authorization and version checks", async (): Promise<void> => {
      const initial = await request(app.getHttpServer())
        .get(`/management/projects/${projectId}`)
        .auth(adminToken, { type: "bearer" })
        .expect(200);
      const project: ManagedProjectResponse = initial.body;
      const body = {
        ...project,
        expectedUpdatedAt: project.updatedAt,
        code: "WORKFLOW-01",
        contactName: "测试联系人",
        contactPhone: "13800000110",
        geofenceRadiusM: 500,
        centerLatitude: "31.2",
        remark: "Saved through HTTP",
      };
      const saved = await request(app.getHttpServer())
        .put(`/management/projects/${projectId}`)
        .auth(adminToken, { type: "bearer" })
        .send(body)
        .expect(200);
      expect(saved.body.geofenceRadiusM).toBe(500);
      expect(saved.body.contactName).toBe("测试联系人");
      const persisted = await database.project.findUniqueOrThrow({
        where: { id: projectId },
      });
      expect(persisted.code).toBe("WORKFLOW-01");
      expect(String(persisted.centerLatitude)).toBe("31.2");
      await database.project.update({
        where: { id: otherProjectId },
        data: { code: "WORKFLOW-02" },
      });
      const duplicate = await request(app.getHttpServer())
        .put(`/management/projects/${projectId}`)
        .auth(adminToken, { type: "bearer" })
        .send({
          ...saved.body,
          expectedUpdatedAt: saved.body.updatedAt,
          code: "WORKFLOW-02",
        })
        .expect(409);
      expect(duplicate.body.message).toBe("PROJECT_CODE_ALREADY_EXISTS");
      await request(app.getHttpServer())
        .put(`/management/projects/${projectId}`)
        .auth(adminToken, { type: "bearer" })
        .send(body)
        .expect(409);
      await request(app.getHttpServer())
        .put(`/management/projects/${projectId}`)
        .auth(otherToken, { type: "bearer" })
        .send(body)
        .expect(403);
      await request(app.getHttpServer())
        .put(`/management/projects/${projectId}`)
        .auth(adminToken, { type: "bearer" })
        .send({
          ...saved.body,
          expectedUpdatedAt: saved.body.updatedAt,
          companyId: "different-company",
        })
        .expect(400);
    });
  },
);
