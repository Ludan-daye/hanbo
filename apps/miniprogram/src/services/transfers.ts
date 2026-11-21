import { apiClient } from "./client";
import type {
  AdditionalMemberRole,
  ParticipantPage,
  ParticipantType,
  ReuseProject,
} from "./management.types";

// 跨项目调人（2026-11-20 的决定 6）：项目管理员向公司管理员申请，公司管理员同意后调入。

export type TransferStatus = "PENDING" | "APPROVED" | "REJECTED";

export type TransferRequestForm = {
  readonly additionalRoles?: readonly AdditionalMemberRole[];
  readonly enteredAt: string;
  readonly participantType: ParticipantType;
  readonly projectRoleLabel: string;
  readonly requiresAttendance: boolean;
  readonly sourceMemberId: string;
  readonly sourceProjectId: string;
  readonly teamId: string | null;
};

export type TransferRequest = {
  readonly additionalRoles: readonly AdditionalMemberRole[];
  readonly createdAt: string;
  readonly createdMemberId: string | null;
  readonly displayName: string | null;
  readonly enteredAt: string;
  readonly id: string;
  readonly participantType: ParticipantType;
  readonly projectRoleLabel: string;
  readonly requestedByName: string | null;
  readonly requiresAttendance: boolean;
  readonly reviewedAt: string | null;
  readonly reviewedByName: string | null;
  readonly reviewReason: string | null;
  readonly sourceProjectId: string;
  readonly sourceProjectName: string;
  readonly status: TransferStatus;
  readonly targetProjectId: string;
  readonly targetProjectName: string;
  readonly teamId: string | null;
  readonly teamName: string | null;
  readonly workType: string | null;
};

const projectPath = (projectId: string): string =>
  `/management/projects/${encodeURIComponent(projectId)}`;
const companyPath = (companyId: string): string =>
  `/management/companies/${encodeURIComponent(companyId)}/transfer-requests`;

/** 本公司里自己不管的项目：从这些项目要人得申请。 */
export const fetchTransferSources = (
  projectId: string,
): Promise<readonly ReuseProject[]> =>
  apiClient.request(`${projectPath(projectId)}/transfer-sources`, {
    method: "GET",
  });

/** 来源项目的人，手机号中间打码。 */
export const fetchTransferCandidates = (
  projectId: string,
  sourceProjectId: string,
  options: { readonly page: number; readonly pageSize: number; readonly search: string },
): Promise<ParticipantPage> =>
  apiClient.request(
    `${projectPath(projectId)}/transfer-candidates?sourceProjectId=${encodeURIComponent(sourceProjectId)}&page=${options.page}&pageSize=${options.pageSize}&search=${encodeURIComponent(options.search)}`,
    { method: "GET" },
  );

export const fetchProjectTransfers = (
  projectId: string,
): Promise<readonly TransferRequest[]> =>
  apiClient.request(`${projectPath(projectId)}/transfer-requests`, {
    method: "GET",
  });

export const requestTransfer = (
  projectId: string,
  body: TransferRequestForm,
): Promise<TransferRequest> =>
  apiClient.request(`${projectPath(projectId)}/transfer-requests`, {
    method: "POST",
    data: body,
  });

export type TransferPage = {
  readonly items: readonly TransferRequest[];
  readonly nextCursor: string | null;
};

/** 每页 30 条；projectId 是调出或调入的项目，null 是全部。 */
export const fetchCompanyTransfers = (
  companyId: string,
  status: "PENDING" | "DONE",
  options: { readonly cursor?: string | null; readonly projectId?: string | null } = {},
): Promise<TransferPage> =>
  apiClient.request(
    `${companyPath(companyId)}?status=${status}${options.cursor ? `&cursor=${encodeURIComponent(options.cursor)}` : ""}${options.projectId ? `&projectId=${encodeURIComponent(options.projectId)}` : ""}`,
    { method: "GET" },
  );

export const reviewTransfer = (
  companyId: string,
  requestId: string,
  decision: "approve" | "reject",
  reason: string | null,
): Promise<TransferRequest> =>
  apiClient.request(
    `${companyPath(companyId)}/${encodeURIComponent(requestId)}/${decision}`,
    { method: "POST", data: reason === null ? {} : { reason } },
  );

/** 申请的状态怎么写：等公司管理员是黄三角，同意是绿方块，没同意是红圆点。 */
export const transferStatusLabel = (
  status: TransferStatus,
): { readonly kind: "warn" | "ok" | "bad"; readonly text: string } =>
  status === "PENDING"
    ? { kind: "warn", text: "等公司同意" }
    : status === "APPROVED"
      ? { kind: "ok", text: "已调入" }
      : { kind: "bad", text: "未同意" };
