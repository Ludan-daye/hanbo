import type { MeResponse } from "./auth.types";

/** 首页、工作台上的公司暂停说明（五级第三期，Q5）。 */
export type CompanySuspendedNotice = { readonly title: string; readonly sub: string };

/**
 * 他所在的公司暂停了就说一声：全都暂停时说清楚现在能做什么；只停了其中几家时点名。
 * 超级管理员不受暂停影响，不显示；旧版服务器不返回公司，也不显示。
 * 平台联系电话等第五期的平台设置（Q12）有了再加上。
 */
export const companySuspendedNotice = (me: MeResponse): CompanySuspendedNotice | null => {
  if (me.roles.highestRoleCode === "SYSTEM_ADMIN") return null;
  const companies = me.companies ?? [];
  const suspended = companies.filter((company) => company.status === "SUSPENDED");
  if (suspended.length === 0) return null;
  if (suspended.length === companies.length)
    return {
      title: suspended.length === 1 ? `${suspended[0]!.name}已暂停` : "你所在的公司都已暂停",
      sub: "现在只能查看和导出记录，不能打卡、补卡、审批或修改。请联系平台恢复。",
    };
  return {
    title: `${suspended.map((company) => company.name).join("、")}已暂停`,
    sub: "那里的项目只能查看和导出，不能打卡、补卡、审批或修改；别的公司照常。",
  };
};
