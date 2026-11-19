import { formatChinaHm } from "../../services/time";
import type { WorkerMonthSummary } from "../../services/worker-home";
import {
  workerRecordDayStatus,
  type AttendanceRange,
  type WorkerRecordDay,
} from "../../services/worker-records";
import type { StatusKind } from "../ui/status-kind";

// 我的考勤页面上显示的字：哪天、什么状态、这一天有哪些时点。只算字，不画界面。

const POINT_LABEL: Readonly<Record<string, string>> = {
  SEGMENT_1_END: "上午下班",
  SEGMENT_1_START: "上午上班",
  SEGMENT_2_END: "下午下班",
  SEGMENT_2_START: "下午上班",
};
/** 这张卡叫什么：接口给了名字就用名字，老数据按固定时点翻译。 */
export const pointName = (row: {
  readonly pointLabel?: string | null;
  readonly pointCode: string;
}): string => row.pointLabel ?? POINT_LABEL[row.pointCode] ?? "打卡";

/** 分钟换成小时，保留一位小数：510 分钟写成“8.5”。 */
export const hoursText = (minutes: number): string => (minutes / 60).toFixed(1);

export const abnormalReasonLabel = (reason: string | null): string =>
  reason === "OUTSIDE_GEOFENCE"
    ? "超出考勤范围"
    : reason === "FACE_NOT_PASSED"
      ? "人脸核验未通过"
      : reason
        ? "核验异常"
        : "";

const WEEKDAY = "日一二三四五六";
/** “11月18日”。 */
export const monthDayLabel = (value: string): string =>
  `${Number(value.slice(5, 7))}月${Number(value.slice(8, 10))}日`;
/** “11月18日 周三”。 */
export const dayLabel = (value: string): string => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : `${monthDayLabel(value)} 周${WEEKDAY[date.getUTCDay()]}`;
};
/** “2026年11月18日”：自选日期用，跨年也不会看错。 */
export const fullDateLabel = (value: string): string =>
  `${value.slice(0, 4)}年${monthDayLabel(value)}`;
/** 明细上方的一行：这次看的是哪几天。 */
export const rangeHeading = (from: string, to: string): string => {
  if (from === to) return dayLabel(from);
  return from.slice(0, 4) === to.slice(0, 4)
    ? `${monthDayLabel(from)} 到 ${monthDayLabel(to)}`
    : `${fullDateLabel(from)} 到 ${fullDateLabel(to)}`;
};

const RANGE_NAME: Readonly<Record<AttendanceRange, string>> = {
  TODAY: "今天",
  WEEK: "近 7 天",
  MONTH: "本月",
  CUSTOM: "这段时间",
};
/** 小标牌上的一句结论：这段时间出勤几天、记了多少工时、有没有缺卡。 */
export const rangeSign = (
  range: AttendanceRange,
  total: Pick<
    WorkerMonthSummary,
    "attendedDays" | "workedMinutes" | "missingDays"
  >,
): { readonly title: string; readonly sub: string } => {
  const hours = `记工 ${hoursText(total.workedMinutes)} 小时`;
  if (range === "TODAY")
    return {
      title: total.attendedDays > 0 ? "今天已出勤" : "今天还没有出勤",
      sub: total.missingDays > 0 ? `${hours}，有缺卡` : hours,
    };
  return {
    title: `${RANGE_NAME[range]}出勤 ${total.attendedDays} 天`,
    sub: `${hours}，${total.missingDays > 0 ? `缺卡 ${total.missingDays} 天` : "没有缺卡"}`,
  };
};

/** 这一天有没有要处理的问题：缺勤、迟到、早退、缺卡，或者有一次打卡没通过核验。 */
export const dayHasIssue = (group: WorkerRecordDay): boolean =>
  group.summary?.isAbsent === true ||
  group.summary?.isLate === true ||
  group.summary?.isEarlyLeave === true ||
  group.summary?.isMissingPunch === true ||
  group.records.some((row) => row.status === "INVALID");

/**
 * 日期行右边的状态：有问题说问题，没问题说记了多少工时。
 * 今天还没过完，工时不算最终结果，所以不带绿方块。
 */
export const dayRowStatus = (
  group: WorkerRecordDay,
  today: string,
): { readonly kind: StatusKind; readonly text: string } => {
  if (dayHasIssue(group))
    return {
      kind: "bad",
      text: workerRecordDayStatus(group, today).split(" / ").join("、"),
    };
  if (!group.summary) return { kind: "idle", text: "待汇总" };
  return {
    kind: group.date === today ? "idle" : "ok",
    text: `${hoursText(group.summary.workedMinutes)} 小时`,
  };
};

export type DayPoint = {
  readonly key: string;
  readonly name: string;
  readonly time: string;
  /** valid 核验通过的打卡，invalid 没通过核验的打卡，makeup 批准了的补卡。 */
  readonly kind: "valid" | "invalid" | "makeup";
  readonly note: string | null;
};

/** 这一天的时点：原始打卡和已批准的补卡合在一起，按时间先后排。 */
export const dayPoints = (group: WorkerRecordDay): DayPoint[] => {
  const entries: { readonly at: number; readonly point: DayPoint }[] = [
    ...group.records.map((row) => ({
      at: Date.parse(row.occurredAt),
      point: {
        key: `record:${row.id}`,
        name: pointName(row),
        time: formatChinaHm(row.occurredAt),
        kind:
          row.status === "VALID" ? ("valid" as const) : ("invalid" as const),
        note: abnormalReasonLabel(row.abnormalReason) || null,
      },
    })),
    ...group.makeups.map((row) => ({
      at: Date.parse(row.requestedOccurredAt),
      point: {
        key: `makeup:${row.id}`,
        name: pointName(row),
        time: formatChinaHm(row.requestedOccurredAt),
        kind: "makeup" as const,
        note: "补卡已生效",
      },
    })),
  ];
  return entries.sort((a, b) => a.at - b.at).map((entry) => entry.point);
};

/** 展开的一天下面那两行灰字：工时怎么分的，哪个班组，补过几次卡。 */
export const dayNotes = (group: WorkerRecordDay): string[] => {
  const day = group.summary;
  if (!day) return ["这一天还没有汇总，先以打卡记录为准。"];
  return [
    `记工 ${hoursText(day.workedMinutes)} 小时：正常 ${hoursText(day.normalMinutes)}，加班 ${hoursText(day.overtimeMinutes)}，未分类 ${hoursText(day.unclassifiedMinutes)}`,
    `${day.teamName ?? "项目直属"}${day.approvedMakeupCount > 0 ? `，已补卡 ${day.approvedMakeupCount} 次` : ""}`,
  ];
};

/** 从这一天去申请补卡：带上项目、日期和已经打过的卡，表单好直接选中缺的那张。 */
export const dayMakeupUrl = (group: WorkerRecordDay): string => {
  const recorded = group.records
    .filter((row) => row.status === "VALID")
    .map((row) => row.pointCode)
    .join(",");
  return `/pages/submit-makeup/index?projectId=${encodeURIComponent(group.projectId)}&date=${group.date}&recorded=${encodeURIComponent(recorded)}`;
};
