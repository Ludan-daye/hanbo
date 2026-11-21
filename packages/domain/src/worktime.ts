import type { AttendanceRecordInput, ScheduledAttendancePoint } from "./attendance.js";
import { summarizeScheduledAttendance } from "./attendance.js";
import type { TaskWorkInterval } from "./task-attendance.js";

export type WorktimeRule = {
  readonly projectKind: "REGULAR" | "REPAIR";
  readonly lunchStart: string | null;
  readonly lunchEnd: string | null;
  readonly overtimeStart: string | null;
};
export type WorktimeRuleVersion = {
  readonly config: WorktimeRule;
  readonly startsOn: string;
  readonly version: number;
};
export type WorktimeInterval = {
  readonly start: Date;
  readonly end: Date | null;
  readonly mode: "REGULAR" | "HOURLY" | "OVERTIME";
};
export type WorktimeTotals = {
  readonly normalMinutes: number;
  readonly overtimeMinutes: number;
  readonly unclassifiedMinutes: number;
  readonly workedMinutes: number;
  readonly normalHours: string;
  readonly overtimeHours: string;
  readonly totalHours: string;
};
export type ClassifiedWorktime = WorktimeTotals & {
  readonly isPendingVerification: boolean;
  readonly ruleVersion: number;
};

/** Suggested settings only; version zero never applies these to historical work. */
export const defaultWorktimeRule: WorktimeRule = {
  projectKind: "REGULAR", lunchStart: null, lunchEnd: null, overtimeStart: "18:00",
};
/** 工时规则的校验（公司默认和项目规则同一套）：午休两端同时有或同时没有，结束晚于开始。没问题返回 null。 */
export const worktimeRuleError = (rule: WorktimeRule): string | null => {
  const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (rule.projectKind !== "REGULAR" && rule.projectKind !== "REPAIR") return "请选择项目类型。";
  for (const value of [rule.lunchStart, rule.lunchEnd, rule.overtimeStart])
    if (value !== null && !clock.test(value)) return "时间要写成 08:00 这样。";
  if ((rule.lunchStart === null) !== (rule.lunchEnd === null)) return "午休开始、结束时间须同时设置。";
  if (rule.lunchStart !== null && rule.lunchEnd !== null && rule.lunchStart >= rule.lunchEnd) return "午休结束要晚于开始。";
  return null;
};
export const legacyWorktimeRule: WorktimeRuleVersion = {
  config: { ...defaultWorktimeRule, overtimeStart: null }, startsOn: "0001-01-01", version: 0,
};
export const emptyWorktimeTotals: WorktimeTotals = {
  normalMinutes: 0, overtimeMinutes: 0, unclassifiedMinutes: 0, workedMinutes: 0,
  normalHours: "0", overtimeHours: "0", totalHours: "0",
};
export const worktimeChinaDate = (value: Date): string =>
  new Date(value.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
export const resolveWorktimeRule = (
  versions: readonly WorktimeRuleVersion[], date: string,
): WorktimeRuleVersion =>
  [...versions].filter((row) => row.startsOn <= date)
    .sort((left, right) => right.startsOn.localeCompare(left.startsOn) || right.version - left.version)[0]
    ?? legacyWorktimeRule;

/** Decimal strings preserve transport precision; minutes remain the accounting source. */
export const worktimeDecimal = (value: number): string => {
  if (!Number.isFinite(value) || value < 0) throw new RangeError("WORKTIME_DECIMAL_INVALID");
  return value.toFixed(6).replace(/\.?0+$/, "") || "0";
};
const totals = (normalMinutes: number, overtimeMinutes: number, unclassifiedMinutes: number): WorktimeTotals => ({
  normalMinutes, overtimeMinutes, unclassifiedMinutes,
  workedMinutes: normalMinutes + overtimeMinutes + unclassifiedMinutes,
  normalHours: worktimeDecimal(normalMinutes / 60), overtimeHours: worktimeDecimal(overtimeMinutes / 60),
  totalHours: worktimeDecimal((normalMinutes + overtimeMinutes + unclassifiedMinutes) / 60),
});
export const addWorktimeTotals = (left: WorktimeTotals, right: WorktimeTotals): WorktimeTotals =>
  totals(left.normalMinutes + right.normalMinutes, left.overtimeMinutes + right.overtimeMinutes,
    left.unclassifiedMinutes + right.unclassifiedMinutes);

export const scheduledWorkIntervals = (
  points: readonly ScheduledAttendancePoint[], date: string,
  records: readonly AttendanceRecordInput[], now: Date, mode: "REGULAR" | "HOURLY",
): readonly WorktimeInterval[] => {
  const selected = summarizeScheduledAttendance(points, date, records, now).selectedRecords;
  return points.flatMap((point, index): WorktimeInterval[] => {
    if (point.kind !== "START") return [];
    const start = selected[point.code];
    if (start === undefined) return [];
    const endPoint = points.slice(index + 1).find((item) => item.kind === "END");
    return [{ end: endPoint === undefined ? null : selected[endPoint.code]?.occurredAt ?? null, mode, start: start.occurredAt }];
  });
};
export const taskWorkIntervals = (tasks: readonly TaskWorkInterval[]): readonly WorktimeInterval[] =>
  tasks.flatMap((task): WorktimeInterval[] => task.cancelled || task.startedAt === null
    ? [] : [{ end: task.finishedAt, mode: "HOURLY", start: task.startedAt }]);

export const overtimePointCode = (date: string, kind: "START" | "END"): string => `OVERTIME_${date}_${kind}`;
export const parseOvertimePoint = (code: string): { readonly date: string; readonly kind: "START" | "END" } | null => {
  const match = /^OVERTIME_(\d{4}-\d{2}-\d{2})_(START|END)$/.exec(code);
  if (match === null) return null;
  const date = match[1]!;
  const parsed = new Date(`${date}T00:00:00+08:00`);
  if (!Number.isFinite(parsed.getTime()) || worktimeChinaDate(parsed) !== date) return null;
  return { date, kind: match[2] as "START" | "END" };
};
export const overtimeWorkIntervals = (records: readonly AttendanceRecordInput[]): readonly WorktimeInterval[] => {
  const dates = [...new Set(records.filter((row) => row.isValid).flatMap((row) => {
    const point = parseOvertimePoint(row.pointCode);
    return point === null ? [] : [point.date];
  }))];
  return dates.flatMap((date): WorktimeInterval[] => {
    const starts = records.filter((row) => row.isValid && row.pointCode === overtimePointCode(date, "START"))
      .sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime());
    const ends = records.filter((row) => row.isValid && row.pointCode === overtimePointCode(date, "END"))
      .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime());
    return starts[0] === undefined ? [] : [{ start: starts[0].occurredAt, end: ends[0]?.occurredAt ?? null, mode: "OVERTIME" }];
  });
};

type NumericInterval = { readonly end: number; readonly mode: WorktimeInterval["mode"]; readonly start: number; readonly originalStart: number };
type MinuteBuckets = { readonly normal: number; readonly overtime: number; readonly unclassified: number };
const timeOn = (date: string, time: string): number => Date.parse(`${date}T${time}:00+08:00`);
const validTime = (time: string | null): boolean => time === null || /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time);

/** Union actual evidence, deduct configured breaks, then classify each Shanghai calendar day. */
export const classifyWorktime = (
  intervals: readonly WorktimeInterval[], date: string, version: WorktimeRuleVersion, now: Date,
): ClassifiedWorktime => {
  const rule = version.config;
  const dayStart = timeOn(date, "00:00");
  const dayEnd = dayStart + 86_400_000;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(dayStart) || worktimeChinaDate(new Date(dayStart)) !== date)
    throw new RangeError("WORKTIME_DATE_INVALID");
  if (!validTime(rule.lunchStart) || !validTime(rule.lunchEnd) || !validTime(rule.overtimeStart) ||
      (rule.lunchStart === null) !== (rule.lunchEnd === null) ||
      (rule.lunchStart !== null && rule.lunchEnd! <= rule.lunchStart)) throw new RangeError("WORKTIME_RULE_INVALID");
  if (!Number.isFinite(now.getTime())) throw new RangeError("WORKTIME_NOW_INVALID");
  for (const interval of intervals) {
    if (!Number.isFinite(interval.start.getTime()) || interval.start > now || (interval.end !== null &&
      (!Number.isFinite(interval.end.getTime()) || interval.end < interval.start || interval.end > now)))
      throw new RangeError("WORKTIME_INTERVAL_INVALID");
  }
  const closed: readonly NumericInterval[] = intervals.flatMap((interval): NumericInterval[] =>
    interval.end === null || interval.start.getTime() >= dayEnd || interval.end.getTime() <= dayStart
      ? [] : [{ end: Math.min(dayEnd, interval.end.getTime()), mode: interval.mode,
        originalStart: interval.start.getTime(), start: Math.max(dayStart, interval.start.getTime()) }]);
  const overtimeStart = rule.overtimeStart === null ? dayEnd : timeOn(date, rule.overtimeStart);
  const lunchStart = rule.lunchStart === null || version.version === 0 ? dayEnd : timeOn(date, rule.lunchStart);
  const lunchEnd = rule.lunchEnd === null || version.version === 0 ? dayEnd : timeOn(date, rule.lunchEnd);
  const boundaries = [...new Set([dayStart, dayEnd, overtimeStart, lunchStart, lunchEnd,
    ...closed.flatMap((interval) => [interval.start, interval.end])])].sort((a, b) => a - b);
  const milliseconds = boundaries.slice(0, -1).reduce((sum: MinuteBuckets, start, index): MinuteBuckets => {
    const end = boundaries[index + 1]!;
    const active = closed.filter((interval) => interval.start <= start && interval.end >= end);
    if (active.length === 0 || (start >= lunchStart && end <= lunchEnd)) return sum;
    const overnight = rule.overtimeStart !== null && active.some((interval) => interval.originalStart < dayStart);
    const bucket: keyof MinuteBuckets = version.version === 0 ? "unclassified"
      : active.some((interval) => interval.mode === "OVERTIME") || start >= overtimeStart || overnight ? "overtime" : "normal";
    return { ...sum, [bucket]: sum[bucket] + end - start };
  }, { normal: 0, overtime: 0, unclassified: 0 });
  return {
    ...totals(Math.floor(milliseconds.normal / 60_000), Math.floor(milliseconds.overtime / 60_000), Math.floor(milliseconds.unclassified / 60_000)),
    isPendingVerification: intervals.some((interval) => interval.end === null && interval.start.getTime() < Math.min(dayEnd, now.getTime())),
    ruleVersion: version.version,
  };
};
