import type { ParticipantTypeValue } from "./management.types.js";
import type { AdditionalMemberRole } from "./participants.types.js";

export type TransferStatusValue = "PENDING" | "APPROVED" | "REJECTED";
/** 调走 (the source membership exits on approval) or 兼任 (keeps it). */
export type TransferModeValue = "MOVE" | "CONCURRENT";

/** What a project admin asks for: who, from where, and the post in the target project. */
export type TransferRequestWrite = {
  readonly additionalRoles?: readonly AdditionalMemberRole[] | undefined;
  readonly enteredAt: string;
  readonly mode: TransferModeValue;
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
  readonly mode: TransferModeValue;
  readonly participantType: ParticipantTypeValue;
  readonly projectRoleLabel: string;
  readonly requestedByName: string | null;
  readonly requiresAttendance: boolean;
  readonly reviewedAt: string | null;
  readonly reviewedByName: string | null;
  readonly reviewReason: string | null;
  /**
   * Exit date stored on the source membership for an approved 调走 (the day before entry,
   * or the source entry day when that would precede it); null otherwise.
   */
  readonly sourceExitedAt: string | null;
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

export type TransferRequestPage = {
  readonly items: readonly TransferRequestResponse[];
  readonly nextCursor: string | null;
};
