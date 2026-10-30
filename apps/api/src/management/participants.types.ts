import type {
  MemberStatusValue,
  ParticipantTypeValue,
  ProjectParticipantResponse,
} from "./management.types.js";

export type AdditionalMemberRole = {
  readonly roleCode: "WORKER" | "TEAM_LEADER";
  readonly teamId: string | null;
};

export type ParticipantWriteRequest = {
  readonly additionalRoles?: readonly AdditionalMemberRole[] | undefined;
  readonly displayName: string;
  readonly phone: string;
  readonly participantType: ParticipantTypeValue;
  readonly projectRoleLabel: string;
  readonly workType: string;
  readonly teamId: string | null;
  readonly requiresAttendance: boolean;
  readonly status: MemberStatusValue;
  readonly enteredAt: string;
  readonly exitedAt: string | null;
  readonly expectedUpdatedAt: string | null;
  readonly expectedProfileUpdatedAt: string | null;
};

export type ManagedParticipantResponse = ProjectParticipantResponse & {
  readonly additionalRoles: readonly (AdditionalMemberRole & { readonly teamName: string | null })[];
  readonly workType: string | null;
  readonly enteredAt: string;
  readonly exitedAt: string | null;
  readonly updatedAt: string;
  readonly profileUpdatedAt: string;
  readonly nameStatus: "AVAILABLE" | "REQUIRES_UPDATE";
};

export type ParticipantPageQuery = {
  readonly permissionRole: "WORKER" | "TEAM_LEADER" | "PROJECT_ADMIN" | null;
  readonly page: number;
  readonly pageSize: number;
  readonly search: string;
  readonly participantType: ParticipantTypeValue | null;
  readonly teamId: string | null;
  readonly status: MemberStatusValue | null;
};

export type ParticipantPageResponse = {
  readonly items: readonly ManagedParticipantResponse[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
};

export type ReuseParticipantRequest = {
  readonly additionalRoles?: readonly AdditionalMemberRole[] | undefined;
  readonly sourceProjectId: string;
  readonly sourceMemberId: string;
  readonly participantType: ParticipantTypeValue;
  readonly expectedSourceUpdatedAt: string;
  readonly expectedProfileUpdatedAt: string;
  readonly projectRoleLabel: string;
  readonly teamId: string | null;
  readonly requiresAttendance: boolean;
  readonly enteredAt: string;
};
export type ReuseProjectResponse = {
  readonly id: string;
  readonly name: string;
};
