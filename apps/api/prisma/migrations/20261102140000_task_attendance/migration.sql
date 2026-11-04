-- AlterTable
ALTER TABLE "project_worker_members" ADD COLUMN     "taskAttendanceOnly" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "attendance_records" ADD COLUMN     "taskAssignmentId" TEXT;

-- AlterTable
ALTER TABLE "project_member_histories" ADD COLUMN     "taskAttendanceOnly" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "team_task_assignments" ADD COLUMN     "exitConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "exitConfirmedByUserId" TEXT,
ADD COLUMN     "finishedAt" TIMESTAMP(3),
ADD COLUMN     "startedAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_taskAssignmentId_fkey" FOREIGN KEY ("taskAssignmentId") REFERENCES "team_task_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


CREATE OR REPLACE FUNCTION record_worker_membership_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND ROW(NEW."teamId", NEW."status", NEW."requiresAttendance", NEW."enteredAt", NEW."exitedAt", NEW."projectRoleLabel", NEW."taskAttendanceOnly")
    IS NOT DISTINCT FROM ROW(OLD."teamId", OLD."status", OLD."requiresAttendance", OLD."enteredAt", OLD."exitedAt", OLD."projectRoleLabel", OLD."taskAttendanceOnly") THEN
    RETURN NEW;
  END IF;
  INSERT INTO "project_member_histories" (
    "id", "projectId", "workerMemberId", "teamId", "event", "version", "status", "requiresAttendance",
    "enteredAt", "exitedAt", "projectRoleLabel", "roleCode", "taskAttendanceOnly"
  ) VALUES (
    gen_random_uuid()::text, NEW."projectId", NEW."id", NEW."teamId",
    CASE WHEN TG_OP = 'INSERT' THEN 'CREATED'::"MemberHistoryEvent" ELSE 'UPDATED'::"MemberHistoryEvent" END,
    (SELECT coalesce(max("version"), 0) + 1 FROM "project_member_histories" WHERE "workerMemberId" = NEW."id"),
    NEW."status", NEW."requiresAttendance", NEW."enteredAt", NEW."exitedAt", NEW."projectRoleLabel", CASE WHEN NEW."projectRoleLabel" = 'PROJECT_ADMIN' THEN 'PROJECT_ADMIN'::"RoleCode" WHEN NEW."projectRoleLabel" = 'TEAM_LEADER' THEN 'TEAM_LEADER'::"RoleCode" ELSE 'WORKER'::"RoleCode" END, NEW."taskAttendanceOnly"
  );
  RETURN NEW;
END;
$$;

ALTER TABLE "team_task_assignments" ADD CONSTRAINT "task_clock_order_check" CHECK (("finishedAt" IS NULL OR ("startedAt" IS NOT NULL AND "finishedAt" > "startedAt")) AND ("exitConfirmedAt" IS NULL OR ("finishedAt" IS NOT NULL AND "exitConfirmedByUserId" IS NOT NULL)));
CREATE INDEX "task_clock_active_worker_idx" ON "team_task_assignments" ("memberId") WHERE "startedAt" IS NOT NULL AND "finishedAt" IS NULL;
