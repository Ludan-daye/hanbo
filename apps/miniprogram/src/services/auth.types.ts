export type RoleCode = "SYSTEM_ADMIN" | "COMPANY_ADMIN" | "PROJECT_ADMIN" | "TEAM_LEADER" | "WORKER";

/** 他的公司、项目、班组身份所在的公司和状态（五级第三期）。SUSPENDED 的公司只读。 */
export type MeCompany = { readonly id: string; readonly name: string; readonly status: string };

export type MeResponse = {
  /** 旧版服务器不返回，按没有处理。 */
  readonly companies?: ReadonlyArray<MeCompany>;
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
