-- Platform operation log (system admin plan phase 4): newest first across every company,
-- with no company or project to narrow by.
CREATE INDEX "audit_logs_createdAt_id_idx" ON "audit_logs"("createdAt", "id");
