import { apiClient } from "./client";

export type AttendancePointCode = "SEGMENT_1_START" | "SEGMENT_1_END" | "SEGMENT_2_START" | "SEGMENT_2_END";
export type ParticipantType = "WORKER" | "MANAGER";

export type PendingMakeup = {
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

export const fetchPendingMakeups = async (teamId: string): Promise<ReadonlyArray<PendingMakeup>> =>
  apiClient.request<ReadonlyArray<PendingMakeup>>(`/makeups/teams/${teamId}/pending`, { method: "GET" });

export const approveMakeup = async (requestId: string, body: MakeupReviewBody): Promise<unknown> =>
  apiClient.request<unknown>(`/makeups/requests/${requestId}/approve`, { data: body, method: "POST" });

export const rejectMakeup = async (requestId: string, body: MakeupReviewBody): Promise<unknown> =>
  apiClient.request<unknown>(`/makeups/requests/${requestId}/reject`, { data: body, method: "POST" });
