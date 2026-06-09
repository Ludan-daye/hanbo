ALTER TABLE "schedules" ADD COLUMN "workdayMask" INTEGER NOT NULL DEFAULT 127;
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_workdayMask_check" CHECK ("workdayMask" BETWEEN 1 AND 127);
