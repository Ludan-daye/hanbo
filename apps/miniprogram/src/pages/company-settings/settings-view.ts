import {
  attendanceDefaultsError,
  worktimeRuleError,
  type ScheduledAttendancePoint,
} from "@construction/domain";

import type {
  CompanyAttendanceDefaults,
  CompanyAttendanceDefaultValues,
} from "../../services/management.types";

// 公司设置和新建项目要写的字，不碰界面，方便单测。

const DAYS = "一二三四五六日";

/** “周一到周六”“周一、三、五”“每天”。 */
export const workdaysText = (workdays: readonly number[]): string => {
  const days = [...workdays].sort((a, b) => a - b);
  if (days.length === 7) return "每天";
  const consecutive = days.every((day, index) => index === 0 || day === days[index - 1]! + 1);
  if (consecutive && days.length > 2)
    return `周${DAYS[days[0]! - 1]}到周${DAYS[days[days.length - 1]! - 1]}`;
  return `周${days.map((day) => DAYS[day - 1]).join("、")}`;
};

/** 一行摘要：“一天三次，7:30 上班，周一到周六；加班 18:30 起”。 */
export const defaultsSummary = (values: CompanyAttendanceDefaultValues): string => {
  const first = values.points[0];
  return [
    `${values.name}，每天 ${values.points.length} 张卡${first ? `，${first.time} ${first.label}` : ""}`,
    workdaysText(values.workdays),
    values.worktime.overtimeStart === null ? "不区分加班" : `加班 ${values.worktime.overtimeStart} 起`,
  ].join("，");
};

/** 新建项目里“套用公司默认”下面的一句。 */
export const createProjectDefaultsText = (
  defaults: CompanyAttendanceDefaults | null,
): string =>
  defaults === null
    ? "正在读取公司默认…"
    : defaults.current === null
      ? `公司还没设默认，新项目先用平台默认：${defaultsSummary(defaults.fallback)}。`
      : `建好当天起用：${defaultsSummary(defaults.current)}。之后项目可以自己改。`;

/** 保存前的校验，和服务端同一套（domain）。 */
export const defaultsProblem = (values: CompanyAttendanceDefaultValues): string | null =>
  attendanceDefaultsError(values) ?? worktimeRuleError(values.worktime);

/** 在最后两张卡中间加一张中途签到；挨得太近返回 null。 */
export const withCheckpoint = (
  points: readonly ScheduledAttendancePoint[],
  code: string,
): readonly ScheduledAttendancePoint[] | null => {
  const before = points[points.length - 2];
  const last = points[points.length - 1];
  if (!before || !last) return null;
  const minutes = (value: string): number => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  const middle = Math.floor((minutes(before.time) + minutes(last.time)) / 2);
  if (middle <= minutes(before.time)) return null;
  return [
    ...points.slice(0, -1),
    {
      code,
      graceMins: 0,
      kind: "CHECKPOINT",
      label: "中途签到",
      time: `${String(Math.floor(middle / 60)).padStart(2, "0")}:${String(middle % 60).padStart(2, "0")}`,
    },
    last,
  ];
};
