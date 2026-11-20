import type { MeResponse } from "../services/auth.types";

export const resolveAdminProjectId = (me: MeResponse | null): string | null => {
  if (me === null) {
    return null;
  }
  for (const assignment of me.roles.assignments) {
    if (assignment.roleCode === "PROJECT_ADMIN" && assignment.scope.scopeType === "PROJECT") {
      return assignment.scope.scopeId;
    }
  }
  return null;
};

/**
 * 能不能任免项目管理员：只有公司管理员及以上可以（2026-11-20 的决定 1）。
 * 项目管理员能安排工人和班组长，不能任命、改动或撤掉别的项目管理员。
 */
export const canGrantProjectAdmin = (me: MeResponse | null): boolean =>
  me?.roles.assignments.some(
    (assignment) =>
      assignment.roleCode === "COMPANY_ADMIN" ||
      assignment.roleCode === "SYSTEM_ADMIN",
  ) ?? false;
