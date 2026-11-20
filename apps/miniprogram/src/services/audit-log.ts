import type { AuditCategory } from "@construction/domain";

import { apiClient } from "./client";

/** 操作记录的一条：已经写成一句话。 */
export type AuditLogEntry = {
  readonly id: string;
  readonly createdAt: string;
  readonly action: string;
  readonly category: AuditCategory | null;
  readonly actorName: string | null;
  readonly sentence: string;
  readonly projectId: string | null;
  readonly projectName: string | null;
};
export type AuditLogPage = {
  readonly items: readonly AuditLogEntry[];
  readonly nextCursor: string | null;
};
export type AuditLogScope = {
  readonly kind: "PROJECT" | "COMPANY";
  readonly id: string;
};

/** 项目或公司的操作记录，新的在前，一次 30 条。 */
export const fetchAuditLog = (
  scope: AuditLogScope,
  type: AuditCategory | null,
  cursor: string | null,
): Promise<AuditLogPage> => {
  const query = [
    type === null ? null : `type=${type}`,
    cursor === null ? null : `cursor=${encodeURIComponent(cursor)}`,
  ]
    .filter(Boolean)
    .join("&");
  return apiClient.request(
    `/management/${scope.kind === "PROJECT" ? "projects" : "companies"}/${encodeURIComponent(scope.id)}/audit-logs${query ? `?${query}` : ""}`,
    { method: "GET" },
  );
};
