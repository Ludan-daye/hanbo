BEGIN;

-- CreateEnum
CREATE TYPE "MemberHistoryEvent" AS ENUM ('BASELINE', 'CREATED', 'UPDATED');

-- CreateEnum
CREATE TYPE "ReportExportScope" AS ENUM ('COMPANY', 'PROJECT', 'TEAM');

-- CreateEnum
CREATE TYPE "ReportExportStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "worker_profiles" ADD COLUMN     "emergencyContactName" TEXT,
ADD COLUMN     "emergencyContactPhone" TEXT,
ADD COLUMN     "remark" TEXT,
ALTER COLUMN "encryptedIdNumber" DROP NOT NULL,
ALTER COLUMN "idNumberHash" DROP NOT NULL;

-- AlterTable
ALTER TABLE "manager_profiles" ADD COLUMN     "emergencyContactName" TEXT,
ADD COLUMN     "emergencyContactPhone" TEXT,
ADD COLUMN     "remark" TEXT,
ADD COLUMN     "workType" TEXT;

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "address" TEXT,
ADD COLUMN     "contactName" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "creditCode" TEXT,
ADD COLUMN     "shortName" TEXT;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "actualEndDate" DATE,
ADD COLUMN     "actualStartDate" DATE,
ADD COLUMN     "code" TEXT,
ADD COLUMN     "contactName" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "locationAccuracyLimitM" INTEGER,
ADD COLUMN     "remark" TEXT;

-- AlterTable
ALTER TABLE "teams" ADD COLUMN     "leaderManagerMemberId" TEXT,
ADD COLUMN     "leaderWorkerMemberId" TEXT,
ADD COLUMN     "remark" TEXT,
ADD COLUMN     "workType" TEXT;

-- AlterTable
ALTER TABLE "project_manager_members" ADD COLUMN     "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "exitedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "attendance_records" ADD COLUMN     "faceVerificationSessionId" TEXT;

-- CreateTable
CREATE TABLE "project_member_histories" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workerMemberId" TEXT,
    "managerMemberId" TEXT,
    "teamId" TEXT,
    "event" "MemberHistoryEvent" NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "MemberStatus" NOT NULL,
    "requiresAttendance" BOOLEAN NOT NULL,
    "enteredAt" TIMESTAMP(3) NOT NULL,
    "exitedAt" TIMESTAMP(3),
    "projectRoleLabel" TEXT,
    "roleCode" "RoleCode",
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_member_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_member_evaluations" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workerMemberId" TEXT,
    "managerMemberId" TEXT,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "reviewerUserId" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_member_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stored_files" (
    "id" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "uploaderUserId" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "hash" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_exports" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "teamId" TEXT,
    "scope" "ReportExportScope" NOT NULL,
    "month" DATE NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "calculationVersion" TEXT NOT NULL,
    "dataCutoffAt" TIMESTAMP(3) NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "status" "ReportExportStatus" NOT NULL DEFAULT 'PENDING',
    "fileId" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "report_exports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_member_histories_projectId_recordedAt_idx" ON "project_member_histories"("projectId", "recordedAt");

-- CreateIndex
CREATE INDEX "project_member_histories_workerMemberId_recordedAt_idx" ON "project_member_histories"("workerMemberId", "recordedAt");

-- CreateIndex
CREATE INDEX "project_member_histories_managerMemberId_recordedAt_idx" ON "project_member_histories"("managerMemberId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "project_member_histories_workerMemberId_version_key" ON "project_member_histories"("workerMemberId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "project_member_histories_managerMemberId_version_key" ON "project_member_histories"("managerMemberId", "version");

-- CreateIndex
CREATE INDEX "project_member_evaluations_projectId_reviewedAt_idx" ON "project_member_evaluations"("projectId", "reviewedAt");

-- CreateIndex
CREATE INDEX "project_member_evaluations_reviewerUserId_reviewedAt_idx" ON "project_member_evaluations"("reviewerUserId", "reviewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "project_member_evaluations_workerMemberId_projectId_key" ON "project_member_evaluations"("workerMemberId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "project_member_evaluations_managerMemberId_projectId_key" ON "project_member_evaluations"("managerMemberId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "stored_files_objectKey_key" ON "stored_files"("objectKey");

-- CreateIndex
CREATE INDEX "stored_files_uploaderUserId_createdAt_idx" ON "stored_files"("uploaderUserId", "createdAt");

-- CreateIndex
CREATE INDEX "stored_files_expiresAt_deletedAt_idx" ON "stored_files"("expiresAt", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "report_exports_fileId_key" ON "report_exports"("fileId");

-- CreateIndex
CREATE INDEX "report_exports_companyId_month_status_idx" ON "report_exports"("companyId", "month", "status");

-- CreateIndex
CREATE INDEX "report_exports_requestedByUserId_createdAt_idx" ON "report_exports"("requestedByUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "report_exports_scope_companyId_projectId_teamId_month_versi_key" ON "report_exports"("scope", "companyId", "projectId", "teamId", "month", "version");

-- CreateIndex
CREATE UNIQUE INDEX "companies_creditCode_key" ON "companies"("creditCode");

-- CreateIndex
CREATE UNIQUE INDEX "projects_id_companyId_key" ON "projects"("id", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "projects_companyId_code_key" ON "projects"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "project_worker_members_id_projectId_key" ON "project_worker_members"("id", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "project_manager_members_id_projectId_key" ON "project_manager_members"("id", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_faceVerificationSessionId_key" ON "attendance_records"("faceVerificationSessionId");

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_leaderWorkerMemberId_projectId_fkey" FOREIGN KEY ("leaderWorkerMemberId", "projectId") REFERENCES "project_worker_members"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_leaderManagerMemberId_projectId_fkey" FOREIGN KEY ("leaderManagerMemberId", "projectId") REFERENCES "project_manager_members"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "face_verification_sessions" ADD CONSTRAINT "face_verification_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "face_verification_sessions" ADD CONSTRAINT "face_verification_sessions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_faceVerificationSessionId_fkey" FOREIGN KEY ("faceVerificationSessionId") REFERENCES "face_verification_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_member_histories" ADD CONSTRAINT "project_member_histories_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_member_histories" ADD CONSTRAINT "project_member_histories_workerMemberId_projectId_fkey" FOREIGN KEY ("workerMemberId", "projectId") REFERENCES "project_worker_members"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_member_histories" ADD CONSTRAINT "project_member_histories_managerMemberId_projectId_fkey" FOREIGN KEY ("managerMemberId", "projectId") REFERENCES "project_manager_members"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_member_histories" ADD CONSTRAINT "project_member_histories_teamId_projectId_fkey" FOREIGN KEY ("teamId", "projectId") REFERENCES "teams"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_member_evaluations" ADD CONSTRAINT "project_member_evaluations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_member_evaluations" ADD CONSTRAINT "project_member_evaluations_workerMemberId_projectId_fkey" FOREIGN KEY ("workerMemberId", "projectId") REFERENCES "project_worker_members"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_member_evaluations" ADD CONSTRAINT "project_member_evaluations_managerMemberId_projectId_fkey" FOREIGN KEY ("managerMemberId", "projectId") REFERENCES "project_manager_members"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_member_evaluations" ADD CONSTRAINT "project_member_evaluations_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_uploaderUserId_fkey" FOREIGN KEY ("uploaderUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_projectId_companyId_fkey" FOREIGN KEY ("projectId", "companyId") REFERENCES "projects"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_teamId_projectId_fkey" FOREIGN KEY ("teamId", "projectId") REFERENCES "teams"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve only known legacy state; BASELINE does not claim an earlier change history.
UPDATE "project_manager_members" SET "enteredAt" = "createdAt";

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_geofence_check" CHECK (
    "centerLatitude" BETWEEN -90 AND 90 AND "centerLongitude" BETWEEN -180 AND 180
    AND "geofenceRadiusM" > 0 AND ("locationAccuracyLimitM" IS NULL OR "locationAccuracyLimitM" > 0)
  ),
  ADD CONSTRAINT "projects_dates_check" CHECK (
    ("plannedEndDate" IS NULL OR "plannedEndDate" >= "plannedStartDate")
    AND ("actualEndDate" IS NULL OR ("actualStartDate" IS NOT NULL AND "actualEndDate" >= "actualStartDate"))
  );
ALTER TABLE "teams" ADD CONSTRAINT "teams_single_leader_check"
  CHECK (num_nonnulls("leaderWorkerMemberId", "leaderManagerMemberId") <= 1);
ALTER TABLE "project_worker_members" ADD CONSTRAINT "worker_members_dates_check"
  CHECK ("exitedAt" IS NULL OR "exitedAt" >= "enteredAt");
ALTER TABLE "project_manager_members" ADD CONSTRAINT "manager_members_dates_check"
  CHECK ("exitedAt" IS NULL OR "exitedAt" >= "enteredAt");

-- Keep non-overlapping effective periods instead of one destructively replaced schedule.
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;
DROP INDEX "schedules_project_default_unique";
ALTER TABLE "schedules"
  ADD CONSTRAINT "schedules_validity_check" CHECK (
    ("endsOn" IS NULL OR "endsOn" >= "startsOn") AND "workdayMask" BETWEEN 1 AND 127
  ),
  ADD CONSTRAINT "schedules_owner_validity_excl" EXCLUDE USING gist (
    "ownerType" public.gist_text_ops WITH =,
    "ownerId" public.gist_text_ops WITH =,
    daterange("startsOn", "endsOn", '[]') WITH &&
  );
CREATE UNIQUE INDEX "shifts_project_default_unique" ON "shifts"("projectId") WHERE "isDefault";

ALTER TABLE "project_member_histories"
  ADD CONSTRAINT "member_histories_target_check" CHECK (num_nonnulls("workerMemberId", "managerMemberId") = 1),
  ADD CONSTRAINT "member_histories_version_check" CHECK ("version" > 0),
  ADD CONSTRAINT "member_histories_dates_check" CHECK ("exitedAt" IS NULL OR "exitedAt" >= "enteredAt");
ALTER TABLE "project_member_evaluations"
  ADD CONSTRAINT "member_evaluations_target_check" CHECK (num_nonnulls("workerMemberId", "managerMemberId") = 1),
  ADD CONSTRAINT "member_evaluations_score_check" CHECK ("score" BETWEEN 0 AND 100);
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_metadata_check" CHECK (
  length("objectKey") > 0 AND length("contentType") > 0 AND "sizeBytes" > 0 AND "hash" ~ '^[0-9a-f]{64}$'
);
ALTER TABLE "report_exports"
  ADD CONSTRAINT "report_exports_scope_check" CHECK (
    ("scope" = 'COMPANY' AND "projectId" IS NULL AND "teamId" IS NULL)
    OR ("scope" = 'PROJECT' AND "projectId" IS NOT NULL AND "teamId" IS NULL)
    OR ("scope" = 'TEAM' AND "projectId" IS NOT NULL AND "teamId" IS NOT NULL)
  ),
  ADD CONSTRAINT "report_exports_month_check" CHECK (extract(day FROM "month") = 1 AND "version" > 0),
  ADD CONSTRAINT "report_exports_completion_check" CHECK (
    ("status" = 'COMPLETED' AND "fileId" IS NOT NULL AND "completedAt" IS NOT NULL AND "errorCode" IS NULL AND "errorMessage" IS NULL)
    OR ("status" = 'FAILED' AND "fileId" IS NULL AND "completedAt" IS NOT NULL AND "errorCode" IS NOT NULL AND "errorMessage" IS NOT NULL)
    OR ("status" IN ('PENDING', 'PROCESSING') AND "fileId" IS NULL AND "completedAt" IS NULL AND "errorCode" IS NULL AND "errorMessage" IS NULL)
  );
-- PostgreSQL 15+ treats absent project/team keys as the same scope for version uniqueness.
DROP INDEX "report_exports_scope_companyId_projectId_teamId_month_versi_key";
CREATE UNIQUE INDEX "report_exports_scope_companyId_projectId_teamId_month_versi_key"
  ON "report_exports"("scope", "companyId", "projectId", "teamId", "month", "version") NULLS NOT DISTINCT;

INSERT INTO "project_member_histories" (
  "id", "projectId", "workerMemberId", "teamId", "event", "version", "status", "requiresAttendance",
  "enteredAt", "exitedAt", "projectRoleLabel", "roleCode"
)
SELECT gen_random_uuid()::text, "projectId", "id", "teamId", 'BASELINE', 1, "status", "requiresAttendance",
  "enteredAt", "exitedAt", "projectRoleLabel", 'WORKER' FROM "project_worker_members";
INSERT INTO "project_member_histories" (
  "id", "projectId", "managerMemberId", "teamId", "event", "version", "status", "requiresAttendance",
  "enteredAt", "exitedAt", "roleCode"
)
SELECT gen_random_uuid()::text, "projectId", "id", "teamScopeId", 'BASELINE', 1, "status", "requiresAttendance",
  "enteredAt", "exitedAt", "roleCode" FROM "project_manager_members";

CREATE FUNCTION protect_membership_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."projectId" IS DISTINCT FROM OLD."projectId"
    OR to_jsonb(NEW)->'workerId' IS DISTINCT FROM to_jsonb(OLD)->'workerId'
    OR to_jsonb(NEW)->'managerId' IS DISTINCT FROM to_jsonb(OLD)->'managerId' THEN
    RAISE EXCEPTION 'MEMBERSHIP_IDENTITY_IMMUTABLE: create a new project membership instead'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_worker_membership_identity BEFORE UPDATE ON "project_worker_members"
  FOR EACH ROW EXECUTE FUNCTION protect_membership_identity();
CREATE TRIGGER protect_manager_membership_identity BEFORE UPDATE ON "project_manager_members"
  FOR EACH ROW EXECUTE FUNCTION protect_membership_identity();

CREATE FUNCTION record_worker_membership_history() RETURNS trigger LANGUAGE plpgsql AS $$
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
    NEW."status", NEW."requiresAttendance", NEW."enteredAt", NEW."exitedAt", NEW."projectRoleLabel", 'WORKER'
  );
  RETURN NEW;
END;
$$;
CREATE TRIGGER record_worker_membership_history AFTER INSERT OR UPDATE ON "project_worker_members"
  FOR EACH ROW EXECUTE FUNCTION record_worker_membership_history();

CREATE FUNCTION record_manager_membership_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND ROW(NEW."teamScopeId", NEW."roleCode", NEW."status", NEW."requiresAttendance", NEW."enteredAt", NEW."exitedAt")
    IS NOT DISTINCT FROM ROW(OLD."teamScopeId", OLD."roleCode", OLD."status", OLD."requiresAttendance", OLD."enteredAt", OLD."exitedAt") THEN
    RETURN NEW;
  END IF;
  INSERT INTO "project_member_histories" (
    "id", "projectId", "managerMemberId", "teamId", "event", "version", "status", "requiresAttendance",
    "enteredAt", "exitedAt", "roleCode"
  ) VALUES (
    gen_random_uuid()::text, NEW."projectId", NEW."id", NEW."teamScopeId",
    CASE WHEN TG_OP = 'INSERT' THEN 'CREATED'::"MemberHistoryEvent" ELSE 'UPDATED'::"MemberHistoryEvent" END,
    (SELECT coalesce(max("version"), 0) + 1 FROM "project_member_histories" WHERE "managerMemberId" = NEW."id"),
    NEW."status", NEW."requiresAttendance", NEW."enteredAt", NEW."exitedAt", NEW."roleCode"
  );
  RETURN NEW;
END;
$$;
CREATE TRIGGER record_manager_membership_history AFTER INSERT OR UPDATE ON "project_manager_members"
  FOR EACH ROW EXECUTE FUNCTION record_manager_membership_history();

CREATE FUNCTION reject_self_evaluation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "project_worker_members" m JOIN "worker_profiles" p ON p."id" = m."workerId"
      WHERE m."id" = NEW."workerMemberId" AND p."userId" = NEW."reviewerUserId"
    UNION ALL
    SELECT 1 FROM "project_manager_members" m JOIN "manager_profiles" p ON p."id" = m."managerId"
      WHERE m."id" = NEW."managerMemberId" AND p."userId" = NEW."reviewerUserId"
  ) THEN
    RAISE EXCEPTION 'PROJECT_EVALUATION_SELF_REVIEW_FORBIDDEN' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER reject_self_evaluation BEFORE INSERT OR UPDATE ON "project_member_evaluations"
  FOR EACH ROW EXECUTE FUNCTION reject_self_evaluation();

CREATE FUNCTION audit_project_evaluation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "audit_logs" ("id", "actorUserId", "action", "entityType", "entityId", "metadata")
  VALUES (
    gen_random_uuid()::text, NEW."reviewerUserId",
    CASE WHEN TG_OP = 'INSERT' THEN 'project.evaluation.create' ELSE 'project.evaluation.update' END,
    'project_member_evaluation', NEW."id",
    jsonb_build_object('before', CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END, 'after', to_jsonb(NEW))
  );
  RETURN NEW;
END;
$$;
CREATE TRIGGER audit_project_evaluation AFTER INSERT OR UPDATE ON "project_member_evaluations"
  FOR EACH ROW EXECUTE FUNCTION audit_project_evaluation();

CREATE FUNCTION validate_attendance_face_proof() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."faceVerificationSessionId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "face_verification_sessions" s
    WHERE s."id" = NEW."faceVerificationSessionId" AND s."projectId" = NEW."projectId"
      AND s."participantType" = NEW."participantType" AND s."participantId" = NEW."participantId"
      AND s."attendanceDate" = NEW."attendanceDate" AND s."pointCode" = NEW."pointCode"
      AND s."status" = 'CONSUMED' AND s."consumedAt" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'ATTENDANCE_FACE_PROOF_CONTEXT_MISMATCH' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_attendance_face_proof BEFORE INSERT OR UPDATE ON "attendance_records"
  FOR EACH ROW EXECUTE FUNCTION validate_attendance_face_proof();

COMMIT;
