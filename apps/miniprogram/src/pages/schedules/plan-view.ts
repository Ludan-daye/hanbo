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
