import { apiClient } from "./client";

export type AttendancePointCode = string;
export type ParticipantType = "WORKER" | "MANAGER";

export type PendingMakeup = {
  readonly pointLabel?: string | null;
  readonly id: string;
  readonly projectId: string;
  readonly participantId: string;
  readonly participantType: ParticipantType;
  readonly attendanceDate: string;
  readonly pointCode: AttendancePointCode;
  readonly reason: string;
  readonly requestedOccurredAt: string;
  readonly requesterUserId: string;
  readonly status: "PENDING";
};

export type MakeupReviewBody = { readonly approvalReason: string };

export const fetchPendingMakeups = async (
  teamId: string,
): Promise<ReadonlyArray<PendingMakeup>> =>
  apiClient.request<ReadonlyArray<PendingMakeup>>(
    `/makeups/teams/${teamId}/pending`,
    { method: "GET" },
  );

export const approveMakeup = async (
  requestId: string,
  body: MakeupReviewBody,
): Promise<unknown> =>
  apiClient.request<unknown>(`/makeups/requests/${requestId}/approve`, {
    data: body,
    method: "POST",
  });

export const rejectMakeup = async (
  requestId: string,
  body: MakeupReviewBody,
): Promise<unknown> =>
  apiClient.request<unknown>(`/makeups/requests/${requestId}/reject`, {
    data: body,
    method: "POST",
  });

export type InboxMakeup = Omit<PendingMakeup, "status"> & {
  readonly status: "PENDING" | "APPROVED" | "REJECTED";
  readonly approvalReason: string | null;
  readonly approvedAt: string | null;
} & {
  readonly displayName: string | null;
  readonly projectName: string;
  readonly teamName: string | null;
};
export type MakeupInbox = {
  readonly items: readonly InboxMakeup[];
  readonly nextCursor: string | null;
};
export const fetchMakeupInbox = async (
  cursor: string | null,
): Promise<MakeupInbox> =>
  apiClient.request<MakeupInbox>(
    `/makeups/pending${cursor === null ? "" : `?cursor=${encodeURIComponent(cursor)}`}`,
    { method: "GET" },
  );

export const fetchReviewedMakeups = (
  cursor: string | null,
): Promise<MakeupInbox> =>
  apiClient.request(
    `/makeups/reviewed${cursor === null ? "" : `?cursor=${encodeURIComponent(cursor)}`}`,
    { method: "GET" },
  );
