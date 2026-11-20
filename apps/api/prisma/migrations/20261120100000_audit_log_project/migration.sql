-- Project-level audit queries. Nullable; existing rows are not backfilled.
ALTER TABLE "audit_logs" ADD COLUMN "projectId" TEXT;

CREATE INDEX "audit_logs_projectId_createdAt_idx" ON "audit_logs"("projectId", "createdAt");
