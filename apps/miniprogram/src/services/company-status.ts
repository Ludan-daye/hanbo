import type { MeResponse } from "./auth.types";

/** 首页、工作台上的公司暂停说明（五级第三期，Q5）。 */
export type CompanySuspendedNotice = { readonly title: string; readonly sub: string };

/**
 * 他所在的公司暂停了就说一声：全都暂停时说清楚现在能做什么；只停了其中几家时点名。
 * 超级管理员不受暂停影响，不显示；旧版服务器不返回公司，也不显示。
 * 平台设了联系电话（五级第五期，Q12）就写上。
 */
export const companySuspendedNotice = (
  me: MeResponse,
  supportPhone: string | null = null,
): CompanySuspendedNotice | null => {
  if (me.roles.highestRoleCode === "SYSTEM_ADMIN") return null;
  const companies = me.companies ?? [];
  const suspended = companies.filter((company) => company.status === "SUSPENDED");
  if (suspended.length === 0) return null;
  const phone = supportPhone?.trim() ?? "";
  if (suspended.length === companies.length)
    return {
      title: suspended.length === 1 ? `${suspended[0]!.name}已暂停` : "你所在的公司都已暂停",
      sub: `现在只能查看和导出记录，不能打卡、补卡、审批或修改。请联系平台恢复${phone === "" ? "" : `，电话 ${phone}`}。`,
    };
  return {
    title: `${suspended.map((company) => company.name).join("、")}已暂停`,
    sub: `那里的项目只能查看和导出，不能打卡、补卡、审批或修改；别的公司照常。${
      phone === "" ? "" : `要恢复请联系平台，电话 ${phone}。`
    }`,
  };
};
