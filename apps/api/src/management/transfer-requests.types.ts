import type { ParticipantTypeValue } from "./management.types.js";
import type { AdditionalMemberRole } from "./participants.types.js";

export type TransferStatusValue = "PENDING" | "APPROVED" | "REJECTED";

/** What a project admin asks for: who, from where, and the post in the target project. */
export type TransferRequestWrite = {
  readonly additionalRoles?: readonly AdditionalMemberRole[] | undefined;
  readonly enteredAt: string;
  readonly participantType: ParticipantTypeValue;
  readonly projectRoleLabel: string;
  readonly requiresAttendance: boolean;
  readonly sourceMemberId: string;
  readonly sourceProjectId: string;
  readonly teamId: string | null;
};

export type TransferRequestResponse = {
  readonly additionalRoles: readonly AdditionalMemberRole[];
  readonly createdAt: string;
  readonly createdMemberId: string | null;
  readonly displayName: string | null;
  readonly enteredAt: string;
  readonly id: string;
  readonly participantType: ParticipantTypeValue;
  readonly projectRoleLabel: string;
  readonly requestedByName: string | null;
  readonly requiresAttendance: boolean;
  readonly reviewedAt: string | null;
  readonly reviewedByName: string | null;
  readonly reviewReason: string | null;
  readonly sourceProjectId: string;
  readonly sourceProjectName: string;
  readonly status: TransferStatusValue;
  readonly targetProjectId: string;
  readonly targetProjectName: string;
  readonly teamId: string | null;
  readonly teamName: string | null;
  readonly workType: string | null;
};

export type TransferCandidatesQuery = {
  readonly page: number;
  readonly pageSize: number;
  readonly search: string;
  readonly sourceProjectId: string;
};
