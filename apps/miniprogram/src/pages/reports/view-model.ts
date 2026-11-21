import { dayHeadcount } from "../../services/day-headcount";
import type {
  DailyReportParticipant,
  DayHeadcount,
  RangeReportParticipant,
  ReportTotals,
} from "../../services/management.types";

export type ReportPeriod = "DAILY" | "WEEKLY" | "MONTHLY";
/** 报表里的一行：一个人在一个班组里的这段时间。同一个人换过班组就有几行。 */
export type ReportRow = DailyReportParticipant | RangeReportParticipant;
export type StatNumber = {
  readonly label: string;
  readonly value: string;
  readonly tone?: "bad";
};

const hours = (minutes: number): string => (minutes / 60).toFixed(1);
const pad = (value: number): string => String(value).padStart(2, "0");
const WEEKDAY = "日一二三四五六";

/** 十四项统计，一项不少。“全部统计”里摆的就是它。 */
export const totalsStatItems = (
  totals: ReportTotals,
): ReadonlyArray<{ label: string; value: string }> => [
  { label: "统计人数", value: String(totals.participantCount) },
  { label: "应排天数", value: String(totals.scheduledDays) },
  { label: "实出天数", value: String(totals.actualAttendedDays) },
  { label: "迟到", value: String(totals.lateCount) },
  { label: "早退", value: String(totals.earlyLeaveCount) },
  { label: "缺卡", value: String(totals.missingPunchCount) },
  { label: "缺勤", value: String(totals.absenceCount) },
  { label: "补卡通过", value: String(totals.approvedMakeupCount) },
  { label: "异常记录", value: String(totals.abnormalRecordCount) },
  { label: "正常工时", value: `${(totals.normalMinutes / 60).toFixed(1)}h` },
  { label: "加班工时", value: `${(totals.overtimeMinutes / 60).toFixed(1)}h` },
  {
    label: "未分类工时",
    value: `${(totals.unclassifiedMinutes / 60).toFixed(1)}h`,
  },
  { label: "已确认违规", value: String(totals.confirmedViolationCount) },
  { label: "工时", value: `${(totals.workedMinutes / 60).toFixed(1)}h` },
];

/** 最常看的三个：日报看迟到早退，周报月报看缺卡缺勤，加班工时都要看。 */
const TOP: Readonly<Record<ReportPeriod, readonly string[]>> = {
  DAILY: ["迟到", "早退", "加班工时"],
  WEEKLY: ["缺卡", "缺勤", "加班工时"],
  MONTHLY: ["缺卡", "缺勤", "加班工时"],
};
const RED: readonly string[] = ["缺卡", "缺勤"];

/** 十四项统计拆成“最常看的三个”和“其余十一个”。工时的名称里已经有“工时”，数字后面不再带单位。 */
export const reportNumbers = (
  totals: ReportTotals,
  period: ReportPeriod,
): {
  readonly top: ReadonlyArray<StatNumber>;
  readonly rest: ReadonlyArray<StatNumber>;
} => {
  const all: ReadonlyArray<StatNumber> = totalsStatItems(totals).map(
    (item) => ({
      label: item.label,
      value: item.value.replace(/h$/, ""),
      tone: RED.includes(item.label) && item.value !== "0" ? "bad" : undefined,
    }),
  );
  const top = TOP[period];
  return {
    top: top.flatMap((label) => all.filter((item) => item.label === label)),
    rest: all.filter((item) => !top.includes(item.label)),
  };
};

/**
 * 小标牌上的结论。projectCount 只有公司报表传，其余传 null。
 * 日报传了 headcount（由这一天的人算出）就写“到岗、未到”，和首页同一套数：
 * 应到 = 到岗 + 未到 + 还没到点；到了但漏卡的人在下面的“缺卡”里。
 */
export const reportSummary = (
  totals: ReportTotals,
  period: ReportPeriod,
  projectCount: number | null,
  headcount?: DayHeadcount,
): { readonly title: string; readonly sub: string } => {
  const worked = hours(totals.workedMinutes);
  const scope = projectCount === null ? "" : `${projectCount} 个项目，`;
  if (period === "DAILY" && headcount !== undefined) {
    if (headcount.expected === 0 && headcount.present === 0)
      return { title: "这一天没有排班", sub: `${scope}已记工 ${worked} 小时` };
    return {
      title: `${headcount.present} 人到岗${headcount.missing > 0 ? `，${headcount.missing} 人未到` : ""}`,
      sub: `${scope}应到 ${headcount.expected} 人${headcount.waiting > 0 ? `（${headcount.waiting} 人还没到打卡时间）` : ""}，已记工 ${worked} 小时`,
    };
  }
  if (period === "DAILY") {
    const trouble =
      totals.missingPunchCount > 0
        ? `，${totals.missingPunchCount} 人缺卡`
        : totals.absenceCount > 0
          ? `，${totals.absenceCount} 人缺勤`
          : "";
    return {
      title:
        totals.scheduledDays === 0 && totals.actualAttendedDays === 0
          ? "这一天没有排班"
          : `${totals.actualAttendedDays} 人到岗${trouble}`,
      sub: `${scope}应到 ${totals.scheduledDays} 人，已记工 ${worked} 小时`,
    };
  }
  return {
    title:
      totals.scheduledDays === 0
        ? "这段时间没有排班"
        : `出勤率 ${Math.round((totals.actualAttendedDays / totals.scheduledDays) * 100)}%`,
    sub:
      projectCount === null
        ? `应出勤 ${totals.scheduledDays} 天，实出勤 ${totals.actualAttendedDays} 天`
        : `${scope}${totals.participantCount} 人，记工 ${worked} 小时`,
  };
};

// ---------- 日期 ----------

export const shiftDate = (value: string, days: number): string => {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
export const shiftMonth = (value: string, months: number): string => {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, 1));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
};
/** “2026年11月”。 */
export const monthLabel = (value: string): string => {
  const [year, month] = value.split("-").map(Number);
  return year && month ? `${year}年${month}月` : value;
};
/** “11月18日 周三”。 */
export const dayLabel = (value: string): string => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : `${date.getUTCMonth() + 1}月${date.getUTCDate()}日 周${WEEKDAY[date.getUTCDay()]}`;
};
/** “11月16日 到 22日”，跨月是“11月30日 到 12月6日”，同一天只写一个。 */
export const rangeLabel = (start: string, end: string): string => {
  const [, startMonth, startDay] = start.split("-").map(Number);
  const [, endMonth, endDay] = end.split("-").map(Number);
  if (!startMonth || !startDay || !endMonth || !endDay)
    return `${start} 到 ${end}`;
  if (start === end) return `${startMonth}月${startDay}日`;
  return `${startMonth}月${startDay}日 到 ${startMonth === endMonth ? "" : `${endMonth}月`}${endDay}日`;
};

// ---------- 人 ----------

const isDaily = (row: ReportRow): row is DailyReportParticipant =>
  "isAbsent" in row;
const sum = (
  rows: readonly ReportRow[],
  pick: (row: ReportRow) => number,
): number => rows.reduce((total, row) => total + pick(row), 0);

/** 一行的出勤情况，写成一句话。复制明细时用。 */
export const rowSummary = (row: ReportRow): string =>
  isDaily(row)
    ? [
        row.isAbsent ? "缺勤" : "",
        row.isMissingPunch ? "缺卡" : "",
        row.isLate ? "迟到" : "",
        row.isEarlyLeave ? "早退" : "",
        `已批补卡 ${row.approvedMakeupCount} 次`,
        `异常 ${row.abnormalRecordCount} 次`,
      ]
        .filter(Boolean)
        .join("，")
    : `应出勤 ${row.scheduledDays} 天，实出勤 ${row.actualAttendedDays} 天，出勤率 ${row.scheduledDays === 0 ? "不适用" : `${((row.actualAttendedDays / row.scheduledDays) * 100).toFixed(1)}%`}，缺勤 ${row.absenceCount} 天，缺卡 ${row.missingPunchCount} 天，迟到 ${row.lateCount} 天，早退 ${row.earlyLeaveCount} 天，已批补卡 ${row.approvedMakeupCount} 次，异常 ${row.abnormalRecordCount} 次`;

/** 这段时间出了哪些考勤问题，按轻重排。免考勤的那几行不算。 */
const troubles = (rows: readonly ReportRow[]): readonly string[] => {
  const counted = rows.filter((row) => row.requiresAttendance);
  if (counted.length === 0) return [];
  if (counted.every(isDaily))
    return [
      counted.some((row) => row.isAbsent) ? "缺勤" : "",
      counted.some((row) => row.isMissingPunch) ? "缺卡" : "",
      counted.some((row) => row.isLate) ? "迟到" : "",
      counted.some((row) => row.isEarlyLeave) ? "早退" : "",
    ].filter(Boolean);
  const days = (pick: (row: RangeReportParticipant) => number): number =>
    sum(counted, (row) => (isDaily(row) ? 0 : pick(row)));
  return [
    ["缺勤", days((row) => row.absenceCount)] as const,
    ["缺卡", days((row) => row.missingPunchCount)] as const,
    ["迟到", days((row) => row.lateCount)] as const,
    ["早退", days((row) => row.earlyLeaveCount)] as const,
  ]
    .filter(([, count]) => count > 0)
    .map(([label, count]) => `${label} ${count} 天`);
};

/** 列表里一个人右边显示什么：有问题说问题，没问题说工时，免考勤的说免考勤。 */
export type PersonOutcome = {
  /** 考勤问题，例如“缺卡”“缺卡、迟到”“缺卡 2 天”；没有是 null。 */
  readonly bad: string | null;
  readonly hours: string;
  /** 免考勤：不计应出勤。 */
  readonly exempt: boolean;
};
export const personOutcome = (rows: readonly ReportRow[]): PersonOutcome => {
  const found = troubles(rows);
  const daily = rows.every(isDaily);
  return {
    bad:
      found.length === 0
        ? null
        : daily
          ? found.length <= 2
            ? found.join("、")
            : `${found[0]}等 ${found.length} 项`
          : found[0],
    hours: hours(sum(rows, (row) => row.workedMinutes)),
    exempt: rows.every((row) => !row.requiresAttendance),
  };
};

export type ReportPersonGroup = {
  readonly key: string;
  readonly projectId: string;
  readonly memberId: string;
  /** 这个人的几行（几个班组）。 */
  readonly rows: readonly ReportRow[];
  readonly outcome: PersonOutcome;
};

/** 按人合并，有考勤问题的排在最前面，其余保持原来的顺序。 */
export const groupReportPeople = (
  rows: readonly ReportRow[],
): readonly ReportPersonGroup[] => {
  const groups = new Map<string, ReportRow[]>();
  for (const row of rows) {
    const key = `${row.projectId}:${row.memberId}`;
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  const people = [...groups.entries()].map(([key, list]) => ({
    key,
    projectId: list[0].projectId,
    memberId: list[0].memberId,
    rows: list,
    outcome: personOutcome(list),
  }));
  return [
    ...people.filter((person) => person.outcome.bad !== null),
    ...people.filter((person) => person.outcome.bad === null),
  ];
};

export type ReportProjectGroup = {
  readonly projectId: string;
  readonly projectName: string;
  /** 日报：这一天的应到、到岗、未到（和首页项目行同一套数）；周报月报是 null。 */
  readonly day: DayHeadcount | null;
  readonly people: number;
  readonly hours: string;
  /** 周报月报是出勤率（没有排班时是 null）；日报没有。 */
  readonly rate: number | null;
  /** 有考勤问题的人数。 */
  readonly troubled: number;
};

/** 按项目分行。日报和首页一样：未到多的排前面，其余按名称；周报月报按名称。 */
export const groupReportProjects = (
  rows: readonly ReportRow[],
): readonly ReportProjectGroup[] =>
  [...new Map(rows.map((row) => [row.projectId, row.projectName])).entries()]
    .map(([projectId, projectName]) => {
      const own = rows.filter((row) => row.projectId === projectId);
      const dailyRows = own.filter(isDaily);
      const people = groupReportPeople(own);
      const scheduled = sum(own, (row) =>
        isDaily(row) ? 0 : row.scheduledDays,
      );
      return {
        projectId,
        projectName,
        people: people.length,
        hours: hours(sum(own, (row) => row.workedMinutes)),
        rate:
          own.some(isDaily) || scheduled === 0
            ? null
            : Math.round(
                (sum(own, (row) =>
                  isDaily(row) ? 0 : row.actualAttendedDays,
                ) /
                  scheduled) *
                  100,
              ),
        troubled: people.filter((person) => person.outcome.bad !== null).length,
        day: dailyRows.length === own.length && own.length > 0 ? dayHeadcount(dailyRows) : null,
      };
    })
    .sort(
      (a, b) =>
        (b.day?.missing ?? 0) - (a.day?.missing ?? 0) ||
        a.projectName.localeCompare(b.projectName, "zh"),
    );

/** 一个人这段时间的结论，放在个人明细顶上的小标牌里。 */
export const personSummary = (
  rows: readonly ReportRow[],
  period: ReportPeriod,
  from: string,
): { readonly title: string; readonly sub: string } => {
  const outcome = personOutcome(rows);
  const found = troubles(rows);
  if (period === "DAILY" || rows.every(isDaily))
    return {
      title: outcome.exempt
        ? "免考勤"
        : (outcome.bad ?? `记工 ${outcome.hours} 小时`),
      sub:
        outcome.bad === null && !outcome.exempt
          ? dayLabel(from)
          : `${dayLabel(from)}，记工 ${outcome.hours} 小时`,
    };
  const counted = rows.filter((row) => row.requiresAttendance);
  const attended = sum(counted, (row) =>
    isDaily(row) ? 0 : row.actualAttendedDays,
  );
  const scheduled = sum(counted, (row) =>
    isDaily(row) ? 0 : row.scheduledDays,
  );
  const span =
    period === "MONTHLY" ? `${Number(from.slice(5, 7))}月` : "这一周";
  return {
    title: outcome.exempt
      ? `${span}记工 ${outcome.hours} 小时`
      : `${span}出勤 ${attended} 天`,
    sub: outcome.exempt
      ? "免考勤，不算应出勤"
      : [`应出勤 ${scheduled} 天`, `记工 ${outcome.hours} 小时`, ...found].join(
          "，",
        ),
  };
};

/** 个人明细里的数字：三个工时在前，其余在“全部统计”里。 */
export const personNumbers = (
  rows: readonly ReportRow[],
): {
  readonly top: ReadonlyArray<StatNumber>;
  readonly rest: ReadonlyArray<StatNumber>;
} => {
  const count = (pick: (row: ReportRow) => number): string =>
    String(sum(rows, pick));
  const range = (pick: (row: RangeReportParticipant) => number): string =>
    count((row) => (isDaily(row) ? 0 : pick(row)));
  const red = (label: string, value: string): StatNumber => ({
    label,
    value,
    tone: value === "0" ? undefined : "bad",
  });
  return {
    top: [
      {
        label: "正常工时",
        value: hours(sum(rows, (row) => row.normalMinutes)),
      },
      {
        label: "加班工时",
        value: hours(sum(rows, (row) => row.overtimeMinutes)),
      },
      {
        label: "未分类工时",
        value: hours(sum(rows, (row) => row.unclassifiedMinutes)),
      },
    ],
    rest: [
      ...(rows.every(isDaily)
        ? []
        : [
            { label: "应出勤", value: range((row) => row.scheduledDays) },
            { label: "实出勤", value: range((row) => row.actualAttendedDays) },
            red(
              "缺勤",
              range((row) => row.absenceCount),
            ),
            red(
              "缺卡",
              range((row) => row.missingPunchCount),
            ),
            { label: "迟到", value: range((row) => row.lateCount) },
            { label: "早退", value: range((row) => row.earlyLeaveCount) },
          ]),
      { label: "补卡通过", value: count((row) => row.approvedMakeupCount) },
      { label: "异常记录", value: count((row) => row.abnormalRecordCount) },
      {
        label: "已确认违规",
        value: count((row) => row.confirmedViolationCount),
      },
    ],
  };
};

type TeamOption = {
  readonly teamId: string;
  readonly teamName: string;
  readonly projectName: string;
  readonly leaderMemberId: string | null;
  readonly leaderName: string | null;
};

/** 班组筛选的一项。公司报表里班组可能重名，带上项目。 */
export const teamFilterLabel = (team: TeamOption, withProject: boolean): string =>
  withProject ? `${team.teamName}（${team.projectName}）` : team.teamName;

/** 组长筛选：每个组长一项，后面写他带的班组。没有组长的班组不出现。 */
export const reportLeaderOptions = (
  teams: readonly TeamOption[],
): ReadonlyArray<{ readonly memberId: string; readonly label: string }> => {
  const leaders = new Map<string, { name: string; teams: string[] }>();
  for (const team of teams) {
    if (team.leaderMemberId === null) continue;
    const current = leaders.get(team.leaderMemberId) ?? {
      name: team.leaderName ?? "姓名待补录",
      teams: [],
    };
    current.teams.push(team.teamName);
    leaders.set(team.leaderMemberId, current);
  }
  return [...leaders.entries()].map(([memberId, leader]) => ({
    memberId,
    label: `${leader.name}（${leader.teams.join("、")}）`,
  }));
};

/**
 * 月度 Excel 导哪个范围：选了班组就导这个班组；按组长筛的结果没有单独的
 * Excel（一个组长可能带几个班组），返回 null；没筛就是整个项目或公司。
 */
export const reportExportTarget = <S extends string>(
  scope: S,
  scopeId: string,
  filter: { readonly teamId: string | null; readonly leaderMemberId: string | null },
): { readonly scope: S | "TEAM"; readonly scopeId: string } | null =>
  filter.teamId !== null
    ? { scope: "TEAM", scopeId: filter.teamId }
    : filter.leaderMemberId !== null
      ? null
      : { scope, scopeId };
