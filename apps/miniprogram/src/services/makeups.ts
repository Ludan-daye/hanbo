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
  /** 只有公司级能批：项目里没有比申请人职级更高的项目、班组审批人。 */
  readonly onlyYou?: boolean;
  readonly projectName: string;
  readonly teamName: string | null;
};
export type MakeupInbox = {
  readonly items: readonly InboxMakeup[];
  readonly nextCursor: string | null;
};
/** 收件箱的查询串：翻页游标；从项目进来时只看这个项目（服务端过滤）。 */
const inboxQuery = (
  cursor: string | null,
  projectId: string | null,
  onlyMine = false,
): string => {
  const pairs = [
    ...(cursor === null ? [] : [`cursor=${encodeURIComponent(cursor)}`]),
    ...(onlyMine ? ["onlyMine=true"] : []),
    ...(projectId === null ? [] : [`projectId=${encodeURIComponent(projectId)}`]),
  ];
  return pairs.length === 0 ? "" : `?${pairs.join("&")}`;
};

/** onlyMine：公司管理员只看“需要你批”的（只有公司级能批的申请）。 */
export const fetchMakeupInbox = async (
  cursor: string | null,
  projectId: string | null = null,
  onlyMine = false,
): Promise<MakeupInbox> =>
  apiClient.request<MakeupInbox>(
    `/makeups/pending${inboxQuery(cursor, projectId, onlyMine)}`,
    { method: "GET" },
  );

export const fetchReviewedMakeups = (
  cursor: string | null,
  projectId: string | null = null,
): Promise<MakeupInbox> =>
  apiClient.request(`/makeups/reviewed${inboxQuery(cursor, projectId)}`, {
    method: "GET",
  });
