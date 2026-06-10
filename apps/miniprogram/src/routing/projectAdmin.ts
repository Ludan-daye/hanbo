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
