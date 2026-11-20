-- Every change of a team's leader: from whom to whom, why, by whom and when.
-- Written from this migration on by the team detail leader picker and by person
-- edits (role change, transfer, exit or suspension) that drop a leadership.
-- No backfill: earlier leader changes cannot be reconstructed, so existing teams
-- start with an empty history.
CREATE TABLE "team_leader_changes" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "previousLeaderWorkerMemberId" TEXT,
    "previousLeaderManagerMemberId" TEXT,
    "leaderWorkerMemberId" TEXT,
    "leaderManagerMemberId" TEXT,
    "reason" TEXT NOT NULL,
    "changedByUserId" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_leader_changes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "team_leader_changes_teamId_changedAt_idx" ON "team_leader_changes"("teamId", "changedAt");

ALTER TABLE "team_leader_changes" ADD CONSTRAINT "team_leader_changes_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
