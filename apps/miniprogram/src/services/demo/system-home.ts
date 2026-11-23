import { ApiError } from "../apiClient";
import { API_ERROR_MESSAGES } from "../error-messages";
import type { AppSettings, SystemOverview, SystemSettings } from "../workflows";

import { DEMO_SETTINGS_UPDATED_AT, type DemoState } from "./state";
import { demoCompanyAdminFilter, demoCompanyAdmins } from "./system-companies";

// 平台首页和平台设置（2026-11-23 五级第五期），和 /system/overview、/system/settings、
// /app/settings 同口径。

const SUPPORT_PHONE = /^(?:1\d{10}|0\d{2,3}-?\d{7,8}|[48]00-?\d{3}-?\d{4})$/;

const fail = (status: number, code: string): never => {
  throw new ApiError(status, API_ERROR_MESSAGES[code] ?? code, { message: code });
};

/** 旧版演示数据里的设置没有版本号。 */
export const demoSettings = (state: DemoState): SystemSettings => ({
  announcement: state.settings.announcement,
  supportPhone: state.settings.supportPhone,
  updatedAt: state.settings.updatedAt ?? DEMO_SETTINGS_UPDATED_AT,
});

export const demoAppSettings = (state: DemoState): AppSettings => ({
  announcement: state.settings.announcement,
  supportPhone: state.settings.supportPhone,
});

/** 保存平台设置：和服务器同样的检查和版本冲突。 */
export const saveDemoSettings = (
  state: DemoState,
  body: Record<string, unknown>,
): { readonly state: DemoState; readonly data: SystemSettings } => {
  const keys = Object.keys(body).sort().join(",");
  const { announcement, expectedUpdatedAt, supportPhone } = body;
  if (
    keys !== "announcement,expectedUpdatedAt,supportPhone" ||
    typeof announcement !== "string" ||
    typeof supportPhone !== "string" ||
    typeof expectedUpdatedAt !== "string" ||
    announcement.trim().length > 160 ||
    (supportPhone.trim() !== "" && !SUPPORT_PHONE.test(supportPhone.trim()))
  )
    fail(400, "INVALID_PLATFORM_SETTINGS_REQUEST");
  const current = demoSettings(state);
  if (expectedUpdatedAt !== current.updatedAt) fail(409, "PLATFORM_SETTINGS_CHANGED_RELOAD");
  const updatedAt = new Date(Math.max(Date.now(), Date.parse(current.updatedAt) + 1)).toISOString();
  const settings: SystemSettings = {
    announcement: (announcement as string).trim(),
    supportPhone: (supportPhone as string).trim(),
    updatedAt,
  };
  return { state: { ...state, settings }, data: settings };
};

/**
 * 平台首页：公司、进行中项目、在用账号，和三类待办。没有管理员、没绑定只算正常的公司；
 * 只有你能批的补卡由调用方按演示收件箱（onlyMine）数好传进来，和点进去的列表一样。
 */
export const demoSystemOverview = (state: DemoState, makeupOnlyYou: number): SystemOverview => {
  const admins = demoCompanyAdmins(state);
  const active = state.companies.filter((company) => company.status === "ACTIVE");
  const activeIds = new Set(active.map((company) => company.id));
  return {
    accounts: {
      active: state.accounts.filter((account) => account.status !== "SUSPENDED").length,
      disabled: state.accounts.filter((account) => account.status === "SUSPENDED").length,
    },
    companies: { active: active.length, suspended: state.companies.length - active.length },
    projects: { active: state.projects.filter((project) => project.status === "ACTIVE").length },
    todos: {
      companiesWithoutAdmin: active.filter((company) => demoCompanyAdminFilter(admins, company.id, "NONE")).length,
      makeupOnlyYou,
      pendingAdminInvitations: admins.filter((admin) => activeIds.has(admin.companyId) && admin.userId === null).length,
    },
  };
};

/** 平台日志要的“改了哪几项”。 */
export const demoSettingsChanged = (before: DemoState, after: unknown): readonly string[] => {
  const next = (after ?? {}) as Partial<SystemSettings>;
  return (["announcement", "supportPhone"] as const).filter((key) => before.settings[key] !== next[key]);
};
