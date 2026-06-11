import type { MeResponse } from "../services/auth.types";

export const resolveCompanyAdminCompanyId = (me: MeResponse | null): string | null => {
  if (me === null) {
    return null;
  }
  for (const assignment of me.roles.assignments) {
    if (assignment.roleCode === "COMPANY_ADMIN" && assignment.scope.scopeType === "COMPANY") {
      return assignment.scope.scopeId;
    }
  }
  return null;
};
