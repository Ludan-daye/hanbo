export type RoleCode = "SYSTEM_ADMIN" | "COMPANY_ADMIN" | "PROJECT_ADMIN" | "TEAM_LEADER" | "WORKER";

export type MeResponse = {
  readonly user: { readonly id: string; readonly isBound: boolean; readonly status: string };
  readonly profile: { readonly type: "WORKER" | "MANAGER" | null; readonly id: string | null };
  readonly roles: {
    readonly assignments: ReadonlyArray<{ readonly roleCode: RoleCode; readonly scope: { readonly scopeType: string; readonly scopeId: string } }>;
    readonly highestRoleCode: RoleCode | null;
  };
};

export type LoginResponse = {
  readonly accessToken: string;
  readonly refreshToken: string;
};
