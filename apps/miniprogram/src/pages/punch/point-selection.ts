import { parseTaskPoint } from "@construction/domain";
import type {
  AttendancePointCode,
  AttendanceToday,
} from "../../services/me.types";

export type PunchSchedule = AttendanceToday & {
  readonly taskName?: string;
  readonly taskWindow?: { readonly startsAt: string; readonly endsAt: string };
};

export const selectPunchPoint = (
  today: AttendanceToday,
  current: AttendancePointCode | null,
  now: string,
): AttendancePointCode | null => {
  const start = today.points.find(
    (point) => parseTaskPoint(point.pointCode)?.kind === "START",
  );
  if (start) {
    if (start.record === null) return start.pointCode;
    return (
      today.points.find(
        (point) =>
          parseTaskPoint(point.pointCode)?.kind === "END" &&
          point.record === null,
      )?.pointCode ?? null
    );
  }
  const points = today.points.filter((point) => point.record === null);
  if (points.some((point) => point.pointCode === current)) return current;
  const due = points.filter((point) => point.scheduledTime <= now);
  return (due[due.length - 1] ?? points[0])?.pointCode ?? null;
};

export const canSelectPunchPoint = (
  today: AttendanceToday,
  code: AttendancePointCode,
): boolean =>
  today.points.some(
    (point) => point.pointCode === code && point.record === null,
  ) &&
  (parseTaskPoint(code) === null || code === selectPunchPoint(today, null, ""));

// This is early guidance only; the server remains authoritative at submission.
export const taskPunchBlock = (
  today: PunchSchedule,
  now = Date.now(),
): string | null => {
  const start = today.points.find(
    (point) => parseTaskPoint(point.pointCode)?.kind === "START",
  );
  if (!today.taskWindow || !start || start.record !== null) return null;
  if (now < Date.parse(today.taskWindow.startsAt))
    return "还没到任务的开工时间，请按计划到场；安排有变请联系班组长。";
  if (now >= Date.parse(today.taskWindow.endsAt))
    return "已超过任务的计划开工时段，请联系班组长调整安排后再打卡。";
  return null;
};
