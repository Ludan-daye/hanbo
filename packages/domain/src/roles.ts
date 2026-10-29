export const ROLE_LEVEL = {
  WORKER: 1,
  TEAM_LEADER: 2,
  PROJECT_ADMIN: 3,
  COMPANY_ADMIN: 4,
  SYSTEM_ADMIN: 5
} as const;

export type RoleCode = keyof typeof ROLE_LEVEL;
export type PermissionCode = string;
export type ScopeType = "GLOBAL" | "COMPANY" | "PROJECT" | "TEAM";

export const GLOBAL_SCOPE_ID = "GLOBAL";

const ROLE_CODES: readonly RoleCode[] = ["SYSTEM_ADMIN", "COMPANY_ADMIN", "PROJECT_ADMIN", "TEAM_LEADER", "WORKER"];
const MAKEUP_APPROVE_PERMISSION_CODE: PermissionCode = "makeup.approve";

export type RoleAssignment = {
  readonly roleCode: RoleCode;
};

export type PermissionsByRoleCode = {
  readonly [roleCode in RoleCode]: readonly PermissionCode[];
};

export type AuthorizationAssignmentScope = {
  readonly scopeId: string;
  readonly scopeType: ScopeType;
};

export type CompanyAuthorizationTargetScope = {
  readonly companyId: string;
  readonly scopeId: string;
  readonly scopeType: "COMPANY";
};

export type ProjectAuthorizationTargetScope = {
  readonly companyId: string;
  readonly projectId: string;
  readonly scopeId: string;
  readonly scopeType: "PROJECT";
};

export type TeamAuthorizationTargetScope = {
  readonly companyId: string;
  readonly projectId: string;
  readonly scopeId: string;
  readonly scopeType: "TEAM";
  readonly teamId: string;
};

export type GlobalAuthorizationTargetScope = {
  readonly scopeId: typeof GLOBAL_SCOPE_ID;
  readonly scopeType: "GLOBAL";
};

export type AuthorizationTargetScope =
  | CompanyAuthorizationTargetScope
  | GlobalAuthorizationTargetScope
  | ProjectAuthorizationTargetScope
  | TeamAuthorizationTargetScope;

export type ScopedRoleAssignment = RoleAssignment & {
  readonly scope: AuthorizationAssignmentScope;
};

export type AuthorizationDeniedReason =
  | "MISSING_PERMISSION"
  | "NO_ASSIGNMENTS"
  | "SCOPE_MISMATCH"
  | "SELF_APPROVAL_BLOCKED";

export type AuthorizationDecision =
  | {
      readonly isAuthorized: true;
    }
  | {
      readonly isAuthorized: false;
      readonly reason: AuthorizationDeniedReason;
    };

export type AuthorizePermissionInput = {
  readonly assignments: readonly ScopedRoleAssignment[];
  readonly permissionsByRoleCode: PermissionsByRoleCode;
  readonly requiredPermissionCode: PermissionCode;
  readonly targetScope: AuthorizationTargetScope;
};

export type MakeupApprovalInput = Omit<AuthorizePermissionInput, "requiredPermissionCode"> & {
  readonly approverUserId: string;
  readonly requesterUserId: string;
};

export const roleIncludes = (ownerRole: RoleCode, requiredRole: RoleCode): boolean =>
  ROLE_LEVEL[ownerRole] >= ROLE_LEVEL[requiredRole];

export const hasRoleAtLeast = (
  assignments: readonly RoleAssignment[],
  requiredRole: RoleCode
): boolean => assignments.some((assignment: RoleAssignment): boolean => roleIncludes(assignment.roleCode, requiredRole));

export const canApproveMakeupRequest = (
  approverAssignments: readonly RoleAssignment[],
  approverUserId: string,
  requesterUserId: string
): boolean => {
  if (approverUserId === requesterUserId) {
    return false;
  }

  return hasRoleAtLeast(approverAssignments, "TEAM_LEADER");
};

export const getInheritedRoleCodes = (roleCode: RoleCode): readonly RoleCode[] =>
  ROLE_CODES.filter((candidateRoleCode: RoleCode): boolean => roleIncludes(roleCode, candidateRoleCode));

export const getEffectivePermissionCodes = (
  roleCode: RoleCode,
  permissionsByRoleCode: PermissionsByRoleCode
): readonly PermissionCode[] => {
  const permissionCodes = new Set<PermissionCode>();

  for (const inheritedRoleCode of getInheritedRoleCodes(roleCode)) {
    for (const permissionCode of permissionsByRoleCode[inheritedRoleCode]) {
      permissionCodes.add(permissionCode);
    }
  }

  return Array.from(permissionCodes);
};

const createScopeShapeError = (message: string, scope: AuthorizationTargetScope): Error =>
  new Error(
    JSON.stringify({
      message,
      scope
    })
  );

const assertTargetScopeIdentity = (targetScope: AuthorizationTargetScope): void => {
  if (targetScope.scopeType === "GLOBAL") {
    if (targetScope.scopeId !== GLOBAL_SCOPE_ID) {
      throw createScopeShapeError("Global target scope id must use GLOBAL", targetScope);
    }

    return;
  }

  if (targetScope.scopeType === "COMPANY") {
    if (targetScope.scopeId !== targetScope.companyId) {
      throw createScopeShapeError("Company target scope id must match company id", targetScope);
    }

    return;
  }

  if (targetScope.scopeType === "PROJECT") {
    if (targetScope.scopeId !== targetScope.projectId) {
      throw createScopeShapeError("Project target scope id must match project id", targetScope);
    }

    return;
  }

  if (targetScope.scopeId !== targetScope.teamId) {
    throw createScopeShapeError("Team target scope id must match team id", targetScope);
  }
};

const targetHasCompany = (
  targetScope: AuthorizationTargetScope
): targetScope is CompanyAuthorizationTargetScope | ProjectAuthorizationTargetScope | TeamAuthorizationTargetScope =>
  targetScope.scopeType === "COMPANY" || targetScope.scopeType === "PROJECT" || targetScope.scopeType === "TEAM";

const targetHasProject = (
  targetScope: AuthorizationTargetScope
): targetScope is ProjectAuthorizationTargetScope | TeamAuthorizationTargetScope =>
  targetScope.scopeType === "PROJECT" || targetScope.scopeType === "TEAM";

const targetHasTeam = (targetScope: AuthorizationTargetScope): targetScope is TeamAuthorizationTargetScope =>
  targetScope.scopeType === "TEAM";

export const scopeIncludesTarget = (
  assignmentScope: AuthorizationAssignmentScope,
  targetScope: AuthorizationTargetScope
): boolean => {
  assertTargetScopeIdentity(targetScope);

  if (assignmentScope.scopeType === "GLOBAL") {
    return assignmentScope.scopeId === GLOBAL_SCOPE_ID;
  }

  if (assignmentScope.scopeType === "COMPANY") {
    return targetHasCompany(targetScope) && assignmentScope.scopeId === targetScope.companyId;
  }

  if (assignmentScope.scopeType === "PROJECT") {
    return targetHasProject(targetScope) && assignmentScope.scopeId === targetScope.projectId;
  }

  return targetHasTeam(targetScope) && assignmentScope.scopeId === targetScope.teamId;
};

export const authorizePermission = (input: AuthorizePermissionInput): AuthorizationDecision => {
  if (input.assignments.length === 0) {
    return { isAuthorized: false, reason: "NO_ASSIGNMENTS" };
  }

  const assignmentsWithPermission = input.assignments.filter((assignment: ScopedRoleAssignment): boolean =>
    getEffectivePermissionCodes(assignment.roleCode, input.permissionsByRoleCode).includes(input.requiredPermissionCode)
  );

  if (assignmentsWithPermission.length === 0) {
    return { isAuthorized: false, reason: "MISSING_PERMISSION" };
  }

  const hasMatchingScope = assignmentsWithPermission.some((assignment: ScopedRoleAssignment): boolean =>
    scopeIncludesTarget(assignment.scope, input.targetScope)
  );

  if (!hasMatchingScope) {
    return { isAuthorized: false, reason: "SCOPE_MISMATCH" };
  }

  return { isAuthorized: true };
};

export const canApproveScopedMakeupRequest = (input: MakeupApprovalInput): AuthorizationDecision => {
  if (input.approverUserId === input.requesterUserId) {
    return { isAuthorized: false, reason: "SELF_APPROVAL_BLOCKED" };
  }

  return authorizePermission({
    assignments: input.assignments,
    permissionsByRoleCode: input.permissionsByRoleCode,
    requiredPermissionCode: MAKEUP_APPROVE_PERMISSION_CODE,
    targetScope: input.targetScope
  });
};

export const getHighestRoleCode = (assignments: readonly RoleAssignment[]): RoleCode | null => {
  let highest: RoleCode | null = null;

  for (const assignment of assignments) {
    if (highest === null || ROLE_LEVEL[assignment.roleCode] > ROLE_LEVEL[highest]) {
      highest = assignment.roleCode;
    }
  }

  return highest;
};
