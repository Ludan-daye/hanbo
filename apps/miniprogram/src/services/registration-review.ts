import type { WorkerRegistration } from "@construction/domain";

import { apiClient } from "./client";

export type RegistrationVerificationStatus =
  | "PENDING"
  | "VERIFIED"
  | "NEEDS_UPDATE";

/** 管理员看到的工人用工登记：不打码，带核实状态。 */
export type MemberRegistration = {
  readonly displayName: string | null;
  readonly memberId: string;
  readonly phone: string;
  /** 工人还没填时是 null。 */
  readonly registration: WorkerRegistration | null;
  readonly submittedAt: string | null;
  readonly verification: {
    readonly status: RegistrationVerificationStatus;
    readonly verifiedAt: string | null;
    readonly verifiedByName: string | null;
    readonly version: number;
  };
};

const registrationPath = (projectId: string, memberId: string): string =>
  `/management/projects/${encodeURIComponent(projectId)}/participants/${encodeURIComponent(memberId)}/registration`;

export const fetchMemberRegistration = (
  projectId: string,
  memberId: string,
): Promise<MemberRegistration> =>
  apiClient.request(registrationPath(projectId, memberId), { method: "GET" });

/** 标记“已核实”或“需更正”。不用写理由，也不用传凭证。 */
export const verifyMemberRegistration = (
  projectId: string,
  memberId: string,
  body: {
    readonly status: Exclude<RegistrationVerificationStatus, "PENDING">;
    readonly expectedVersion: number;
  },
): Promise<MemberRegistration> =>
  apiClient.request(`${registrationPath(projectId, memberId)}/verification`, {
    method: "POST",
    data: body,
  });
