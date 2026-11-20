import type { WorkerRegistration } from "@construction/domain";

export type RegistrationVerificationStatus = "PENDING" | "VERIFIED" | "NEEDS_UPDATE";

/** A worker's 用工登记 as a project admin sees it: unmasked, with the verification state. */
export type MemberRegistrationResponse = {
  readonly displayName: string | null;
  readonly memberId: string;
  readonly phone: string;
  /** null until the worker has submitted the form. */
  readonly registration: WorkerRegistration | null;
  readonly submittedAt: string | null;
  readonly verification: {
    readonly status: RegistrationVerificationStatus;
    readonly verifiedAt: string | null;
    readonly verifiedByName: string | null;
    /** Send back as expectedVersion when marking. */
    readonly version: number;
  };
};

export type RegistrationVerificationRequest = {
  readonly expectedVersion: number;
  readonly status: Exclude<RegistrationVerificationStatus, "PENDING">;
};
