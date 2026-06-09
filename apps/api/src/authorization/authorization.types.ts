import type { AuthorizationTargetScope, PermissionCode, PermissionsByRoleCode, ScopedRoleAssignment } from "@construction/domain/roles.js";

export type StaticPermissionTarget = {
  readonly source: "static";
  readonly targetScope: AuthorizationTargetScope;
};

export type CompanyParamPermissionTarget = {
  readonly paramName: string;
  readonly source: "companyParam";
};

export type ProjectParamPermissionTarget = {
  readonly paramName: string;
  readonly source: "projectParam";
};

export type TeamParamPermissionTarget = {
  readonly paramName: string;
  readonly source: "teamParam";
};

export type PermissionTarget =
  | CompanyParamPermissionTarget
  | ProjectParamPermissionTarget
  | StaticPermissionTarget
  | TeamParamPermissionTarget;

export type RequiredPermissionMetadata = {
  readonly permissionCode: PermissionCode;
  readonly target: PermissionTarget;
};

export type AuthorizationData = {
  readonly assignments: readonly ScopedRoleAssignment[];
  readonly permissionsByRoleCode: PermissionsByRoleCode;
};

export type RequestWithAuthorizationParams = {
  readonly params: Record<string, string | undefined>;
};

export const REQUIRED_PERMISSION_METADATA_KEY = "construction.requiredPermission";
