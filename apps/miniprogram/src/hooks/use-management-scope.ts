import Taro from "@tarojs/taro";

import { resolveAdminProjectId } from "../routing/projectAdmin";
import { resolveCompanyAdminCompanyId } from "../routing/companyAdmin";
import { resolveTeamLeaderTeamId } from "../routing/teamLeader";
import type { MeResponse } from "../services/auth.types";

export const useManagedProjectId = (me: MeResponse | null): string | null => {
  const requestedId = Taro.useRouter().params.projectId;
  const role = me?.roles.highestRoleCode;
  if (
    requestedId &&
    (role === "SYSTEM_ADMIN" ||
      role === "COMPANY_ADMIN" ||
      me?.roles.assignments.some(
        (row) =>
          row.roleCode === "PROJECT_ADMIN" && row.scope.scopeId === requestedId,
      ))
  )
    return requestedId;
  return resolveAdminProjectId(me);
};
export const useManagedCompanyId = (me: MeResponse | null): string | null => {
  const requestedId = Taro.useRouter().params.companyId;
  return requestedId && (me?.roles.highestRoleCode === "SYSTEM_ADMIN" || me?.roles.assignments.some((assignment) => assignment.roleCode === "COMPANY_ADMIN" && assignment.scope.scopeId === requestedId))
    ? requestedId
    : resolveCompanyAdminCompanyId(me);
};

export const useManagedTeamId = (me: MeResponse | null): string | null => {
  const requestedId = Taro.useRouter().params.teamId;
  if (requestedId && me?.roles.assignments.some((assignment) => assignment.roleCode === "TEAM_LEADER" && assignment.scope.scopeId === requestedId)) return requestedId;
  return resolveTeamLeaderTeamId(me);
};
