import type { AuditCategory } from "@construction/domain";

export type AuditLogQuery = {
  readonly cursor: { readonly createdAt: Date; readonly id: string } | null;
  readonly projectId: string | null;
  readonly type: AuditCategory | null;
};

/** The platform log (system admin plan phase 4): everything, narrowed by company, type or actor. */
export type PlatformAuditLogQuery = {
  readonly actorUserId: string | null;
  readonly companyId: string | null;
  readonly cursor: AuditLogQuery["cursor"];
  readonly type: AuditCategory | null;
};

/** One operation-log entry, already written as a sentence. */
export type AuditLogEntryResponse = {
  readonly id: string;
  readonly createdAt: string;
  readonly action: string;
  readonly category: AuditCategory | null;
  readonly actorName: string | null;
  /** Who did it, so the platform log can narrow to one person (Q8). */
  readonly actorUserId: string | null;
  readonly sentence: string;
  readonly companyId: string | null;
  readonly companyName: string | null;
  readonly projectId: string | null;
  readonly projectName: string | null;
};

export type AuditLogPageResponse = {
  readonly items: readonly AuditLogEntryResponse[];
  readonly nextCursor: string | null;
};
