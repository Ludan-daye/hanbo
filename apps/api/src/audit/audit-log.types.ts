import type { AuditCategory } from "@construction/domain";

export type AuditLogQuery = {
  readonly cursor: { readonly createdAt: Date; readonly id: string } | null;
  readonly projectId: string | null;
  readonly type: AuditCategory | null;
};

/** One operation-log entry, already written as a sentence. */
export type AuditLogEntryResponse = {
  readonly id: string;
  readonly createdAt: string;
  readonly action: string;
  readonly category: AuditCategory | null;
  readonly actorName: string | null;
  readonly sentence: string;
  readonly projectId: string | null;
  readonly projectName: string | null;
};

export type AuditLogPageResponse = {
  readonly items: readonly AuditLogEntryResponse[];
  readonly nextCursor: string | null;
};
