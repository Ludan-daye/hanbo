import type { WorkRoleScope } from "../../services/management.types";

/** 一个职级加一个范围，在列表里用作键。 */
export const scopeKey = (
  scope: Pick<WorkRoleScope, "roleCode" | "scopeId">,
): string => `${scope.roleCode}:${scope.scopeId}`;

// 班组的范围名是“项目 / 班组”，其余范围只有一个名字。
const parts = (scope: Pick<WorkRoleScope, "scopeName">): readonly string[] =>
  scope.scopeName
    .split(" / ")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

/** 页头上用的短名字：班组只写班组名。 */
export const scopeShortName = (
  scope: Pick<WorkRoleScope, "scopeName">,
): string => {
  const names = parts(scope);
  return names[names.length - 1] ?? "";
};

/** 班组所在的项目名；不是班组时没有。 */
export const scopeParentName = (
  scope: Pick<WorkRoleScope, "scopeName">,
): string | undefined => {
  const names = parts(scope);
  return names.length > 1 ? names.slice(0, -1).join("，") : undefined;
};

/** 一行里写全：“滨江花园一期，钢筋一班”。 */
export const scopeLine = (scope: Pick<WorkRoleScope, "scopeName">): string =>
  parts(scope).join("，");

/** 进入某个功能时把当前范围带过去，那一页就不用再猜是哪个项目、哪个班组。 */
export const featureUrl = (
  url: string,
  scope: WorkRoleScope | null | undefined,
): string => {
  if (scope === null || scope === undefined || scope.scopeType === "GLOBAL")
    return url;
  const query =
    scope.scopeType === "COMPANY"
      ? `companyId=${encodeURIComponent(scope.scopeId)}`
      : scope.scopeType === "PROJECT"
        ? `projectId=${encodeURIComponent(scope.scopeId)}`
        : `teamId=${encodeURIComponent(scope.scopeId)}&projectId=${encodeURIComponent(scope.projectId ?? "")}`;
  return `${url}${url.includes("?") ? "&" : "?"}${query}`;
};
