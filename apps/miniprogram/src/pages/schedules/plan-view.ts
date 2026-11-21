import type { ScheduledAttendancePoint } from "@construction/domain/attendance.js";

export const POINT_KINDS = [
  { value: "START", label: "上班" },
  { value: "END", label: "下班" },
  { value: "CHECKPOINT", label: "中途签到" },
] as const;

/** 宽限说的是哪一头：下班卡是早退，其余是迟到。 */
export const graceLabel = (kind: ScheduledAttendancePoint["kind"]): string =>
  kind === "END" ? "早退宽限" : "迟到宽限";

/** 列表里每张卡下面的一句要求。中途签到的名称可以改，所以把类型也写上。 */
export const pointRule = (
  point: Pick<ScheduledAttendancePoint, "kind" | "graceMins">,
): string =>
  `${point.kind === "CHECKPOINT" ? "中途签到，" : ""}${graceLabel(point.kind)} ${point.graceMins} 分钟`;

/**
 * 没有可以安排的对象时的说明。“由上级安排”只对班组长说得通；项目、公司管理员看到空，
 * 多半是项目已暂停或完工（只能查看），或者项目里还没有人。
 */
export const emptyScopesText = (
  highestRoleCode: string | null,
  forProject: boolean,
): string => {
  if (highestRoleCode === "COMPANY_ADMIN" || highestRoleCode === "PROJECT_ADMIN" || highestRoleCode === "SYSTEM_ADMIN")
    return forProject
      ? "这个项目已暂停或已完工，打卡安排不能再改。"
      : "你管的项目都已暂停或已完工，打卡安排不能再改。";
  return "你自己的打卡要求由上级安排。";
};
