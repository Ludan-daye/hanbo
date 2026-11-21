import type { RoleCode } from "@prisma/client";

export const TEST_ACCOUNT_CODES = ["dev-worker", "dev-team", "dev-project", "dev-company", "dev-system", "dev-worker-2"] as const;
export type TestAccountCode = (typeof TEST_ACCOUNT_CODES)[number];
export type TestAccount = {
  readonly name: string;
  readonly phone: string;
  readonly roleCode: RoleCode;
  /** Defaults to the account code. */
  readonly openid?: string;
  /**
   * A pure worker in no project (2026-11-21, for the temporary-worker flow): created unbound
   * by provisioning if missing; may only ever hold WORKER roles and no manager profile.
   */
  readonly projectless?: true;
};
export const TEST_ACCOUNTS: Readonly<Record<TestAccountCode, TestAccount>> = {
  "dev-worker": { name: "测试工人", phone: "13800000001", roleCode: "WORKER" },
  "dev-team": { name: "测试班组长", phone: "13800000102", roleCode: "TEAM_LEADER" },
  "dev-project": { name: "测试项目管理员", phone: "13800000103", roleCode: "PROJECT_ADMIN" },
  "dev-company": { name: "测试公司管理员", phone: "13800000104", roleCode: "COMPANY_ADMIN" },
  "dev-system": { name: "测试系统管理员", phone: "13800000105", roleCode: "SYSTEM_ADMIN" },
  // Its own openid: the dev seed already uses "dev-worker-2" for a project member (李二).
  "dev-worker-2": { name: "测试临时工", phone: "13800000106", roleCode: "WORKER", openid: "test-login-worker-2", projectless: true },
};

export const testAccountOpenid = (code: TestAccountCode): string => TEST_ACCOUNTS[code].openid ?? code;

/** Whether a user still fits a test account: roles, binding and profiles as provisioned. */
export const fitsTestAccount = (
  code: TestAccountCode,
  user: {
    readonly isBound: boolean;
    readonly status: string;
    readonly managerProfile?: unknown;
    readonly workerProfile?: unknown;
  },
  highestRoleCode: RoleCode | null,
): boolean => {
  const account = TEST_ACCOUNTS[code];
  if (user.status !== "ACTIVE") return false;
  if (account.projectless === true)
    return (user.managerProfile ?? null) === null && (highestRoleCode === null || highestRoleCode === "WORKER");
  return user.isBound && highestRoleCode === account.roleCode;
};
