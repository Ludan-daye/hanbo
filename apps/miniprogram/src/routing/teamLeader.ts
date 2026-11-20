import type { MeResponse } from "../services/auth.types";

export const resolveTeamLeaderTeamId = (me: MeResponse | null): string | null => {
  if (me === null) {
    return null;
  }
  for (const assignment of me.roles.assignments) {
    if (assignment.roleCode === "TEAM_LEADER" && assignment.scope.scopeType === "TEAM") {
      return assignment.scope.scopeId;
    }
  }
  return null;
};

/**
 * 班组页面（工作安排、班组安全、班组日报、违规登记、班组考勤）用哪个班组。
 * 链接里的班组：本人是这个班组的班组长，或者对链接里的项目是项目管理员，
 * 或者是公司、平台管理员（2026-11-20 的决定 4：项目管理员可以替组长操作）。
 * 班组是否属于这个项目由服务端核对。没有可用的链接时，退回本人带的第一个班组。
 */
export const resolveManagedTeamId = (
  me: MeResponse | null,
  requestedTeamId: string | undefined,
  requestedProjectId: string | undefined,
): string | null => {
  if (requestedTeamId && me !== null) {
    const allowed = me.roles.assignments.some(
      (assignment) =>
        (assignment.roleCode === "TEAM_LEADER" &&
          assignment.scope.scopeId === requestedTeamId) ||
        (assignment.roleCode === "PROJECT_ADMIN" &&
          requestedProjectId !== undefined &&
          assignment.scope.scopeId === requestedProjectId) ||
        assignment.roleCode === "COMPANY_ADMIN" ||
        assignment.roleCode === "SYSTEM_ADMIN",
    );
    if (allowed) return requestedTeamId;
  }
  return resolveTeamLeaderTeamId(me);
};
