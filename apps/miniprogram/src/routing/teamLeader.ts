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
