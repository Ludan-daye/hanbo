import {
  parseTaskPoint,
  summarizeTaskAttendance,
  taskPointCode,
  type TeamTask,
} from "@construction/domain";
import { ApiError } from "../apiClient";
import type { ProjectParticipant } from "../management.types";
import type {
  AttendanceToday,
  SubmitAttendanceRecordBody,
  SubmitAttendanceRecordResult,
} from "../me.types";
import { chinaToday, formatChinaHm } from "../time";
import { requireDemoSafety } from "./attendance-safety";
import { makeDemoRecord, type DemoState } from "./state";

type TaskTarget = {
  readonly task: TeamTask;
  readonly assignment: TeamTask["assignments"][number];
};
const ownTask = (
  state: DemoState,
  person: ProjectParticipant,
  taskId: string,
): TaskTarget => {
  const task = state.teamWork?.tasks.find(
    (row) => row.id === taskId && row.projectId === person.projectId,
  );
  const assignment = task?.assignments.find(
    (row) => row.memberId === person.memberId,
  );
  if (!task || !assignment || !person.taskAttendanceOnly)
    throw new ApiError(403, "任务未分配给本人或该项目按常规排班打卡。", {});
  return { task, assignment };
};
export const demoTaskSummary = (
  state: DemoState,
  person: ProjectParticipant,
  date: string,
): ReturnType<typeof summarizeTaskAttendance> =>
  summarizeTaskAttendance(
    (state.teamWork?.tasks ?? []).flatMap((task) =>
      task.assignments
        .filter((row) => row.memberId === person.memberId)
        .map((row) => ({
          startsAt: new Date(task.startsAt),
          endsAt: new Date(task.endsAt),
          startedAt: row.startedAt ? new Date(row.startedAt) : null,
          finishedAt: row.finishedAt ? new Date(row.finishedAt) : null,
          cancelled: task.status === "CANCELLED",
        })),
    ),
    date,
    new Date(),
  );

export const demoTaskToday = (
  state: DemoState,
  person: ProjectParticipant,
  taskId: string,
): AttendanceToday => {
  const { task, assignment } = ownTask(state, person, taskId);
  const project = state.projects.find((row) => row.id === person.projectId);
  if (!project) throw new ApiError(404, "项目不存在。", {});
  return {
    attendanceDate: chinaToday(),
    configured: true,
    isWorkday:
      task.status === "OPEN" &&
      person.status === "ACTIVE" &&
      project.status === "ACTIVE",
    shiftName: `临时任务 · ${task.title}`,
    geofence: {
      centerLatitude: project.centerLatitude,
      centerLongitude: project.centerLongitude,
      radiusM: project.geofenceRadiusM,
      locationAccuracyLimitM: null,
    },
    result: null,
    points: (["START", "END"] as const).map((kind) => {
      const stamp =
        kind === "START" ? assignment.startedAt : assignment.finishedAt;
      return {
        pointCode: taskPointCode(taskId, kind),
        kind,
        label: kind === "START" ? "开工" : "完工",
        graceMins: 0,
        scheduledTime: formatChinaHm(
          kind === "START" ? task.startsAt : task.endsAt,
        ),
        record: stamp
          ? { occurredAt: stamp, status: "VALID", abnormalReason: null }
          : null,
      };
    }),
  };
};
const updateTaskAssignment = (
  state: DemoState,
  target: TaskTarget,
  assignment: TeamTask["assignments"][number],
): DemoState => {
  if (!state.teamWork) throw new ApiError(404, "任务不存在。", {});
  return {
    ...state,
    teamWork: {
      ...state.teamWork,
      tasks: state.teamWork.tasks.map((task) =>
        task.id !== target.task.id
          ? task
          : {
              ...task,
              assignments: task.assignments.map((row) =>
                row.memberId === assignment.memberId ? assignment : row,
              ),
            },
      ),
    },
  };
};
export const demoTaskMakeupTarget = (
  state: DemoState,
  person: ProjectParticipant,
  code: string,
  finishedAt: string,
): TaskTarget => {
  const point = parseTaskPoint(code);
  if (point?.kind !== "END")
    throw new ApiError(400, "临时任务仅支持已开工后的完工补卡。", {});
  const target = ownTask(state, person, point.taskId);
  const { task, assignment } = target;
  if (
    task.status !== "OPEN" ||
    assignment.exitConfirmedAt ||
    assignment.finishedAt
  )
    throw new ApiError(409, "任务或人员状态已变化。", {});
  const duration: number =
    Date.parse(finishedAt) - Date.parse(assignment.startedAt ?? "");
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > 86400000 ||
    Date.parse(finishedAt) > Date.now()
  )
    throw new ApiError(400, "请填写开工后 24 小时内实际发生的完工时间。", {});
  return target;
};
export const approveDemoTaskMakeup = (
  state: DemoState,
  person: ProjectParticipant,
  code: string,
  finishedAt: string,
): DemoState => {
  const target = demoTaskMakeupTarget(state, person, code, finishedAt);
  return updateTaskAssignment(state, target, {
    ...target.assignment,
    finishedAt,
    workedMinutes: Math.floor(
      (Date.parse(finishedAt) - Date.parse(target.assignment.startedAt!)) /
        60000,
    ),
  });
};
export const punchDemoTask = (
  state: DemoState,
  userId: string,
  person: ProjectParticipant,
  body: SubmitAttendanceRecordBody,
): {
  readonly state: DemoState;
  readonly data: SubmitAttendanceRecordResult;
} => {
  const point = parseTaskPoint(body.pointCode);
  if (!point) throw new ApiError(400, "无效的任务打卡时点。", {});
  const target = ownTask(state, person, point.taskId);
  const { task, assignment } = target;
  if (
    task.status !== "OPEN" ||
    person.teamId !== task.teamId ||
    person.status !== "ACTIVE" ||
    !person.requiresAttendance ||
    assignment.exitConfirmedAt ||
    assignment.finishedAt
  )
    throw new ApiError(409, "任务或人员状态已变化，请刷新。", {});
  if (
    body.attendanceDate !== chinaToday() ||
    Math.abs(Date.parse(body.occurredAt) - Date.now()) > 60000
  )
    throw new ApiError(400, "打卡时间须为当前时间。", {});
  if (point.kind === "START") {
    if (
      assignment.startedAt ||
      Date.now() < Date.parse(task.startsAt) ||
      Date.now() >= Date.parse(task.endsAt)
    )
      throw new ApiError(409, "已经开工或不在任务作业时间内。", {});
    const members = new Set(
      state.people
        .filter((row) => row.profileId === person.profileId)
        .map((row) => row.memberId),
    );
    if (
      state.teamWork!.tasks.some((row) =>
        row.assignments.some(
          (item) =>
            members.has(item.memberId) && item.startedAt && !item.finishedAt,
        ),
      )
    )
      throw new ApiError(409, "还有未完工的临时任务。", {});
  } else demoTaskMakeupTarget(state, person, body.pointCode, body.occurredAt);
  requireDemoSafety(state, userId, person, body);
  const updated = updateTaskAssignment(state, target, {
    ...assignment,
    ...(point.kind === "START"
      ? { startedAt: body.occurredAt }
      : {
          finishedAt: body.occurredAt,
          workedMinutes: Math.floor(
            (Date.parse(body.occurredAt) - Date.parse(assignment.startedAt!)) /
              60000,
          ),
        }),
  });
  const record = {
    ...makeDemoRecord(
      person,
      body.attendanceDate,
      body.pointCode,
      body.occurredAt,
    ),
    ...body,
    pointLabel: point.kind === "START" ? "开工" : "完工",
  };
  const next: DemoState = { ...updated, records: [...updated.records, record] };
  return {
    state: next,
    data: {
      record,
      result: {
        ...demoTaskSummary(next, person, body.attendanceDate),
        projectId: person.projectId,
        participantId: person.profileId,
        participantType: person.participantType,
        attendanceDate: body.attendanceDate,
      },
    },
  };
};
