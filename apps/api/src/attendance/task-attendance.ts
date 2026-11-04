import { summarizeScheduledAttendance } from "@construction/domain/attendance.js";
import {
  loadPlanningData,
  resolveAttendancePlan,
  chinaDate,
} from "./attendance-plans.js";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import type {
  AttendanceRecord,
  AttendanceResult,
  Prisma,
} from "@prisma/client";
import {
  parseTaskPoint,
  summarizeTaskAttendance,
  type TaskPunchKind,
  type TaskWorkInterval,
} from "@construction/domain";

export type TaskClockAssignment = Prisma.TeamTaskAssignmentGetPayload<{
  include: {
    task: { include: { team: { include: { project: true } } } };
    member: { include: { worker: true } };
  };
}>;
export type TaskPunchTarget = {
  readonly assignment: TaskClockAssignment;
  readonly kind: TaskPunchKind;
};
export const workerClockLock = async (
  db: Prisma.TransactionClient,
  userId: string,
): Promise<void> => {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`worker-clock-user:${userId}`}, 0))`;
};
export const ownTaskAssignment = async (
  db: Prisma.TransactionClient,
  projectId: string,
  userId: string,
  taskId: string,
): Promise<TaskClockAssignment> => {
  const row = await db.teamTaskAssignment.findFirst({
    where: { taskId, member: { projectId, worker: { userId } } },
    include: {
      task: { include: { team: { include: { project: true } } } },
      member: { include: { worker: true } },
    },
  });
  if (row === null)
    throw new ForbiddenException({
      message: "任务未分配给本人，不能进行该任务打卡。",
    });
  if (!row.member.taskAttendanceOnly)
    throw new BadRequestException({
      message: "此项目按常规排班考勤，请使用项目打卡入口，任务安排不重复计时。",
    });
  return row;
};
export const resolveTaskPunch = async (
  db: Prisma.TransactionClient,
  projectId: string,
  userId: string,
  code: string,
  now: Date,
): Promise<TaskPunchTarget> => {
  const point = parseTaskPoint(code);
  if (point === null)
    throw new BadRequestException({ message: "任务打卡时点无效。" });
  const row = await ownTaskAssignment(db, projectId, userId, point.taskId);
  if (
    row.member.status !== "ACTIVE" ||
    !row.member.requiresAttendance ||
    row.member.enteredAt > now ||
    (row.member.exitedAt !== null && row.member.exitedAt <= now) ||
    row.member.teamId !== row.task.teamId ||
    row.member.worker.employmentStatus !== "ACTIVE" ||
    row.task.team.status !== "ACTIVE" ||
    row.task.team.project.status !== "ACTIVE"
  )
    throw new ForbiddenException({
      message: "成员或任务所在工地已停用，不能新增打卡。",
    });
  if (
    row.task.status !== "OPEN" ||
    row.exitConfirmedAt !== null ||
    row.finishedAt !== null
  )
    throw new ConflictException({
      message: "任务已结束或已退场，请刷新任务记录。",
    });
  if (point.kind === "START") {
    if (row.startedAt !== null)
      throw new ConflictException({ message: "已经开工，请使用完工打卡。" });
    if (now < row.task.startsAt || now >= row.task.endsAt)
      throw new BadRequestException({
        message: "当前不在任务的计划作业时间内，请联系班组长调整安排。",
      });
    await assertNoOpenScheduledWork(db, row.member.workerId, now);
    const open = await db.teamTaskAssignment.findFirst({
      where: {
        startedAt: { not: null },
        finishedAt: null,
        member: { workerId: row.member.workerId },
      },
    });
    if (open !== null)
      throw new ConflictException({
        message: "还有未完成的计时任务，请先完工打卡，避免重复计工。",
      });
  } else {
    if (row.startedAt === null)
      throw new BadRequestException({
        message: "尚未开工，不能直接完工打卡。",
      });
    if (
      now <= row.startedAt ||
      now.getTime() - row.startedAt.getTime() > 86400000
    )
      throw new BadRequestException({
        message:
          "实际作业时间异常，请联系班组长核实缺卡；不会自动计算超长工时。",
      });
  }
  return { assignment: row, kind: point.kind };
};
export const taskInterval = (row: {
  startedAt: Date | null;
  finishedAt: Date | null;
  task: { startsAt: Date; endsAt: Date; status: string };
}): TaskWorkInterval => ({
  startsAt: row.task.startsAt,
  endsAt: row.task.endsAt,
  startedAt: row.startedAt,
  finishedAt: row.finishedAt,
  cancelled: row.task.status === "CANCELLED",
});
export const taskDayWhere = (
  memberIds: readonly string[],
  date: string,
): Prisma.TeamTaskAssignmentWhereInput => {
  const start: Date = new Date(`${date}T00:00:00+08:00`);
  const end: Date = new Date(start.getTime() + 86400000);
  return {
    memberId: { in: [...memberIds] },
    OR: [
      { task: { startsAt: { lt: end }, endsAt: { gt: start } } },
      {
        startedAt: { lt: end },
        OR: [{ finishedAt: null }, { finishedAt: { gt: start } }],
      },
    ],
  };
};
export const recalculateTaskResult = async (
  db: Prisma.TransactionClient,
  memberId: string,
  projectId: string,
  workerId: string,
  date: string,
  now: Date,
): Promise<AttendanceResult> => {
  const rows = await db.teamTaskAssignment.findMany({
    where: taskDayWhere([memberId], date),
    include: { task: true },
  });
  const summary = summarizeTaskAttendance(rows.map(taskInterval), date, now);
  const abnormalRecordCount = await db.attendanceRecord.count({
    where: {
      projectId,
      participantId: workerId,
      participantType: "WORKER",
      attendanceDate: new Date(date),
      status: "INVALID",
    },
  });
  const approvedMakeupCount = await db.makeupRequest.count({
    where: {
      projectId,
      participantId: workerId,
      participantType: "WORKER",
      attendanceDate: new Date(date),
      status: "APPROVED",
    },
  });
  const values = {
    workedMinutes: summary.workedMinutes,
    isLate: false,
    isEarlyLeave: false,
    isMissingPunch: summary.isMissingPunch,
    isAbsent: summary.isAbsent,
    abnormalRecordCount,
    approvedMakeupCount,
    calculatedAt: now,
  };
  return db.attendanceResult.upsert({
    where: {
      projectId_attendanceDate_participantType_participantId: {
        projectId,
        participantType: "WORKER",
        participantId: workerId,
        attendanceDate: new Date(date),
      },
    },
    create: {
      ...values,
      projectId,
      participantType: "WORKER",
      participantId: workerId,
      attendanceDate: new Date(date),
    },
    update: values,
  });
};
export const applyTaskPunch = async (
  db: Prisma.TransactionClient,
  target: TaskPunchTarget,
  record: AttendanceRecord,
): Promise<void> => {
  if (record.status !== "VALID") return;
  await db.teamTaskAssignment.update({
    where: { id: target.assignment.id },
    data:
      target.kind === "START"
        ? { startedAt: record.occurredAt }
        : { finishedAt: record.occurredAt },
  });
};

/** A missing finish requires supervisor approval; it never substitutes for an unrecorded start. */
export const resolveTaskMakeup = async (
  db: Prisma.TransactionClient,
  projectId: string,
  userId: string,
  code: string,
  finishedAt: Date,
): Promise<TaskClockAssignment> => {
  const point = parseTaskPoint(code);
  if (point === null || point.kind !== "END")
    throw new BadRequestException({
      message: "临时任务仅支持已开工后的完工补卡。",
    });
  await workerClockLock(db, userId);
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`team-task:${point.taskId}`}))`;
  const row = await ownTaskAssignment(db, projectId, userId, point.taskId);
  if (
    row.task.status !== "OPEN" ||
    row.member.teamId !== row.task.teamId ||
    row.exitConfirmedAt !== null ||
    row.finishedAt !== null
  )
    throw new ConflictException({
      message: "任务或人员状态已变化，不能补完工。",
    });
  if (
    row.startedAt === null ||
    finishedAt <= row.startedAt ||
    finishedAt.getTime() - row.startedAt.getTime() > 86400000 ||
    finishedAt.getTime() > Date.now()
  )
    throw new BadRequestException({
      message:
        "请填写开工后 24 小时内实际发生的完工时间；没有开工记录不能补完工。",
    });
  return row;
};

export const assertNoOpenTask = async (
  db: Prisma.TransactionClient,
  workerId: string,
): Promise<void> => {
  const open = await db.teamTaskAssignment.findFirst({
    where: { startedAt: { not: null }, finishedAt: null, member: { workerId } },
  });
  if (open !== null)
    throw new ConflictException({
      message: "还有未完工的临时任务，请先完工打卡后再开始其他工作。",
    });
};
export const assertNoOpenScheduledWork = async (
  db: Prisma.TransactionClient,
  workerId: string,
  now: Date,
): Promise<void> => {
  const members = await db.projectWorkerMember.findMany({
    where: {
      workerId,
      taskAttendanceOnly: false,
      requiresAttendance: true,
      status: "ACTIVE",
    },
    include: { worker: true },
  });
  if (members.length === 0) return;
  const date: string = chinaDate(now);
  const planning = await loadPlanningData(
    db,
    members.map((member) => member.projectId),
  );
  for (const member of members) {
    const where = {
      projectId: member.projectId,
      participantType: "WORKER" as const,
      participantId: workerId,
      attendanceDate: new Date(date),
    };
    const [records, makeups] = await Promise.all([
      db.attendanceRecord.findMany({ where }),
      db.makeupRequest.findMany({ where: { ...where, status: "APPROVED" } }),
    ]);
    const plan = resolveAttendancePlan(
      planning,
      member.projectId,
      {
        memberId: member.id,
        participantId: workerId,
        teamId: member.teamId,
        roleLevel: 1,
        userId: member.worker.userId,
      },
      date,
    );
    const summary = summarizeScheduledAttendance(
      plan.points,
      date,
      [
        ...records.map((row) => ({
          id: row.id,
          pointCode: row.pointCode,
          occurredAt: row.occurredAt,
          isValid: row.status === "VALID",
          source: row.source,
        })),
        ...makeups.map((row) => ({
          id: row.id,
          pointCode: row.pointCode,
          occurredAt: row.requestedOccurredAt,
          isValid: true,
          source: "MAKEUP" as const,
        })),
      ],
      now,
    );
    let startCode: string | null = null;
    for (const point of plan.points) {
      if (point.kind === "START") startCode = point.code;
      if (point.kind === "END" && startCode !== null) {
        if (
          summary.selectedRecords[startCode] !== undefined &&
          summary.selectedRecords[point.code] === undefined
        )
          throw new ConflictException({
            message:
              "其他项目还有未下班的常规考勤，请先结束该段工作，避免重复计工。",
          });
        startCode = null;
      }
    }
  }
};
