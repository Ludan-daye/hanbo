import type {
  MemberStatusValue,
  ParticipantTypeValue,
  ProjectStatusValue,
} from "./management.types.js";

/** One project of the company and who administers it now (active PROJECT_ADMIN members). */
export type ProjectAdminsResponse = {
  readonly projects: readonly {
    readonly admins: readonly {
      readonly displayName: string | null;
      readonly isBound: boolean;
      readonly memberId: string;
      readonly participantType: ParticipantTypeValue;
      readonly phone: string;
      readonly profileId: string;
    }[];
    readonly name: string;
    readonly projectId: string;
    readonly status: ProjectStatusValue;
  }[];
};

/** One person's posts in this company's projects (never other companies'). */
export type CompanyPersonResponse = {
  readonly displayName: string | null;
  readonly isBound: boolean;
  readonly memberships: readonly {
    readonly enteredAt: string;
    readonly exitedAt: string | null;
    /** Current project evaluation, if any. */
    readonly evaluationScore: number | null;
    /** Entries, exits and team moves in this project, newest first. */
    readonly history: readonly {
      readonly recordedAt: string;
      readonly status: MemberStatusValue;
      readonly teamName: string | null;
      readonly projectRoleLabel: string;
    }[];
    readonly memberId: string;
    readonly projectId: string;
    readonly projectName: string;
    readonly projectRoleLabel: string;
    readonly projectStatus: ProjectStatusValue;
    /** Every role this membership grants: primary plus additional. */
    readonly roles: readonly {
      readonly roleCode: "PROJECT_ADMIN" | "TEAM_LEADER" | "WORKER";
      readonly teamId: string | null;
      readonly teamName: string | null;
    }[];
    readonly status: MemberStatusValue;
    readonly teamId: string | null;
    readonly teamName: string | null;
    readonly updatedAt: string;
  }[];
  readonly participantType: ParticipantTypeValue;
  readonly phone: string;
  readonly profileId: string;
};

export type OffboardRequest = {
  /** First day without the posts (Asia/Shanghai). */
  readonly effectiveDate: string;
  /** REVOKE_ADMIN keeps the person in every project as a plain member; EXIT_ALL exits them. */
  readonly mode: "EXIT_ALL" | "REVOKE_ADMIN";
};
