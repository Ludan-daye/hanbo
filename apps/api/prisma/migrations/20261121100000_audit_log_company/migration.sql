-- Company-level operation log (2026-11-21 phase 5): every audit row knows its company.
ALTER TABLE "audit_logs" ADD COLUMN "companyId" TEXT;

CREATE INDEX "audit_logs_companyId_createdAt_idx" ON "audit_logs"("companyId", "createdAt");

-- Backfill what can be derived; a project never changes company, so this is safe.
-- 1. Project creation rows written before this date carried the project only as entityId.
UPDATE "audit_logs" a
SET "projectId" = a."entityId"
WHERE a."action" = 'project.create'
  AND a."projectId" IS NULL
  AND EXISTS (SELECT 1 FROM "projects" p WHERE p."id" = a."entityId");

-- 2. Temporary invitation rows: the project of the invitation's task.
UPDATE "audit_logs" a
SET "projectId" = t."projectId"
FROM "temporary_task_invitations" i
JOIN "team_work_tasks" k ON k."id" = i."taskId"
JOIN "teams" t ON t."id" = k."teamId"
WHERE a."entityType" = 'TemporaryTaskInvitation'
  AND a."entityId" = i."id"
  AND a."projectId" IS NULL;

-- 3. Report exports: company and (for project or team exports) project of the job.
UPDATE "audit_logs" a
SET "companyId" = r."companyId",
    "projectId" = COALESCE(a."projectId", r."projectId")
FROM "report_exports" r
WHERE a."entityType" = 'ReportExport'
  AND a."entityId" = r."id";

-- 4. Everything with a project.
UPDATE "audit_logs" a
SET "companyId" = p."companyId"
FROM "projects" p
WHERE a."companyId" IS NULL
  AND a."projectId" = p."id";

-- 5. Company-level rows that recorded the company in their metadata.
UPDATE "audit_logs" a
SET "companyId" = a."metadata"->>'companyId'
WHERE a."companyId" IS NULL
  AND jsonb_typeof(a."metadata") = 'object'
  AND EXISTS (SELECT 1 FROM "companies" c WHERE c."id" = a."metadata"->>'companyId');

-- From now on a row with a project gets its company without every writer passing it.
CREATE FUNCTION "audit_logs_fill_company"() RETURNS trigger AS $$
BEGIN
  IF NEW."companyId" IS NULL AND NEW."projectId" IS NOT NULL THEN
    SELECT p."companyId" INTO NEW."companyId" FROM "projects" p WHERE p."id" = NEW."projectId";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "audit_logs_fill_company"
BEFORE INSERT ON "audit_logs"
FOR EACH ROW EXECUTE FUNCTION "audit_logs_fill_company"();
