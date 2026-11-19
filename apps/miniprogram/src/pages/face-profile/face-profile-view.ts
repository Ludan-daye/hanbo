import { formatChinaDate, formatChinaHm } from "../../services/time";

/**
 * 底照走到哪一步，决定这一页显示哪一屏：
 * none 还没录入，pending 等管理员审核，approved 已通过，rejected 没通过，
 * other 是别的状态（比如旧照已经被换掉），都要重新拍。
 */
export type FaceStage = "none" | "pending" | "approved" | "rejected" | "other";

export const faceStage = (status: string | null | undefined): FaceStage => {
  if (status === null || status === undefined) return "none";
  if (status === "PENDING") return "pending";
  if (status === "APPROVED") return "approved";
  return status === "REJECTED" ? "rejected" : "other";
};

/** 行里的时间，例如“11-18 08:12”；不是今年的带上年份。today 是北京时间的今天。 */
export const faceTime = (isoUtc: string, today: string): string => {
  const date = formatChinaDate(isoUtc);
  const day = date.slice(0, 4) === today.slice(0, 4) ? date.slice(5) : date;
  return `${day} ${formatChinaHm(isoUtc)}`;
};

/** 红章下面那行日期，例如“11-18”。没有审核时间就不写。 */
export const stampDay = (isoUtc: string | null): string | undefined =>
  isoUtc === null ? undefined : formatChinaDate(isoUtc).slice(5);
