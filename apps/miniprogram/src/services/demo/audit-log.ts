import {
  auditActionsIn,
  auditCategoryOf,
  auditSentence,
  type AuditCategory,
} from "@construction/domain";

import type { AuditLogEntry, AuditLogPage } from "../audit-log";
import type { PlatformCompanyDetail } from "../workflows";
import type { DemoState } from "./state";
import { demoSettingsChanged } from "./system-home";
import { demoSystemCompanies } from "./system-companies";

const PAGE_SIZE = 30;

/**
 * 演示里的一条写操作：“方法 路径”，谁、什么时候。平台的几种另外记下句子要用的东西
 * （公司名、被任免的人、规则版本），因为光看路径知道不了，事后状态也可能已经变了。
 */
export type DemoAuditEntry = {
  readonly id: string;
  readonly action: string;
  readonly actor: string;
  readonly createdAt: string;
  readonly detail?: Readonly<Record<string, unknown>>;
};

/** 演示的哪一份操作记录：一个项目、一家公司，或者整个平台（可以只看一家公司、一个人）。 */
export type DemoAuditScope =
  | { readonly kind: "PROJECT"; readonly projectId: string }
  | { readonly kind: "COMPANY"; readonly companyId: string }
  | {
      readonly kind: "PLATFORM";
      readonly companyId: string | null;
      readonly actorUserId: string | null;
    };

type Derived = {
  readonly action: string;
  /** 公司级的操作（建项目、离岗、公司默认、公司资料、平台对公司做的事）没有项目，记公司。 */
  readonly companyId?: string;
  readonly projectId: string | null;
  readonly target: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
};

const COMPANY_FIELDS = ["address", "contactName", "contactPhone", "creditCode", "name", "shortName"] as const;
const REGISTRATION_VIEW = /^GET \/management\/projects\/[^/]+\/participants\/[^/]+\/registration$/;

const text = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);

/**
 * 写操作成功后，平台的几种要记下的东西（在 client.ts 里和“方法 路径”一起存）。
 * before 是改之前的演示数据：撤销公司管理员之后，名单里就没有他了。
 */
export const demoAuditDetail = (
  before: DemoState,
  method: string,
  path: string,
  body: unknown,
  result: unknown,
): Readonly<Record<string, unknown>> | undefined => {
  const parts = path.split("?")[0]!.split("/").filter(Boolean);
  const data = (result ?? {}) as Record<string, unknown>;
  const sent = (body ?? {}) as Record<string, unknown>;
  if (parts[0] === "system" && parts[1] === "companies") {
    const [, , companyId, section, memberId, action] = parts;
    if (companyId === undefined) return { companyId: data.id, name: data.name };
    if (section === undefined && method === "PUT") {
      const old = demoSystemCompanies(before, "GET", ["system", "companies", companyId], {}, {}).data as PlatformCompanyDetail;
      const now = data as unknown as PlatformCompanyDetail;
      return { changed: COMPANY_FIELDS.filter((field) => old[field] !== now[field]), name: now.name };
    }
    if (section === "status") return { name: data.name, status: sent.status };
    if (section === "admins") {
      if (memberId === undefined) {
        const member = data.member as { readonly name?: unknown } | undefined;
        return { invited: data.invitation !== null && data.invitation !== undefined, name: member?.name };
      }
      const admin = (before.companyAdmins ?? []).find((row) => row.id === memberId);
      return { action, name: admin?.name ?? null };
    }
    return undefined;
  }
  if (parts[0] === "system" && parts[1] === "accounts" && parts[2] !== undefined)
    return { name: data.displayName ?? null };
  if (parts[0] === "safety-credit" && parts[1] === "policies")
    return { startsOn: data.startsOn, version: data.version };
  if (parts[0] === "system" && parts[1] === "settings" && method === "PUT")
    return { changed: demoSettingsChanged(before, result) };
  return undefined;
};

/** 查看用工资料也记（和服务器一样）：同一个人十分钟里看同一个人只记一次。 */
export const isDemoRegistrationView = (method: string, path: string): boolean =>
  REGISTRATION_VIEW.test(`${method} ${path.split("?")[0]}`);
export const recentDemoView = (
  audit: readonly DemoAuditEntry[],
  actor: string,
  action: string,
  now: number,
): boolean =>
  audit.some(
    (entry) => entry.actor === actor && entry.action === action && now - Date.parse(entry.createdAt) < 10 * 60_000,
  );

/**
 * 演示里没有真正的审计表：写操作只记了“方法 + 路径”（平台的几种另有 detail）。这里把
 * 能认出来的几种换成和真实接口一样的动作，用同一套句子显示。认不出的不列。
 */
const derive = (state: DemoState, entry: DemoAuditEntry): Derived | null => {
  const [method, fullPath] = entry.action.split(" ");
  const parts = (fullPath ?? "").split("?")[0]!.split("/").filter(Boolean);
  const detail = entry.detail ?? {};
  const teamProject = (teamId: string | undefined) =>
    state.teams.find((team) => team.id === teamId)?.projectId ?? null;
  if (parts[0] === "system" && parts[1] === "companies" && method !== "GET") {
    const [, , companyId, section, memberId, action] = parts;
    const name = text(detail.name);
    if (companyId === undefined) {
      const created = text(detail.companyId);
      return created === null
        ? null
        : { action: "COMPANY_CREATED", companyId: created, projectId: null, target: null, metadata: { name } };
    }
    if (section === undefined)
      return { action: "COMPANY_UPDATED", companyId, projectId: null, target: null, metadata: { changed: detail.changed ?? [] } };
    if (section === "status")
      return {
        action: detail.status === "SUSPENDED" ? "COMPANY_SUSPENDED" : "COMPANY_RESUMED",
        companyId,
        projectId: null,
        target: null,
        metadata: { name },
      };
    if (section === "admins") {
      if (memberId === undefined)
        return { action: "COMPANY_ADMIN_APPOINTED", companyId, projectId: null, target: name, metadata: { invited: detail.invited === true } };
      if (action === "revoke")
        return { action: "COMPANY_ADMIN_REVOKED", companyId, projectId: null, target: name, metadata: {} };
      if (action === "invitation")
        return { action: "COMPANY_ADMIN_INVITATION_ISSUED", companyId, projectId: null, target: name, metadata: {} };
    }
    return null;
  }
  if (parts[0] === "system" && parts[1] === "accounts" && parts[2] && method === "POST") {
    const action = parts[3] === "disable" ? "ACCOUNT_DISABLED" : parts[3] === "enable" ? "ACCOUNT_ENABLED" : null;
    if (action === null) return null;
    const target = text(detail.name) ?? state.accounts.find((row) => row.id === parts[2])?.name ?? null;
    return { action, projectId: null, target, metadata: {} };
  }
  if (parts[0] === "safety-credit" && parts[1] === "policies" && parts.length === 2 && method === "POST")
    return { action: "SAFETY_POLICY_PUBLISHED", projectId: null, target: null, metadata: detail };
  if (parts[0] === "system" && parts[1] === "settings" && method === "PUT")
    return { action: "PLATFORM_SETTINGS_UPDATED", projectId: null, target: null, metadata: { changed: detail.changed ?? [] } };
  if (method === "GET" && parts[0] === "management" && parts[1] === "projects" && parts[5] === "registration")
    return {
      action: "WORKER_REGISTRATION_VIEWED",
      projectId: parts[2]!,
      target: state.people.find((row) => row.projectId === parts[2] && row.memberId === parts[4])?.displayName ?? null,
      metadata: {},
    };
  if (parts[0] === "makeups" && parts[1] === "requests" && method === "POST") {
    const makeup = state.makeups.find((row) => row.id === parts[2]);
    if (!makeup) return null;
    const person = state.people.find(
      (row) =>
        row.projectId === makeup.projectId &&
        row.profileId === makeup.participantId,
    );
    return {
      action: parts[3] === "approve" ? "MAKEUP_APPROVED" : "MAKEUP_REJECTED",
      projectId: makeup.projectId,
      target: person?.displayName ?? null,
      metadata: {},
    };
  }
  if (parts[0] === "management" && parts[1] === "companies" && parts[2]) {
    const companyId = parts[2];
    if (parts[3] === "projects" && parts.length === 4 && method === "POST")
      return { action: "project.create", companyId, projectId: null, target: null, metadata: {} };
    if (parts[3] === "people" && parts[6] === "offboard" && method === "POST")
      return {
        action: "PERSONNEL_OFFBOARDED",
        companyId,
        projectId: null,
        target: state.people.find((row) => row.profileId === parts[5])?.displayName ?? null,
        metadata: {},
      };
    if (parts[3] === "attendance-defaults" && method === "PUT")
      return { action: "COMPANY_DEFAULTS_SAVED", companyId, projectId: null, target: null, metadata: {} };
    if (parts[3] === "profile" && method === "PUT")
      return { action: "COMPANY_PROFILE_UPDATED", companyId, projectId: null, target: null, metadata: {} };
    return null;
  }
  if (parts[0] === "management" && parts[1] === "projects" && parts[2]) {
    const projectId = parts[2];
    if (parts.length === 3 && method === "PUT")
      return { action: "project.update", projectId, target: null, metadata: {} };
    if (parts[3] === "participants" && parts.length === 4 && method === "POST")
      return { action: "project.member.create", projectId, target: null, metadata: {} };
    if (parts[3] === "participants" && parts.length === 5 && method === "PUT")
      return {
        action: "project.member.update",
        projectId,
        target:
          state.people.find((row) => row.memberId === parts[4])?.displayName ??
          null,
        metadata: {},
      };
    if (parts[3] === "teams" && parts.length === 5 && method === "PUT")
      return {
        action: "team.update",
        projectId,
        target: state.teams.find((row) => row.id === parts[4])?.name ?? null,
        metadata: {},
      };
    return null;
  }
  if (parts[0] === "team-work" && parts[1] === "teams" && parts[3] === "tasks") {
    const projectId = teamProject(parts[2]);
    if (projectId === null) return null;
    const title =
      state.teamWork?.tasks.find((row) => row.id === parts[4])?.title ?? null;
    if (parts.length === 4 && method === "POST")
      return { action: "TEAM_TASK_CREATED", projectId, target: null, metadata: {} };
    if (parts[7] === "start-reminder")
      return {
        action: "TEAM_TASK_START_MAKEUP_REMINDED",
        projectId,
        target: title,
        metadata: {},
      };
    if (parts[5] === "status" && method === "PUT")
      return { action: "TEAM_TASK_CLOSED", projectId, target: title, metadata: {} };
  }
  return null;
};

export const demoAuditLog = (
  state: DemoState,
  scope: DemoAuditScope,
  type: AuditCategory | null,
  cursor: string | null,
): AuditLogPage => {
  const entries: AuditLogEntry[] = [];
  for (const entry of state.audit) {
    const derived = derive(state, entry);
    if (derived === null) continue;
    const companyId =
      derived.companyId ??
      state.projects.find((row) => row.id === derived.projectId)?.companyId ??
      null;
    const inScope =
      scope.kind === "PROJECT"
        ? derived.projectId === scope.projectId
        : scope.kind === "COMPANY"
          ? companyId === scope.companyId
          : (scope.companyId === null || companyId === scope.companyId) &&
            (scope.actorUserId === null || entry.actor === scope.actorUserId);
    if (!inScope || (type !== null && !auditActionsIn(type, scope.kind).includes(derived.action)))
      continue;
    const actorName =
      state.accountProfiles?.[entry.actor]?.realName ??
      state.accounts.find((row) => row.id === entry.actor)?.name ??
      "演示账号";
    entries.push({
      id: entry.id,
      createdAt: entry.createdAt,
      action: derived.action,
      category: auditCategoryOf(derived.action, scope.kind),
      actorName,
      actorUserId: entry.actor,
      sentence: auditSentence(derived, actorName, derived.target),
      companyId,
      companyName: state.companies.find((row) => row.id === companyId)?.name ?? null,
      projectId: derived.projectId,
      projectName:
        state.projects.find((row) => row.id === derived.projectId)?.name ??
        null,
    });
  }
  const start = cursor === null ? 0 : Number(cursor) || 0;
  const end = start + PAGE_SIZE;
  return {
    items: entries.slice(start, end),
    nextCursor: entries.length > end ? String(end) : null,
  };
};
