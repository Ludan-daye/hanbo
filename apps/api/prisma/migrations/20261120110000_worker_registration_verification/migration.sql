-- Project admins verify a worker's 用工登记. The status keeps using "realNameStatus"
-- (PENDING | VERIFIED | NEEDS_UPDATE); existing rows stay as they are.
ALTER TABLE "worker_profiles"
  ADD COLUMN "registrationVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "registrationVerifiedByUserId" TEXT,
  ADD COLUMN "registrationVersion" INTEGER NOT NULL DEFAULT 0;

-- Reading registration details unmasked: project admins and above (inherited upwards).
INSERT INTO "permissions" (id, code, name) VALUES
  ('worker-sensitive-view', 'worker.sensitive.view', 'View worker registration details')
ON CONFLICT (code) DO NOTHING;
INSERT INTO "role_permissions" (id, "roleId", "permissionId")
SELECT 'worker-sensitive-' || p.id, r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code = 'PROJECT_ADMIN' AND p.code = 'worker.sensitive.view'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
