import type { ParticipantTypeValue } from "./management.types.js";

export type TeamLeaderReference = {
  readonly memberId: string;
  readonly participantType: ParticipantTypeValue;
};
export type TeamWriteRequest = {
  readonly name: string;
  readonly status: "ACTIVE" | "SUSPENDED";
  readonly workType: string | null;
  readonly remark: string | null;
  readonly leader: TeamLeaderReference | null;
  readonly expectedUpdatedAt: string;
};
export type ManagedTeamResponse = {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly status: string;
  readonly workType: string | null;
  readonly remark: string | null;
  readonly updatedAt: string;
  readonly memberCount: number;
  readonly leader:
    | (TeamLeaderReference & {
        readonly displayName: string | null;
        readonly phone: string;
      })
    | null;
};
/** One row of a team's leader history, names resolved for display. */
export type TeamLeaderChangeResponse = {
  readonly id: string;
  readonly changedAt: string;
  readonly reason: "TEAM_UPDATED" | "MEMBER_INACTIVE" | "MEMBER_TRANSFERRED";
  readonly previousLeaderName: string | null;
  readonly leaderName: string | null;
  readonly changedByName: string | null;
};
