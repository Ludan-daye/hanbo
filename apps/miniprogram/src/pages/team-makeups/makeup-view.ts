import type { InboxMakeup } from "../../services/makeups";

export const ALL_SCOPES = "全部范围";

const POINT_LABEL: Readonly<Record<string, string>> = {
  SEGMENT_1_END: "上午下班",
  SEGMENT_1_START: "上午上班",
  SEGMENT_2_END: "下午下班",
  SEGMENT_2_START: "下午上班",
};

/** 申请属于哪个项目、哪个班组；也用作范围筛选的键。 */
export const scopeLabel = (
  item: Pick<InboxMakeup, "projectName" | "teamName">,
): string => `${item.projectName}，${item.teamName ?? "项目直属"}`;

/** 一个项目下所有班组（含项目直属）合在一起的范围。 */
export type ProjectScope = {
  readonly projectId: string;
  readonly label: string;
};

/**
 * 带 projectId 进来（项目首页的“补卡申请 N 条”）时，范围里多一项“某项目，全部班组”，
 * 默认选它，和首页数的是同一批申请。列表里还没有这个项目的申请时没有这一项。
 */
export const projectScope = (
  items: readonly Pick<InboxMakeup, "projectId" | "projectName">[],
  projectId: string | null,
): ProjectScope | null => {
  if (projectId === null) return null;
  const found = items.find((item) => item.projectId === projectId);
  return found === undefined
    ? null
    : { projectId, label: `${found.projectName}，全部班组` };
};

/** 这条申请在不在选中的范围里。 */
export const inScope = (
  item: Pick<InboxMakeup, "projectId" | "projectName" | "teamName">,
  scope: string,
  project: ProjectScope | null,
): boolean =>
  scope === ALL_SCOPES ||
  (project !== null && scope === project.label
    ? item.projectId === project.projectId
    : scopeLabel(item) === scope);

/** 补的是哪张卡。 */
export const pointName = (
  item: Pick<InboxMakeup, "pointLabel" | "pointCode">,
): string => item.pointLabel ?? POINT_LABEL[item.pointCode] ?? "打卡";

/** “2026-11-17” 写成 “11月17日”。 */
export const makeupDay = (date: string): string => {
  const [, month, day] = date.split("-");
  return month && day ? `${Number(month)}月${Number(day)}日` : date;
};

/**
 * 待审批的申请一次只展开一条：点过的那条；没点过或者那条已经不在了，就是第一条。
 * 它前面和后面的各收成一行，位置不变。
 */
export const arrangePending = <T extends { readonly id: string }>(
  items: readonly T[],
  openId: string | null,
): {
  readonly before: readonly T[];
  readonly open: T | null;
  readonly after: readonly T[];
} => {
  const found = items.findIndex((item) => item.id === openId);
  const index = found >= 0 ? found : 0;
  return {
    before: items.slice(0, index),
    open: items[index] ?? null,
    after: items.slice(index + 1),
  };
};
