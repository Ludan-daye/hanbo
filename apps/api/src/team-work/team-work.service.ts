import {
  loadPlanningData,
  resolveTeamAttendancePlan,
} from "../attendance/attendance-plans.js";
import { workerClockLock } from "../attendance/task-attendance.js";
import { synchronizeMembershipGrants } from "../management/membership-roles.js";
import { readDailySnapshot } from "./team-daily-snapshot.js";
import { lockSafetyDay } from "../attendance/attendance-safety.service.js";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma, Team } from "@prisma/client";
import type {
  SafetyBriefing,
  SafetyBriefingInput,
  SafetyIssue,
  SafetyIssueInput,
  SafetyIssuePage,
  TeamDailySummary,
  TeamTask,
  TeamTaskInput,
  TeamTaskDetails,
  TeamTaskDefaults,
  TeamTaskTemplatePage,
  TeamTaskWorker,
} from "@construction/domain";

import { API_ENV } from "../config/env.module.js";
import type { ApiEnv } from "../config/env.js";
import { PrismaService } from "../infrastructure/database/prisma.service.js";
import { decryptPersonnelName } from "../management/personnel-name.js";
import { ReportsService } from "../reports/reports.service.js";

export const dayBounds = (day: string): { startsAt: Date; endsAt: Date } => {
  const startsAt: Date = new Date(`${day}T00:00:00+08:00`);
  return { startsAt, endsAt: new Date(startsAt.getTime() + 86400000) };
};
export const requireActiveTeam = async (
  db: Prisma.TransactionClient,
  teamId: string,
): Promise<Team> => {
  const team = await db.team.findFirst({
    where: {
      id: teamId,
      status: "ACTIVE",
      project: { status: "ACTIVE", company: { status: "ACTIVE" } },
    },
  });
  if (team === null)
    throw new BadRequestException({
      message: "班组或项目已停用，暂不能安排工作。",
      teamId,
    });
  return team;
};
const validMemberWhere = (
  teamId: string,
  now: Date,
): Prisma.ProjectWorkerMemberWhereInput => ({
  teamId,
  status: "ACTIVE",
  enteredAt: { lte: now },
  OR: [{ exitedAt: null }, { exitedAt: { gt: now } }],
  worker: { employmentStatus: "ACTIVE" },
});

@Injectable()
export class TeamWorkService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(ReportsService) private readonly reports: ReportsService,
  ) {}

  private name(encrypted: string): string {
    return decryptPersonnelName(encrypted, this.env.PERSONNEL_ENCRYPTION_KEY);
  }

  async assignableWorkers(teamId: string): Promise<readonly TeamTaskWorker[]> {
    const team = await requireActiveTeam(this.db, teamId);
    const rows = await this.db.projectWorkerMember.findMany({
      where: {
        ...validMemberWhere(teamId, new Date()),
        projectId: team.projectId,
      },
      include: { worker: true, project: { select: { name: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => ({
      memberId: row.id,
      name: this.name(row.worker.encryptedName),
      workType: row.worker.workType,
      phoneMasked:
        row.worker.phone.length === 11
          ? `${row.worker.phone.slice(0, 3)}****${row.worker.phone.slice(-4)}`
          : "手机号待完善",
      projectId: row.projectId,
      projectName: row.project.name,
      teamId,
      teamName: team.name,
    }));
  }

  async taskDefaults(teamId: string, date: string): Promise<TeamTaskDefaults> {
    const team = await requireActiveTeam(this.db, teamId);
    const data = await loadPlanningData(this.db, [team.projectId]);
    return {
      workType: team.workType ?? "",
      ...resolveTeamAttendancePlan(data, team.projectId, teamId, date),
    };
  }

  async taskTemplates(
    teamId: string,
    cursor: string | undefined,
    search: string,
  ): Promise<TeamTaskTemplatePage> {
    await requireActiveTeam(this.db, teamId);
    if (
      cursor !== undefined &&
      !(await this.db.teamWorkTask.findFirst({ where: { id: cursor, teamId } }))
    )
      throw new BadRequestException({
        message: "历史安排分页已失效，请重新读取。",
        teamId,
      });
    if (search.length > 80)
      throw new BadRequestException({ message: "搜索内容不能超过 80 个字。" });
    const rows = await this.db.teamWorkTask.findMany({
      where: {
        teamId,
        ...(search
          ? {
              OR: ["title", "description", "workType"].map((field) => ({
                [field]: { contains: search, mode: "insensitive" },
              })),
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 31,
      ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
      include: {
        assignments: {
          select: {
            memberId: true,
            source: true,
            member: { select: { taskAttendanceOnly: true } },
          },
        },
      },
    });
    return {
      items: rows.slice(0, 30).map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        workType: row.workType,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        memberIds: row.assignments
          .filter(
            (assignment) =>
              assignment.source === "ASSIGNED" &&
              !assignment.member.taskAttendanceOnly,
          )
          .map((assignment) => assignment.memberId),
        previousMemberCount: row.assignments.length,
      })),
      nextCursor: rows.length > 30 ? rows[29]!.id : null,
    };
  }

  async addTaskMembers(
    teamId: string,
    taskId: string,
    actor: string,
    memberIds: readonly string[],
  ): Promise<TeamTask> {
    await this.db.$transaction(async (tx) => {
      const team = await requireActiveTeam(tx, teamId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`team-task:${taskId}`}))`;
      const task = await tx.teamWorkTask.findFirst({
        where: { id: taskId, teamId },
        include: { assignments: true },
      });
      if (task === null)
        throw new NotFoundException({ message: "该班组没有此工作安排。" });
      if (task.status !== "OPEN" || task.endsAt <= new Date())
        throw new ConflictException({
          message: "任务已经结束，不能继续安排人员。",
        });
      for (const memberId of [...memberIds].sort()) {
        await tx.$executeRaw`SELECT id FROM project_worker_members WHERE id = ${memberId} FOR UPDATE`;
      }
      const count = await tx.projectWorkerMember.count({
        where: {
          ...validMemberWhere(teamId, new Date()),
          projectId: team.projectId,
          id: { in: [...memberIds] },
        },
      });
      if (count !== memberIds.length)
        throw new BadRequestException({
          message: "只能选择当前项目、本班组在场的工人，请刷新人员列表。",
        });
      const added = memberIds.filter(
        (id) => !task.assignments.some((row) => row.memberId === id),
      );
      if (task.assignments.length + added.length > 200)
        throw new BadRequestException({
          message: "单个任务最多安排 200 人，请拆分任务。",
        });
      if (added.length === 0) return;
      await tx.teamTaskAssignment.createMany({
        data: added.map((memberId) => ({
          taskId,
          memberId,
          source: "ASSIGNED",
        })),
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor,
          action: "TEAM_TASK_MEMBERS_ADDED",
          entityType: "TeamWorkTask",
          entityId: taskId,
          metadata: { teamId, projectId: team.projectId, memberIds: added },
        },
      });
    });
    return (await this.tasks({ id: taskId, teamId }))[0]!;
  }

  async tasks(
    where: Prisma.TeamWorkTaskWhereInput,
  ): Promise<readonly TeamTask[]> {
    const rows = await this.db.teamWorkTask.findMany({
      where,
      include: {
        team: { include: { project: true } },
        assignments: { include: { member: { include: { worker: true } } } },
      },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      take: 500,
    });
    const users = await this.db.user.findMany({
      where: {
        id: { in: [...new Set(rows.map((row) => row.createdByUserId))] },
      },
      select: { id: true, encryptedRealName: true },
    });
    return rows.map((row): TeamTask => {
      if (!["OPEN", "COMPLETED", "CANCELLED"].includes(row.status))
        throw new Error(`Invalid team task status for ${row.id}`);
      const creator = users.find((user) => user.id === row.createdByUserId);
      return {
        id: row.id,
        title: row.title,
        description: row.description,
        workType: row.workType,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        status: row.status as TeamTask["status"],
        teamId: row.teamId,
        teamName: row.team.name,
        projectId: row.team.projectId,
        projectName: row.team.project.name,
        supervisorName: creator?.encryptedRealName
          ? this.name(creator.encryptedRealName)
          : "原负责人账号已不可用",
        assignments: row.assignments.map((assignment) => ({
          memberId: assignment.memberId,
          name: this.name(assignment.member.worker.encryptedName),
          source: assignment.source,
          taskAttendanceOnly: assignment.member.taskAttendanceOnly,
          startedAt: assignment.startedAt?.toISOString() ?? null,
          finishedAt: assignment.finishedAt?.toISOString() ?? null,
          workedMinutes:
            assignment.startedAt === null || assignment.finishedAt === null
              ? 0
              : Math.floor(
                  (assignment.finishedAt.getTime() -
                    assignment.startedAt.getTime()) /
                    60000,
                ),
          exitConfirmedAt: assignment.exitConfirmedAt?.toISOString() ?? null,
        })),
      };
    });
  }

  async listTasks(teamId: string, day: string): Promise<readonly TeamTask[]> {
    const range = dayBounds(day);
    return this.tasks({
      teamId,
      OR: [
        { startsAt: { lt: range.endsAt }, endsAt: { gt: range.startsAt } },
        {
          assignments: {
            some: {
              startedAt: { lt: range.endsAt },
              OR: [
                { finishedAt: null },
                { finishedAt: { gt: range.startsAt } },
              ],
            },
          },
        },
      ],
    });
  }

  async createTask(
    teamId: string,
    actor: string,
    input: TeamTaskInput,
  ): Promise<TeamTask> {
    const id: string = await this.db.$transaction(async (tx) => {
      const team = await requireActiveTeam(tx, teamId);
      if (new Date(input.endsAt).getTime() <= Date.now())
        throw new BadRequestException({
          message: "结束时间已过去，请重新安排任务。",
        });
      for (const memberId of [...input.memberIds].sort()) {
        await tx.$executeRaw`SELECT id FROM project_worker_members WHERE id = ${memberId} FOR UPDATE`;
      }
      const members = await tx.projectWorkerMember.count({
        where: {
          ...validMemberWhere(teamId, new Date()),
          projectId: team.projectId,
          id: { in: [...input.memberIds] },
        },
      });
      if (members !== input.memberIds.length)
        throw new BadRequestException({
          message: "只能安排本班组在场的工人，请刷新人员列表。",
        });
      const task = await tx.teamWorkTask.create({
        data: {
          teamId,
          title: input.title,
          description: input.description,
          workType: input.workType,
          startsAt: new Date(input.startsAt),
          endsAt: new Date(input.endsAt),
          createdByUserId: actor,
          assignments: {
            create: input.memberIds.map((memberId) => ({
              memberId,
              source: "ASSIGNED",
            })),
          },
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor,
          action: "TEAM_TASK_CREATED",
          entityType: "TeamWorkTask",
          entityId: task.id,
          metadata: { teamId, memberCount: members },
        },
      });
      return task.id;
    });
    return (await this.tasks({ id }))[0]!;
  }

  async updateTask(
    teamId: string,
    taskId: string,
    actor: string,
    input: TeamTaskDetails,
  ): Promise<TeamTask> {
    await this.db.$transaction(async (tx) => {
      await requireActiveTeam(tx, teamId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`team-task:${taskId}`}))`;
      const task = await tx.teamWorkTask.findFirst({
        where: { id: taskId, teamId },
        include: {
          assignments: { include: { _count: { select: { records: true } } } },
        },
      });
      if (task === null)
        throw new NotFoundException({ message: "该班组没有此工作安排。" });
      if (
        task.status !== "OPEN" ||
        task.assignments.some(
          (row) => row.startedAt !== null || row._count.records > 0,
        )
      )
        throw new ConflictException({
          message: "已有实际开工记录或任务已结束，不能修改安排。",
        });
      if (new Date(input.endsAt).getTime() <= Date.now())
        throw new BadRequestException({
          message: "结束时间已过去，请重新安排任务。",
        });
      await tx.teamWorkTask.update({
        where: { id: taskId },
        data: {
          ...input,
          startsAt: new Date(input.startsAt),
          endsAt: new Date(input.endsAt),
        },
      });
      await tx.temporaryTaskInvitation.updateMany({
        where: { taskId, status: "PENDING" },
        data: { status: "REVOKED" },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor,
          action: "TEAM_TASK_UPDATED",
          entityType: "TeamWorkTask",
          entityId: taskId,
          metadata: {
            teamId,
            before: {
              title: task.title,
              description: task.description,
              workType: task.workType,
              startsAt: task.startsAt.toISOString(),
              endsAt: task.endsAt.toISOString(),
            },
            after: input,
          },
        },
      });
    });
    return (await this.tasks({ id: taskId, teamId }))[0]!;
  }

  async removeTaskMember(
    teamId: string,
    taskId: string,
    memberId: string,
    actor: string,
  ): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await requireActiveTeam(tx, teamId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`team-task:${taskId}`}))`;
      const row = await tx.teamTaskAssignment.findFirst({
        where: { taskId, memberId, task: { teamId } },
        include: {
          task: true,
          member: { include: { worker: true } },
          _count: { select: { records: true } },
        },
      });
      if (row === null)
        throw new NotFoundException({
          message: "该任务未安排此工人，请刷新列表。",
        });
      if (
        row.task.status !== "OPEN" ||
        row.startedAt !== null ||
        row._count.records > 0
      )
        throw new ConflictException({
          message: "已有实际开工记录或任务已结束，不能撤下人员。",
        });
      await tx.teamTaskAssignment.delete({ where: { id: row.id } });
      if (row.member.worker.userId !== null)
        await tx.temporaryTaskInvitation.updateMany({
          where: {
            taskId,
            acceptedByUserId: row.member.worker.userId,
            status: "ACCEPTED",
          },
          data: { status: "REVOKED" },
        });
      await tx.auditLog.create({
        data: {
          actorUserId: actor,
          action: "TEAM_TASK_MEMBER_REMOVED",
          entityType: "TeamWorkTask",
          entityId: taskId,
          metadata: { teamId, memberId, source: row.source },
        },
      });
    });
  }

  async closeTask(
    teamId: string,
    taskId: string,
    actor: string,
    status: "COMPLETED" | "CANCELLED",
  ): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await requireActiveTeam(tx, teamId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`team-task:${taskId}`}))`;
      const running = await tx.teamTaskAssignment.count({
        where: {
          taskId,
          startedAt: { not: null },
          ...(status === "COMPLETED" ? { finishedAt: null } : {}),
        },
      });
      if (running > 0)
        throw new ConflictException({
          message:
            status === "COMPLETED"
              ? "还有工人未完工打卡，请先核实工时再结束任务。"
              : "已有实际开工作业的任务不能取消，请核实后正常完工。",
        });
      const result = await tx.teamWorkTask.updateMany({
        where: { id: taskId, teamId, status: "OPEN" },
        data: { status },
      });
      if (result.count !== 1)
        throw new ConflictException({
          message: "任务不存在或已经结束，请刷新列表。",
        });
      await tx.temporaryTaskInvitation.updateMany({
        where: { taskId, status: "PENDING" },
        data: { status: "REVOKED" },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor,
          action: "TEAM_TASK_CLOSED",
          entityType: "TeamWorkTask",
          entityId: taskId,
          metadata: { teamId, status },
        },
      });
    });
  }

  async confirmTaskExit(
    teamId: string,
    taskId: string,
    memberId: string,
    actor: string,
  ): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const row = await tx.teamTaskAssignment.findUnique({
        where: { taskId_memberId: { taskId, memberId } },
        include: {
          task: true,
          member: {
            include: { worker: true, additionalRoles: true, ledTeams: true },
          },
        },
      });
      if (
        row === null ||
        row.task.teamId !== teamId ||
        row.member.teamId !== teamId
      )
        throw new ForbiddenException({
          message: "只能办理本班任务工人的退场。",
        });
      if (row.member.worker.userId === null)
        throw new ConflictException({
          message: "人员绑定已变化，请刷新后重试。",
        });
      await workerClockLock(tx, row.member.worker.userId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`team-task:${taskId}`}))`;
      await tx.$executeRaw`SELECT id FROM project_worker_members WHERE id = ${memberId} FOR UPDATE`;
      const fresh = await tx.teamTaskAssignment.findUniqueOrThrow({
        where: { id: row.id },
        include: {
          member: { include: { additionalRoles: true, ledTeams: true } },
        },
      });
      if (fresh.exitConfirmedAt !== null) return;
      if (fresh.member.teamId !== teamId || fresh.member.status !== "ACTIVE")
        throw new ConflictException({
          message: "人员所属班组或状态已变化，请刷新。",
        });
      if (
        !fresh.member.taskAttendanceOnly ||
        fresh.member.projectRoleLabel !== "WORKER" ||
        fresh.member.additionalRoles.length > 0 ||
        fresh.member.ledTeams.length > 0
      )
        throw new ForbiddenException({
          message: "此人员不是单纯临时工，请项目管理员办理人员变更。",
        });
      if (fresh.finishedAt === null)
        throw new ConflictException({
          message: "请先完成完工打卡或核实缺卡，不能提前退场。",
        });
      const remaining = await tx.teamTaskAssignment.count({
        where: {
          memberId,
          id: { not: row.id },
          task: { status: "OPEN" },
          finishedAt: null,
        },
      });
      if (remaining > 0)
        throw new ConflictException({
          message: "此人还有未结束的任务，请先处理后再办理退场。",
        });
      const now: Date = new Date();
      await tx.projectWorkerMember.update({
        where: { id: memberId },
        data: { status: "EXITED", exitedAt: now },
      });
      await tx.teamTaskAssignment.update({
        where: { id: row.id },
        data: { exitConfirmedAt: now, exitConfirmedByUserId: actor },
      });
      await synchronizeMembershipGrants(
        tx,
        row.member.worker.userId,
        [
          {
            roleCode: "WORKER",
            scopeType: "PROJECT",
            scopeId: row.member.projectId,
          },
        ],
        [],
      );
      await tx.auditLog.create({
        data: {
          actorUserId: actor,
          action: "TEMPORARY_WORKER_EXIT_CONFIRMED",
          entityType: "ProjectWorkerMember",
          entityId: memberId,
          metadata: { taskId, teamId, assignmentId: row.id },
        },
      });
    });
  }

  async myTasks(userId: string, day: string): Promise<readonly TeamTask[]> {
    const range = dayBounds(day);
    const tasks = await this.tasks({
      OR: [
        { startsAt: { lt: range.endsAt }, endsAt: { gt: range.startsAt } },
        ...(day ===
        new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
          ? [
              {
                assignments: {
                  some: {
                    startedAt: { not: null },
                    finishedAt: null,
                    member: { worker: { userId } },
                  },
                },
              },
            ]
          : []),
      ],
      assignments: { some: { member: { worker: { userId } } } },
    });
    const ownMembers = await this.db.projectWorkerMember.findMany({
      where: { worker: { userId } },
      select: { id: true },
    });
    const ids = new Set(ownMembers.map((member) => member.id));
    return tasks.map((task) => ({
      ...task,
      assignments: task.assignments.filter((assignment) =>
        ids.has(assignment.memberId),
      ),
    }));
  }

  async briefings(
    where: Prisma.TeamSafetyBriefingWhereInput,
    userId: string,
  ): Promise<readonly SafetyBriefing[]> {
    const rows = await this.db.teamSafetyBriefing.findMany({
      where,
      include: {
        team: { include: { project: true } },
        acknowledgements: {
          include: { member: { include: { worker: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return rows.map((row) => ({
      id: row.id,
      teamId: row.teamId,
      teamName: row.team.name,
      projectName: row.team.project.name,
      workDate: row.workDate.toISOString().slice(0, 10),
      title: row.title,
      content: row.content,
      acknowledged: row.acknowledgements.some((ack) => ack.userId === userId),
      acknowledgements: row.acknowledgements.map((ack) => ({
        memberId: ack.memberId,
        name: this.name(ack.member.worker.encryptedName),
        acknowledgedAt: ack.acknowledgedAt.toISOString(),
      })),
    }));
  }

  async publishBriefing(
    teamId: string,
    actor: string,
    input: SafetyBriefingInput,
  ): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await requireActiveTeam(tx, teamId);
      await lockSafetyDay(tx, teamId, input.workDate);
      const row = await tx.teamSafetyBriefing.create({
        data: {
          teamId,
          createdByUserId: actor,
          title: input.title,
          content: input.content,
          workDate: new Date(input.workDate),
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor,
          action: "TEAM_SAFETY_PUBLISHED",
          entityType: "TeamSafetyBriefing",
          entityId: row.id,
          metadata: { teamId },
        },
      });
    });
  }

  async myBriefings(
    userId: string,
    day: string,
  ): Promise<readonly SafetyBriefing[]> {
    const memberships = await this.db.projectWorkerMember.findMany({
      where: {
        status: "ACTIVE",
        worker: { userId, employmentStatus: "ACTIVE" },
        enteredAt: { lte: new Date() },
        OR: [{ exitedAt: null }, { exitedAt: { gt: new Date() } }],
      },
      select: { teamId: true },
    });
    const rows = await this.briefings(
      {
        teamId: {
          in: memberships.flatMap((member) =>
            member.teamId === null ? [] : [member.teamId],
          ),
        },
        workDate: new Date(day),
      },
      userId,
    );
    return rows.map((row) => ({ ...row, acknowledgements: [] }));
  }

  async acknowledge(briefingId: string, userId: string): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const briefing = await tx.teamSafetyBriefing.findUnique({
        where: { id: briefingId },
      });
      if (briefing === null)
        throw new NotFoundException({ message: "安全交底不存在。" });
      await requireActiveTeam(tx, briefing.teamId);
      const member = await tx.projectWorkerMember.findFirst({
        where: {
          ...validMemberWhere(briefing.teamId, new Date()),
          worker: { userId, employmentStatus: "ACTIVE" },
        },
      });
      if (member === null)
        throw new ForbiddenException({
          message: "只能确认本人所在班组的交底。",
        });
      await tx.teamSafetyAcknowledgement.upsert({
        where: { briefingId_memberId: { briefingId, memberId: member.id } },
        create: { briefingId, memberId: member.id, userId },
        update: {},
      });
    });
  }

  async issues(teamId: string, day: string): Promise<readonly SafetyIssue[]> {
    return this.readIssues({ teamId, workDate: new Date(day) }, null, 500);
  }

  async openIssues(
    teamId: string,
    cursor: string | null,
  ): Promise<SafetyIssuePage> {
    const rows = await this.readIssues(
      { teamId, resolvedAt: null },
      cursor,
      51,
    );
    return {
      items: rows.slice(0, 50),
      nextCursor: rows.length > 50 ? rows[49]!.id : null,
    };
  }

  private async readIssues(
    where: Prisma.TeamSafetyIssueWhereInput,
    cursor: string | null,
    take: number,
  ): Promise<readonly SafetyIssue[]> {
    const rows = await this.db.teamSafetyIssue.findMany({
      where,
      include: { member: { include: { worker: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      ...(cursor === null ? {} : { cursor: { id: cursor }, skip: 1 }),
    });
    return rows.map((row) => {
      if (row.severity !== "GENERAL" && row.severity !== "SERIOUS")
        throw new Error(`Invalid safety severity for ${row.id}`);
      return {
        id: row.id,
        workDate: row.workDate.toISOString().slice(0, 10),
        memberId: row.memberId,
        memberName:
          row.member === null
            ? null
            : this.name(row.member.worker.encryptedName),
        description: row.description,
        severity: row.severity,
        resolution: row.resolution,
        resolvedAt: row.resolvedAt?.toISOString() ?? null,
      };
    });
  }

  async recordIssue(
    teamId: string,
    actor: string,
    input: SafetyIssueInput,
  ): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await requireActiveTeam(tx, teamId);
      if (
        input.memberId !== null &&
        !(await tx.projectWorkerMember.findFirst({
          where: {
            ...validMemberWhere(teamId, new Date()),
            id: input.memberId,
          },
        }))
      )
        throw new BadRequestException({
          message: "隐患关联人员必须属于本班组。",
        });
      const issue = await tx.teamSafetyIssue.create({
        data: {
          ...input,
          teamId,
          workDate: new Date(input.workDate),
          createdByUserId: actor,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor,
          action: "TEAM_SAFETY_ISSUE_CREATED",
          entityType: "TeamSafetyIssue",
          entityId: issue.id,
          metadata: { teamId },
        },
      });
    });
  }

  async resolveIssue(
    teamId: string,
    issueId: string,
    actor: string,
    resolution: string,
  ): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await requireActiveTeam(tx, teamId);
      const result = await tx.teamSafetyIssue.updateMany({
        where: { id: issueId, teamId, resolvedAt: null },
        data: { resolution, resolvedAt: new Date(), resolvedByUserId: actor },
      });
      if (result.count !== 1)
        throw new ConflictException({
          message: "记录不存在或已关闭，请刷新后查看。",
        });
      await tx.auditLog.create({
        data: {
          actorUserId: actor,
          action: "TEAM_SAFETY_ISSUE_RESOLVED",
          entityType: "TeamSafetyIssue",
          entityId: issueId,
          metadata: { teamId },
        },
      });
    });
  }

  async daily(teamId: string, day: string): Promise<TeamDailySummary> {
    const team = await this.db.team.findUnique({
      where: { id: teamId },
      include: { project: true },
    });
    if (team === null) throw new NotFoundException({ message: "班组不存在。" });
    const [tasks, attendance, briefings, issues] = await Promise.all([
      this.listTasks(teamId, day),
      this.reports.getTeamDailyReport(teamId, day),
      this.briefings({ teamId, workDate: new Date(day) }, ""),
      this.issues(teamId, day),
    ]);
    return {
      teamId,
      teamName: team.name,
      projectName: team.project.name,
      workDate: day,
      generatedAt: new Date().toISOString(),
      taskCount: tasks.length,
      completedTaskCount: tasks.filter((task) => task.status === "COMPLETED")
        .length,
      cancelledTaskCount: tasks.filter((task) => task.status === "CANCELLED")
        .length,
      temporaryWorkerCount: new Set(
        tasks
          .filter((task) => task.status !== "CANCELLED")
          .flatMap((task) =>
            task.assignments
              .filter((assignment) => assignment.source === "TEMPORARY_INVITE")
              .map((assignment) => assignment.memberId),
          ),
      ).size,
      briefingCount: briefings.length,
      acknowledgementCount: briefings.reduce(
        (sum, row) => sum + row.acknowledgements.length,
        0,
      ),
      openIssueCount: issues.filter((issue) => issue.resolvedAt === null)
        .length,
      resolvedIssueCount: issues.filter((issue) => issue.resolvedAt !== null)
        .length,
      actualAttendedDays: attendance.totals.actualAttendedDays,
      workedMinutes: attendance.totals.workedMinutes,
      missingPunchCount: attendance.totals.missingPunchCount,
      tasks,
      people: attendance.participants.map((person) => ({
        name: person.displayName ?? "姓名待核实",
        workedMinutes: person.workedMinutes,
        flags: [
          person.isLate ? "迟到" : "",
          person.isEarlyLeave ? "早退" : "",
          person.isMissingPunch ? "缺卡" : "",
          person.isAbsent ? "缺勤" : "",
        ].filter(Boolean),
      })),
    };
  }

  async savedDaily(
    teamId: string,
    day: string,
  ): Promise<TeamDailySummary | null> {
    const row = await this.db.teamDailyLog.findUnique({
      where: { teamId_workDate: { teamId, workDate: new Date(day) } },
    });
    return row === null ? null : readDailySnapshot(row.snapshot, teamId, day);
  }

  async saveDaily(
    teamId: string,
    day: string,
    actor: string,
  ): Promise<TeamDailySummary> {
    const summary = await this.daily(teamId, day);
    const snapshot: Prisma.InputJsonValue = JSON.parse(
      JSON.stringify(summary),
    ) as Prisma.InputJsonValue;
    await this.db.teamDailyLog.upsert({
      where: { teamId_workDate: { teamId, workDate: new Date(day) } },
      create: {
        teamId,
        workDate: new Date(day),
        snapshot,
        generatedByUserId: actor,
      },
      update: { snapshot, generatedByUserId: actor, generatedAt: new Date() },
    });
    return summary;
  }
}
