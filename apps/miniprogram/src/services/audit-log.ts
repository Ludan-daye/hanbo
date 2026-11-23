import type { AuditCategory } from "@construction/domain";

import { apiClient } from "./client";

/** 操作记录的一条：已经写成一句话。 */
export type AuditLogEntry = {
  readonly id: string;
  readonly createdAt: string;
  readonly action: string;
  readonly category: AuditCategory | null;
  readonly actorName: string | null;
  /** 谁做的；平台日志点一条可以只看这个人的。 */
  readonly actorUserId: string | null;
  readonly sentence: string;
  /** 属于哪家公司；账号、超级管理员、信用规则这些平台的事是 null。 */
  readonly companyId: string | null;
  readonly companyName: string | null;
  readonly projectId: string | null;
  readonly projectName: string | null;
};
export type AuditLogPage = {
  readonly items: readonly AuditLogEntry[];
  readonly nextCursor: string | null;
};
/** 看哪一份：一个项目、一家公司，或者整个平台（超级管理员）。 */
export type AuditLogScope =
  | { readonly kind: "PROJECT" | "COMPANY"; readonly id: string }
  | { readonly kind: "PLATFORM" };
/** 平台日志另外能只看一家公司、一个人。 */
export type AuditLogNarrow = {
  readonly companyId: string | null;
  readonly actorUserId: string | null;
};
export const NO_NARROW: AuditLogNarrow = { actorUserId: null, companyId: null };

const pathOf = (scope: AuditLogScope): string =>
  scope.kind === "PLATFORM"
    ? "/system/audit-logs"
    : `/management/${scope.kind === "PROJECT" ? "projects" : "companies"}/${encodeURIComponent(scope.id)}/audit-logs`;

/** 操作记录，新的在前，一次 30 条。 */
export const fetchAuditLog = (
  scope: AuditLogScope,
  type: AuditCategory | null,
  cursor: string | null,
  narrow: AuditLogNarrow = NO_NARROW,
): Promise<AuditLogPage> => {
  const platform = scope.kind === "PLATFORM";
  const query = [
    platform && narrow.companyId !== null ? `companyId=${encodeURIComponent(narrow.companyId)}` : null,
    platform && narrow.actorUserId !== null ? `actorUserId=${encodeURIComponent(narrow.actorUserId)}` : null,
    type === null ? null : `type=${type}`,
    cursor === null ? null : `cursor=${encodeURIComponent(cursor)}`,
  ]
    .filter(Boolean)
    .join("&");
  return apiClient.request(`${pathOf(scope)}${query ? `?${query}` : ""}`, { method: "GET" });
};
