import {
  attendanceDefaultsError,
  defaultAttendancePoints,
  defaultWorktimeRule,
  worktimeRuleError,
} from "@construction/domain";

import { ApiError } from "../apiClient";
import type {
  CompanyAttendanceDefaults,
  CompanyAttendanceDefaultValues,
  CompanyProfile,
} from "../management.types";
import { chinaToday } from "../time";

import type { DemoPlan } from "./plans";
import { demoId, type DemoState } from "./state";

// 公司设置（2026-11-21 第四期）：公司默认打卡和工时、公司资料，和服务端同口径。

export type DemoCompanyDefault = CompanyAttendanceDefaultValues & {
  readonly companyId: string;
  readonly createdAt: string;
  readonly createdByName: string | null;
  readonly version: number;
};
export type DemoCompanyProfile = Pick<CompanyProfile, "address" | "contactName" | "contactPhone" | "updatedAt">;

const FALLBACK: CompanyAttendanceDefaultValues = {
  name: "每日两次",
  points: defaultAttendancePoints,
  workdays: [1, 2, 3, 4, 5, 6, 7],
  worktime: defaultWorktimeRule,
};
const latest = (state: DemoState, companyId: string): DemoCompanyDefault | undefined =>
  (state.companyDefaults ?? [])
    .filter((row) => row.companyId === companyId)
    .sort((a, b) => b.version - a.version)[0];

export const demoCompanyDefaults = (state: DemoState, companyId: string): CompanyAttendanceDefaults => {
  const current = latest(state, companyId);
  return {
    companyId,
    current: current === undefined ? null : current,
    fallback: FALLBACK,
    latestVersion: current?.version ?? 0,
  };
};

export const saveDemoCompanyDefaults = (
  state: DemoState,
  userId: string,
  companyId: string,
  body: CompanyAttendanceDefaultValues & { readonly expectedVersion: number },
): { readonly state: DemoState; readonly data: CompanyAttendanceDefaults } => {
  const problem = attendanceDefaultsError(body) ?? worktimeRuleError(body.worktime);
  if (problem !== null)
    throw new ApiError(400, problem, { message: "INVALID_COMPANY_DEFAULTS" });
  const version = latest(state, companyId)?.version ?? 0;
  if (version !== body.expectedVersion)
    throw new ApiError(409, "别人刚改过公司默认，请重新打开再改。", { message: "COMPANY_DEFAULTS_VERSION_CONFLICT" });
  const row: DemoCompanyDefault = {
    companyId,
    createdAt: new Date().toISOString(),
    createdByName: state.accountProfiles?.[userId]?.realName ?? "公司管理员",
    name: body.name.trim(),
    points: body.points,
    version: version + 1,
    workdays: [...body.workdays].sort((a, b) => a - b),
    worktime: body.worktime,
  };
  const next = { ...state, companyDefaults: [...(state.companyDefaults ?? []), row] };
  return { state: next, data: demoCompanyDefaults(next, companyId) };
};

/** 新建项目时套用：项目排班和第一版工时规则，从计划开工和今天中较晚的一天起。 */
export const applyDemoCompanyDefaults = (
  state: DemoState,
  userId: string,
  companyId: string,
  projectId: string,
  plannedStartDate: string,
): { readonly state: DemoState; readonly version: number | null } => {
  const current = latest(state, companyId);
  if (current === undefined) return { state, version: null };
  const startsOn = plannedStartDate > chinaToday() ? plannedStartDate : chinaToday();
  const plan: DemoPlan = {
    authorLevel: 4,
    authorUserId: userId,
    endsOn: null,
    id: demoId("plan"),
    inherit: false,
    label: "整个项目",
    name: current.name,
    points: current.points,
    projectId,
    scopeId: projectId,
    scopeType: "PROJECT",
    startsOn,
    workdays: current.workdays,
  };
  return {
    state: {
      ...state,
      plans: [...(state.plans ?? []), plan],
      worktimeRules: [...(state.worktimeRules ?? []), { config: current.worktime, projectId, startsOn, version: 1 }],
    },
    version: current.version,
  };
};

export const demoCompanyProfile = (state: DemoState, companyId: string): CompanyProfile => {
  const company = state.companies.find((row) => row.id === companyId);
  if (!company) throw new ApiError(404, "公司不存在或已停用。", { message: "COMPANY_NOT_FOUND" });
  const extra = state.companyProfiles?.[companyId];
  return {
    address: extra?.address ?? null,
    contactName: extra?.contactName ?? null,
    contactPhone: extra?.contactPhone ?? null,
    creditCode: company.creditCode ?? null,
    id: company.id,
    name: company.name,
    shortName: company.shortName ?? null,
    status: company.status,
    updatedAt: extra?.updatedAt ?? "2026-01-01T00:00:00.000Z",
  };
};

export const updateDemoCompanyProfile = (
  state: DemoState,
  companyId: string,
  body: Record<string, unknown>,
): { readonly state: DemoState; readonly data: CompanyProfile } => {
  const current = demoCompanyProfile(state, companyId);
  const allowed = new Set(["address", "contactName", "contactPhone", "expectedUpdatedAt"]);
  if (Object.keys(body).some((key) => !allowed.has(key)))
    throw new ApiError(400, "公司资料填得不对，请检查联系电话。", { message: "INVALID_COMPANY_PROFILE" });
  if (body.expectedUpdatedAt !== current.updatedAt)
    throw new ApiError(409, "公司资料刚被改过，请重新打开再改。", { message: "COMPANY_CHANGED_RELOAD_BEFORE_SAVING" });
  const text = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value.trim() : null);
  const next: DemoState = {
    ...state,
    companyProfiles: {
      ...state.companyProfiles,
      [companyId]: {
        address: text(body.address),
        contactName: text(body.contactName),
        contactPhone: text(body.contactPhone),
        updatedAt: new Date().toISOString(),
      },
    },
  };
  return { state: next, data: demoCompanyProfile(next, companyId) };
};
