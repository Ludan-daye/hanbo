export type TaskPunchKind = "START" | "END";
export const taskPointCode = (taskId: string, kind: TaskPunchKind): string =>
  `TASK_${taskId}_${kind}`;
export const parseTaskPoint = (
  code: string,
): { taskId: string; kind: TaskPunchKind } | null => {
  const match = /^TASK_([A-Za-z0-9-]{1,48})_(START|END)$/.exec(code);
  return match === null
    ? null
    : { taskId: match[1]!, kind: match[2] as TaskPunchKind };
};

export type TaskWorkInterval = {
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly startedAt: Date | null;
  readonly finishedAt: Date | null;
  readonly cancelled: boolean;
};
/** Count completed actual intervals in China calendar days; unclosed work never earns estimated hours. */
export const summarizeTaskAttendance = (
  tasks: readonly TaskWorkInterval[],
  date: string,
  now: Date,
): {
  readonly workedMinutes: number;
  readonly hasResult: boolean;
  readonly isScheduled: boolean;
  readonly isAbsent: boolean;
  readonly isMissingPunch: boolean;
  readonly isLate: false;
  readonly isEarlyLeave: false;
} => {
  const start: number = Date.parse(`${date}T00:00:00+08:00`);
  const end: number = start + 86400000;
  const relevant = tasks.filter(
    (task) =>
      !task.cancelled &&
      ((task.startsAt.getTime() < end && task.endsAt.getTime() > start) ||
        (task.startedAt !== null &&
          task.startedAt.getTime() < end &&
          (task.finishedAt?.getTime() ?? now.getTime()) > start)),
  );
  const minutes: number = relevant.reduce(
    (sum, task) =>
      sum +
      (task.startedAt === null || task.finishedAt === null
        ? 0
        : Math.max(
            0,
            Math.floor(
              (Math.min(end, task.finishedAt.getTime()) -
                Math.max(start, task.startedAt.getTime())) /
                60000,
            ),
          )),
    0,
  );
  const hasResult: boolean = relevant.some(
    (task) =>
      task.startedAt !== null &&
      task.startedAt.getTime() < end &&
      (task.finishedAt?.getTime() ?? now.getTime()) >= start,
  );
  return {
    workedMinutes: minutes,
    hasResult,
    isScheduled: relevant.length > 0,
    isAbsent:
      relevant.length > 0 &&
      !hasResult &&
      relevant.every((task) => task.endsAt < now),
    isMissingPunch: relevant.some(
      (task) =>
        task.startedAt !== null &&
        task.finishedAt === null &&
        task.endsAt < now,
    ),
    isLate: false,
    isEarlyLeave: false,
  };
};
