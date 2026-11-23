import { ROLE_LEVEL } from "@construction/domain/roles.js";

import { ApiError } from "../apiClient";
import { API_ERROR_MESSAGES } from "../error-messages";
import type {
  Account,
  PlatformAccount,
  PlatformAccountDetail,
  PlatformAccountPage,
  PlatformAccountRole,
} from "../workflows";

import { demoMe, type DemoState } from "./state";

// 平台管理的账号（2026-11-22 五级第二期），和 /system/accounts 同口径：一个人多条身份，
// 每条写明来自哪里。演示数据里的账号仍是“一个账号一个等级”，这里的身份按 demoMe 算出来，
// 和登录后看到的一致。停用就是把演示账号的状态改成 SUSPENDED，demoMe 随即拒绝他。

const PAGE = 30;

type Result = { readonly state: DemoState; readonly data: unknown };

const fail = (status: number, code: string, extra: Record<string, unknown> = {}): never => {
  throw new ApiError(status, API_ERROR_MESSAGES[code] ?? code, { ...extra, message: code });
};

const SOURCES: Readonly<Record<PlatformAccountRole["scopeType"], PlatformAccountRole["source"]>> = {
  COMPANY: "COMPANY_APPOINTMENT",
  GLOBAL: "PLATFORM",
  PROJECT: "PROJECT_MEMBERSHIP",
  TEAM: "PROJECT_MEMBERSHIP",
};

/** demoMe 拒绝停用的账号，这里按“没停用”算他的身份。 */
const assignmentsOf = (state: DemoState, account: Account) =>
  demoMe(
    { ...state, accounts: state.accounts.map((row) => (row.id === account.id ? { ...row, status: "ACTIVE" } : row)) },
    account.id,
  );

const rolesOf = (state: DemoState, account: Account): readonly PlatformAccountRole[] => {
  const me = assignmentsOf(state, account);
  const seen = new Set<string>();
  return me.roles.assignments
    .filter((row) => {
      const key = `${row.roleCode}:${row.scope.scopeType}:${row.scope.scopeId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => ROLE_LEVEL[b.roleCode] - ROLE_LEVEL[a.roleCode])
    .map((row): PlatformAccountRole => {
      const scopeType = row.scope.scopeType as PlatformAccountRole["scopeType"];
      const scopeId = row.scope.scopeId;
      const base = { roleCode: row.roleCode, scopeId, scopeType, source: SOURCES[scopeType] };
      if (scopeType === "GLOBAL") return { ...base, companyId: null, memberId: null, projectId: null, scopeName: "全平台" };
      if (scopeType === "COMPANY")
        return {
          ...base,
          companyId: scopeId,
          memberId: null,
          projectId: null,
          scopeName: state.companies.find((company) => company.id === scopeId)?.name ?? "已删除的公司",
        };
      const team = scopeType === "TEAM" ? state.teams.find((item) => item.id === scopeId) : undefined;
      const projectId = scopeType === "TEAM" ? (team?.projectId ?? null) : scopeId;
      const project = state.projects.find((item) => item.id === projectId);
      const member = state.people.find((person) => person.profileId === me.profile.id && person.projectId === projectId);
      return {
        ...base,
        companyId: project?.companyId ?? null,
        memberId: member?.memberId ?? null,
        projectId: project?.id ?? null,
        scopeName:
          scopeType === "TEAM"
            ? team === undefined
              ? "已删除的班组"
              : `${project?.name ?? "已删除的项目"} / ${team.name}`
            : (project?.name ?? "已删除的项目"),
      };
    });
};

const rowOf = (state: DemoState, account: Account): PlatformAccount => {
  const roles = rolesOf(state, account);
  const me = assignmentsOf(state, account);
  return {
    displayName: account.name,
    highestRoleCode: roles[0]?.roleCode ?? null,
    lastLoginAt: null,
    phone: account.phone,
    profileType: me.profile.id === null ? null : account.roleCode === "WORKER" ? "WORKER" : "MANAGER",
    roleCount: roles.length,
    status: account.status === "SUSPENDED" ? "DISABLED" : "ACTIVE",
    userId: account.id,
  };
};

const detailOf = (state: DemoState, account: Account): PlatformAccountDetail => {
  const roles = rolesOf(state, account);
  const row = rowOf(state, account);
  return {
    ...row,
    activeSessionCount: row.status === "ACTIVE" ? 1 : 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    isSystemAdmin: roles.some((role) => role.roleCode === "SYSTEM_ADMIN"),
    profileId: assignmentsOf(state, account).profile.id,
    roles,
  };
};

export const demoSystemAccounts = (
  state: DemoState,
  userId: string,
  method: string,
  parts: readonly string[],
  query: Readonly<Record<string, string>>,
): Result => {
  const [, , accountId, action] = parts;
  if (accountId === undefined) {
    if (method !== "GET") return fail(404, "NOT_FOUND");
    const status = query.status ?? null;
    if (status !== null && status !== "ACTIVE" && status !== "DISABLED") fail(400, "INVALID_SYSTEM_ACCOUNT_QUERY");
    const search = (query.search ?? "").trim().toLowerCase();
    const rows = state.accounts
      .map((account) => rowOf(state, account))
      .filter(
        (row) =>
          (status === null || row.status === status) &&
          (query.role === undefined || rolesOf(state, state.accounts.find((a) => a.id === row.userId)!).some((role) => role.roleCode === query.role)) &&
          `${row.displayName}${row.phone ?? ""}`.toLowerCase().includes(search),
      );
    const cursor = query.cursor ?? null;
    const start = cursor === null ? 0 : rows.findIndex((row) => row.userId === cursor) + 1;
    const page = rows.slice(start, start + PAGE);
    const data: PlatformAccountPage = {
      items: page,
      nextCursor: rows.length > start + PAGE ? (page[page.length - 1]?.userId ?? null) : null,
    };
    return { state, data };
  }
  const account = state.accounts.find((row) => row.id === accountId) ?? fail(404, "ACCOUNT_NOT_FOUND", { userId: accountId });
  if (method === "GET" && action === undefined) return { state, data: detailOf(state, account) };
  if (method !== "POST" || (action !== "disable" && action !== "enable")) return fail(404, "NOT_FOUND");
  if (action === "disable" && account.id === userId) fail(403, "CANNOT_DISABLE_SELF", { userId: account.id });
  if (detailOf(state, account).isSystemAdmin) fail(403, "SYSTEM_ADMIN_MANAGED_BY_SCRIPT", { userId: account.id });
  const wanted = action === "disable" ? "SUSPENDED" : "ACTIVE";
  if (account.status === wanted) fail(409, "ACCOUNT_STATUS_CHANGED_RELOAD", { userId: account.id });
  const next: DemoState = {
    ...state,
    accounts: state.accounts.map((row) => (row.id === account.id ? { ...row, status: wanted } : row)),
  };
  return { state: next, data: detailOf(next, { ...account, status: wanted }) };
};
