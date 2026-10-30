-- CreateTable
CREATE TABLE "project_member_roles" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workerMemberId" TEXT,
    "managerMemberId" TEXT,
    "roleCode" "RoleCode" NOT NULL,
    "scopeId" TEXT NOT NULL,
    "teamId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_member_roles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_member_roles_projectId_roleCode_teamId_idx" ON "project_member_roles"("projectId", "roleCode", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "project_member_roles_workerMemberId_roleCode_scopeId_key" ON "project_member_roles"("workerMemberId", "roleCode", "scopeId");

-- CreateIndex
CREATE UNIQUE INDEX "project_member_roles_managerMemberId_roleCode_scopeId_key" ON "project_member_roles"("managerMemberId", "roleCode", "scopeId");

-- AddForeignKey
ALTER TABLE "project_member_roles" ADD CONSTRAINT "project_member_roles_workerMemberId_projectId_fkey" FOREIGN KEY ("workerMemberId", "projectId") REFERENCES "project_worker_members"("id", "projectId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_member_roles" ADD CONSTRAINT "project_member_roles_managerMemberId_projectId_fkey" FOREIGN KEY ("managerMemberId", "projectId") REFERENCES "project_manager_members"("id", "projectId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_member_roles" ADD CONSTRAINT "project_member_roles_teamId_projectId_fkey" FOREIGN KEY ("teamId", "projectId") REFERENCES "teams"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "project_member_roles"
  ADD CONSTRAINT "project_member_roles_owner_check" CHECK (num_nonnulls("workerMemberId", "managerMemberId") = 1),
  ADD CONSTRAINT "project_member_roles_scope_check" CHECK (
    ("roleCode" = 'WORKER' AND "teamId" IS NULL AND "scopeId" = "projectId") OR
    ("roleCode" = 'TEAM_LEADER' AND "teamId" IS NOT NULL AND "scopeId" = "teamId")
  );

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
    NEW."status", NEW."requiresAttendance", NEW."enteredAt", NEW."exitedAt", NEW."projectRoleLabel", CASE WHEN NEW."projectRoleLabel" = 'PROJECT_ADMIN' THEN 'PROJECT_ADMIN'::"RoleCode" WHEN NEW."projectRoleLabel" = 'TEAM_LEADER' THEN 'TEAM_LEADER'::"RoleCode" ELSE 'WORKER'::"RoleCode" END
  );
  RETURN NEW;
END;
$$;
