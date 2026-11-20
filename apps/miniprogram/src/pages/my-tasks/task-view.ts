import type { TeamTask } from "@construction/domain";

import type { StatusKind } from "../../components/ui/status-kind";
import { formatChinaDate, formatChinaHm } from "../../services/time";

type Assignment = TeamTask["assignments"][number];
type Task = Pick<TeamTask, "id" | "status" | "startsAt" | "assignments">;

/** 按任务记工的人，在这项任务里走到哪一步了。 */
export const taskProgress = (
  person: Pick<Assignment, "startedAt" | "finishedAt">,
): { readonly kind: StatusKind; readonly text: string } =>
  person.finishedAt
    ? { kind: "ok", text: "已完工" }
    : person.startedAt
      ? { kind: "warn", text: "作业中" }
      : { kind: "warn", text: "待开工" };

/** 能不能打开工或完工卡：任务还开着、看的是今天、自己没完工也没被确认退场。 */
export const canPunchTask = (
  task: Pick<TeamTask, "status">,
  person: Pick<Assignment, "finishedAt" | "exitConfirmedAt">,
  isToday: boolean,
): boolean =>
  task.status === "OPEN" &&
  isToday &&
  !person.finishedAt &&
  !person.exitConfirmedAt;

/** 开了工还没完工的，可以申请完工补卡。 */
export const canApplyFinishMakeup = (
  task: Pick<TeamTask, "status">,
  person: Pick<Assignment, "startedAt" | "finishedAt">,
  isToday: boolean,
): boolean =>
  task.status === "OPEN" &&
  isToday &&
  Boolean(person.startedAt) &&
  !person.finishedAt;

/**
 * 没打开工卡、可以申请开工补卡：任务还开着，自己没开工、没完工、没退场，
 * 并且班组长已经提醒过，或者任务的计划时间已经过了（现场打不了开工卡）。
 */
export const canApplyStartMakeup = (
  task: Pick<TeamTask, "status" | "endsAt">,
  person: Pick<
    Assignment,
    "startedAt" | "finishedAt" | "exitConfirmedAt" | "startReminderAt"
  >,
  now: number,
): boolean =>
  task.status === "OPEN" &&
  !person.startedAt &&
  !person.finishedAt &&
  !person.exitConfirmedAt &&
  (Boolean(person.startReminderAt) || now >= Date.parse(task.endsAt));

/** 班组长提醒过漏打开工卡、而且还没补上。 */
export const startReminded = (
  person: Pick<Assignment, "startedAt" | "startReminderAt">,
): boolean => Boolean(person.startReminderAt) && !person.startedAt;

const punchable = (task: Task, isToday: boolean): ReadonlyArray<Assignment> =>
  task.assignments.filter(
    (person) =>
      person.taskAttendanceOnly === true && canPunchTask(task, person, isToday),
  );

/**
 * 一屏只有一个黑按钮：几项任务都能打卡时，给正在做的那项；
 * 都还没开工，就给计划最早开始的那项。没有能打卡的任务时为 null。
 */
export const primaryTaskId = (
  tasks: ReadonlyArray<Task>,
  isToday: boolean,
): string | null => {
  const open = tasks.filter((task) => punchable(task, isToday).length > 0);
  const working = open.find((task) =>
    punchable(task, isToday).some((person) => Boolean(person.startedAt)),
  );
  if (working) return working.id;
  const first = [...open].sort(
    (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt),
  )[0];
  return first?.id ?? null;
};

/** 开工时间：当天的只写几点，不是当天的带上日期。 */
export const startedAtLabel = (startedAt: string, date: string): string => {
  const day = formatChinaDate(startedAt);
  const [, month, dayOfMonth] = day.split("-");
  return day === date
    ? formatChinaHm(startedAt)
    : `${Number(month)}月${Number(dayOfMonth)}日 ${formatChinaHm(startedAt)}`;
};
