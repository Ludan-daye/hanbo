import type { RoleCode } from "@prisma/client";

export const TEST_ACCOUNT_CODES = ["dev-worker", "dev-team", "dev-project", "dev-company", "dev-system"] as const;
export type TestAccountCode = (typeof TEST_ACCOUNT_CODES)[number];
export type TestAccount = { readonly name: string; readonly phone: string; readonly roleCode: RoleCode };
export const TEST_ACCOUNTS: Readonly<Record<TestAccountCode, TestAccount>> = {
  "dev-worker": { name: "测试工人", phone: "13800000001", roleCode: "WORKER" },
  "dev-team": { name: "测试班组长", phone: "13800000102", roleCode: "TEAM_LEADER" },
  "dev-project": { name: "测试项目管理员", phone: "13800000103", roleCode: "PROJECT_ADMIN" },
  "dev-company": { name: "测试公司管理员", phone: "13800000104", roleCode: "COMPANY_ADMIN" },
  "dev-system": { name: "测试系统管理员", phone: "13800000105", roleCode: "SYSTEM_ADMIN" },
};
