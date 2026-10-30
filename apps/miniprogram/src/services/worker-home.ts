import type {
  AttendanceRecord,
  AttendanceToday,
  Makeup,
  MyAttendanceDay,
} from "./me.types";
import { formatChinaHm } from "./time";

export type WorkerMonthSummary = {
  readonly attendedDays: number;
  readonly workedMinutes: number;
  readonly missingDays: number;
  readonly pendingMakeups: number;
  readonly rejectedMakeups: number;
};

/** Count calendar attendance days separately from project-level work durations. */
export const summarizeWorkerMonth = (
  days: readonly MyAttendanceDay[],
  records: readonly AttendanceRecord[],
  makeups: readonly Makeup[],
  from: string,
  to: string,
): WorkerMonthSummary => {
  const inRange = (date: string): boolean => date >= from && date <= to;
  const monthDays = days.filter((day) => inRange(day.attendanceDate));
  const monthMakeups = makeups.filter((item) => inRange(item.attendanceDate));
  const dates = [
    ...records
      .filter(
        (record) => inRange(record.attendanceDate) && record.status === "VALID",
      )
      .map((record) => record.attendanceDate),
    ...monthMakeups
      .filter((item) => item.status === "APPROVED")
      .map((item) => item.attendanceDate),
  ];
  return {
    attendedDays: new Set(dates).size,
    workedMinutes: monthDays.reduce(
      (total, day) => total + day.workedMinutes,
      0,
    ),
    missingDays: monthDays.filter((day) => day.isMissingPunch).length,
    pendingMakeups: makeups.filter((item) => item.status === "PENDING").length,
    rejectedMakeups: monthMakeups.filter((item) => item.status === "REJECTED")
      .length,
  };
};

/** Derive work state from recorded start/end events, without guessing overtime. */
export const workerProjectStatus = (
  today: AttendanceToday,
  now: string,
): string => {
  if (!today.configured) return "待安排";
  if (!today.isWorkday || today.points.length === 0) return "今日休息";
  if (today.points.some((point) => point.record?.status === "INVALID"))
    return "打卡异常";
  const remaining = today.points.filter((point) => point.record === null);
  if (remaining.length === 0) return "今日已完成";
  const movements = today.points.filter(
    (point) => point.kind !== "CHECKPOINT" && point.record?.status === "VALID",
  );
  const latest = [...movements]
    .sort((a, b) => a.record!.occurredAt.localeCompare(b.record!.occurredAt))
    .at(-1);
  if (latest?.kind === "START") {
    const startIndex = today.points.indexOf(latest);
    const end = today.points
      .slice(startIndex + 1)
      .find((point) => point.kind === "END");
    return end !== undefined &&
      end.record === null &&
      formatChinaHm(now) >= end.scheduledTime
      ? "待下班"
      : "工作中";
  }
  if (remaining.some((point) => point.kind === "START")) return "待上班";
  return "待完成打卡";
};
