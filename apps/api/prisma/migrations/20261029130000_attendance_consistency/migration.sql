CREATE OR REPLACE FUNCTION record_worker_membership_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND ROW(NEW."teamId", NEW."status", NEW."requiresAttendance", NEW."enteredAt", NEW."exitedAt", NEW."projectRoleLabel")
    IS NOT DISTINCT FROM ROW(OLD."teamId", OLD."status", OLD."requiresAttendance", OLD."enteredAt", OLD."exitedAt", OLD."projectRoleLabel") THEN
    RETURN NEW;
  END IF;
  INSERT INTO "project_member_histories" (
    "id", "projectId", "workerMemberId", "teamId", "event", "version", "status", "requiresAttendance",
    "enteredAt", "exitedAt", "projectRoleLabel", "roleCode"
  ) VALUES (
    gen_random_uuid()::text, NEW."projectId", NEW."id", NEW."teamId",
    CASE WHEN TG_OP = 'INSERT' THEN 'CREATED'::"MemberHistoryEvent" ELSE 'UPDATED'::"MemberHistoryEvent" END,
    (SELECT coalesce(max("version"), 0) + 1 FROM "project_member_histories" WHERE "workerMemberId" = NEW."id"),
    NEW."status", NEW."requiresAttendance", NEW."enteredAt", NEW."exitedAt", NEW."projectRoleLabel", CASE WHEN NEW."projectRoleLabel" = 'TEAM_LEADER' THEN 'TEAM_LEADER'::"RoleCode" ELSE 'WORKER'::"RoleCode" END
  );
  RETURN NEW;
END;
$$;
