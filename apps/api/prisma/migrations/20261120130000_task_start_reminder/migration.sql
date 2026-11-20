-- A manager marks that a temporary worker forgot the task start punch. This only
-- points the worker to a start makeup request; it never writes "startedAt".
ALTER TABLE "team_task_assignments"
  ADD COLUMN "startReminderAt" TIMESTAMP(3),
  ADD COLUMN "startReminderByUserId" TEXT;
