export type AttendancePointCode = string;

export type AttendanceRecordSource = "DEVICE" | "MAKEUP";

export type AttendanceRecordInput = {
  readonly id: string;
  readonly pointCode: AttendancePointCode;
  readonly occurredAt: Date;
  readonly isValid: boolean;
  readonly source: AttendanceRecordSource;
};

export type SelectedAttendanceRecords = {
  readonly SEGMENT_1_START: AttendanceRecordInput | undefined;
  readonly SEGMENT_1_END: AttendanceRecordInput | undefined;
  readonly SEGMENT_2_START: AttendanceRecordInput | undefined;
  readonly SEGMENT_2_END: AttendanceRecordInput | undefined;
};

export type DailyAttendanceSummary = {
  readonly selectedRecords: SelectedAttendanceRecords;
  readonly workedMinutes: number;
  readonly isLate: boolean;
  readonly isEarlyLeave: boolean;
  readonly isMissingPunch: boolean;
  readonly isAbsent: boolean;
};

type ReversedAttendanceSegmentErrorPayload = {
  readonly message: string;
  readonly startPointCode: AttendancePointCode;
  readonly endPointCode: AttendancePointCode;
  readonly startRecordId: string;
  readonly endRecordId: string;
  readonly startOccurredAt: string;
  readonly endOccurredAt: string;
};

const minutesBetween = (startAt: Date, endAt: Date): number =>
  Math.trunc((endAt.getTime() - startAt.getTime()) / 60_000);

const createReversedAttendanceSegmentError = (
  startPointCode: AttendancePointCode,
  endPointCode: AttendancePointCode,
  startRecord: AttendanceRecordInput,
  endRecord: AttendanceRecordInput
): Error => {
  const payload: ReversedAttendanceSegmentErrorPayload = {
    message: "Attendance segment start occurred after segment end",
    startPointCode,
    endPointCode,
    startRecordId: startRecord.id,
    endRecordId: endRecord.id,
    startOccurredAt: startRecord.occurredAt.toISOString(),
    endOccurredAt: endRecord.occurredAt.toISOString()
  };

  return new Error(JSON.stringify(payload));
};

const validateSegmentOrder = (
  startPointCode: AttendancePointCode,
  endPointCode: AttendancePointCode,
  startRecord: AttendanceRecordInput | undefined,
  endRecord: AttendanceRecordInput | undefined
): void => {
  if (startRecord === undefined || endRecord === undefined) {
    return;
  }

  if (startRecord.occurredAt.getTime() > endRecord.occurredAt.getTime()) {
    throw createReversedAttendanceSegmentError(startPointCode, endPointCode, startRecord, endRecord);
  }
};

export type AttendancePointKind = "START" | "END" | "CHECKPOINT";
export type ScheduledAttendancePoint = {
  readonly code: string;
  readonly label: string;
  readonly kind: AttendancePointKind;
  readonly time: string;
  readonly graceMins: number;
};
export type FlexibleAttendanceSummary = Omit<DailyAttendanceSummary, "selectedRecords"> & {
  readonly selectedRecords: Readonly<Record<string, AttendanceRecordInput | undefined>>;
};
export const defaultAttendancePoints: readonly ScheduledAttendancePoint[] = [
  { code: "START", label: "上班", kind: "START", time: "08:00", graceMins: 0 },
  { code: "END", label: "下班", kind: "END", time: "17:30", graceMins: 0 },
];

/** Require chronological points and complete work segments; checkpoints never add work time. */
export const validateAttendancePoints = (points: readonly ScheduledAttendancePoint[]): void => {
  if (points.length < 2) throw new Error("至少需要一组上班和下班打卡。");
  let working: boolean = false;
  let previousTime: string = "";
  const codes: Set<string> = new Set();
  for (const point of points) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(point.code) || codes.has(point.code)) throw new Error("打卡点编号必须唯一。");
    if (!point.label.trim() || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(point.time) || point.time <= previousTime)
      throw new Error("打卡时间须按当天先后排列，不能重复或重叠。");
    if (!Number.isInteger(point.graceMins) || point.graceMins < 0 || point.graceMins > 120)
      throw new Error("宽限时间须为 0 到 120 分钟。");
    if (point.kind === "START") {
      if (working) throw new Error("上一段工作尚未设置下班打卡。");
      working = true;
    } else if (point.kind === "END") {
      if (!working) throw new Error("下班打卡前必须设置上班打卡。");
      working = false;
    } else if (point.kind !== "CHECKPOINT" || !working) {
      throw new Error("中途签到必须位于一组上下班之间。");
    }
    codes.add(point.code);
    previousTime = point.time;
  }
  if (working) throw new Error("请为最后一段工作设置下班打卡。");
};

/**
 * 公司默认打卡安排（2026-11-21 Q6）：新建项目时套用一次的项目排班。打卡点和项目排班同一套规矩，
 * 工作日是 1（周一）到 7（周日），至少一天、不能重复。前后端共用；没问题返回 null，否则返回一句中文。
 */
export type AttendanceDefaults = {
  readonly name: string;
  readonly points: readonly ScheduledAttendancePoint[];
  readonly workdays: readonly number[];
};
export const attendanceDefaultsError = (value: AttendanceDefaults): string | null => {
  if (value.name.trim().length === 0 || value.name.trim().length > 60) return "请填写排班名称，最多 60 个字。";
  if (value.workdays.length === 0) return "至少选一个工作日。";
  if (value.workdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) return "工作日只能是周一到周日。";
  if (new Set(value.workdays).size !== value.workdays.length) return "工作日不能重复。";
  try {
    validateAttendancePoints(value.points);
  } catch (error: unknown) {
    return error instanceof Error ? error.message : "打卡时间设置不对。";
  }
  return null;
};

export const legacyAttendancePoints = (segments: readonly {
  readonly sequence: number; readonly startTime: string; readonly endTime: string;
  readonly lateGraceMins: number; readonly earlyGraceMins: number;
}[]): readonly ScheduledAttendancePoint[] => [...segments]
  .sort((a, b) => a.sequence - b.sequence)
  .flatMap((segment): ScheduledAttendancePoint[] => [
    { code: `SEGMENT_${segment.sequence}_START`, label: segment.sequence === 1 ? "上午上班" : "下午上班", kind: "START", time: segment.startTime, graceMins: segment.lateGraceMins },
    { code: `SEGMENT_${segment.sequence}_END`, label: segment.sequence === 1 ? "上午下班" : "下午下班", kind: "END", time: segment.endTime, graceMins: segment.earlyGraceMins },
  ]);

/** Evaluate only elapsed requirements, using the rule effective on the attendance date. */
export const summarizeScheduledAttendance = (
  points: readonly ScheduledAttendancePoint[], date: string,
  records: readonly AttendanceRecordInput[], now: Date,
): FlexibleAttendanceSummary => {
  validateAttendancePoints(points);
  const selected: Record<string, AttendanceRecordInput | undefined> = Object.fromEntries(points.map((point) => {
    const matching = records.filter((record) => record.isValid && record.pointCode === point.code);
    const sorted = [...matching].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
    return [point.code, point.kind === "END" ? sorted[sorted.length - 1] : sorted[0]];
  }));
  let start: AttendanceRecordInput | undefined;
  let workedMinutes: number = 0;
  for (const point of points) {
    const record = selected[point.code];
    if (point.kind === "START") start = record;
    if (point.kind === "END" && start !== undefined && record !== undefined) {
      validateSegmentOrder(start.pointCode, record.pointCode, start, record);
      workedMinutes += minutesBetween(start.occurredAt, record.occurredAt);
      start = undefined;
    }
  }
  const scheduledAt = (point: ScheduledAttendancePoint): number => new Date(`${date}T${point.time}:00+08:00`).getTime();
  const due = (point: ScheduledAttendancePoint): boolean => now.getTime() > scheduledAt(point) + (point.kind === "END" ? 0 : point.graceMins * 60_000);
  return {
    selectedRecords: selected,
    workedMinutes,
    isLate: points.some((point) => point.kind !== "END" && selected[point.code] !== undefined && selected[point.code]!.occurredAt.getTime() > scheduledAt(point) + point.graceMins * 60_000),
    isEarlyLeave: points.some((point) => point.kind === "END" && selected[point.code] !== undefined && selected[point.code]!.occurredAt.getTime() < scheduledAt(point) - point.graceMins * 60_000),
    isMissingPunch: points.some((point) => due(point) && selected[point.code] === undefined),
    isAbsent: points.every(due) && points.every((point) => selected[point.code] === undefined),
  };
};
