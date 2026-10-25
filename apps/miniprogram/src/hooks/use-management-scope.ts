import Taro from "@tarojs/taro";

import { resolveAdminProjectId } from "../routing/projectAdmin";
import { resolveCompanyAdminCompanyId } from "../routing/companyAdmin";
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
  return requestedId && me?.roles.highestRoleCode === "SYSTEM_ADMIN"
    ? requestedId
    : resolveCompanyAdminCompanyId(me);
};
