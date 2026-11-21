import type { Prisma } from "@prisma/client";

export type TeamLeaderChangeReason =
  | "TEAM_UPDATED"
  | "MEMBER_INACTIVE"
  | "MEMBER_TRANSFERRED"
  /** Company offboarding (离岗) took away their management posts. */
  | "MEMBER_OFFBOARDED";

type LeaderIds = {
  readonly leaderWorkerMemberId: string | null;
  readonly leaderManagerMemberId: string | null;
};

/**
 * Appends one row to a team's leader history when the leader actually changes.
 * Call it in the same transaction as the change itself.
 */
export const recordTeamLeaderChange = async (
  db: Prisma.TransactionClient,
  input: {
    readonly teamId: string;
    readonly projectId: string;
    readonly previous: LeaderIds;
    readonly next: LeaderIds;
    readonly reason: TeamLeaderChangeReason;
    readonly changedByUserId: string;
  },
): Promise<void> => {
  if (
    input.previous.leaderWorkerMemberId === input.next.leaderWorkerMemberId &&
    input.previous.leaderManagerMemberId === input.next.leaderManagerMemberId
  )
    return;
  await db.teamLeaderChange.create({
    data: {
      changedByUserId: input.changedByUserId,
      leaderManagerMemberId: input.next.leaderManagerMemberId,
      leaderWorkerMemberId: input.next.leaderWorkerMemberId,
      previousLeaderManagerMemberId: input.previous.leaderManagerMemberId,
      previousLeaderWorkerMemberId: input.previous.leaderWorkerMemberId,
      projectId: input.projectId,
      reason: input.reason,
      teamId: input.teamId,
    },
  });
};
