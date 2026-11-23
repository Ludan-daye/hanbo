-- Company administrator appointments (2026-11-22, system admin plan phase 1, Q1/Q2).
-- An appointment lands on the manager profile, so a new person can be appointed before
-- binding; binding grants the COMPANY-scoped COMPANY_ADMIN role, revoking removes it.
CREATE TABLE "company_manager_members" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "managerProfileId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "invitationId" TEXT,
    "appointedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appointedByUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedByUserId" TEXT,

    CONSTRAINT "company_manager_members_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "company_manager_members_status_check" CHECK ("status" IN ('ACTIVE', 'REVOKED')),
    CONSTRAINT "company_manager_members_revoked_check" CHECK (("status" = 'REVOKED') = ("revokedAt" IS NOT NULL))
);

CREATE INDEX "company_manager_members_companyId_status_idx" ON "company_manager_members"("companyId", "status");
CREATE INDEX "company_manager_members_managerProfileId_status_idx" ON "company_manager_members"("managerProfileId", "status");
-- One ACTIVE appointment per company and person; revoked rows stay as history.
CREATE UNIQUE INDEX "company_manager_members_active_key" ON "company_manager_members"("companyId", "managerProfileId") WHERE "status" = 'ACTIVE';

ALTER TABLE "company_manager_members" ADD CONSTRAINT "company_manager_members_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "company_manager_members" ADD CONSTRAINT "company_manager_members_managerProfileId_fkey" FOREIGN KEY ("managerProfileId") REFERENCES "manager_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "company_manager_members" ADD CONSTRAINT "company_manager_members_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "binding_invitations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing COMPANY_ADMIN roles (written by the dev seed and the test-login fixtures) become
-- ACTIVE appointments. Only users with a manager profile can be backfilled; a COMPANY_ADMIN
-- role on a user without one (none known outside hand-made data) keeps working but is not
-- listed under the company and cannot be revoked from the app.
INSERT INTO "company_manager_members" ("id", "companyId", "managerProfileId", "status", "appointedAt")
SELECT gen_random_uuid()::text, c."id", mp."id", 'ACTIVE', ur."createdAt"
FROM "user_roles" ur
JOIN "roles" r ON r."id" = ur."roleId" AND r."code" = 'COMPANY_ADMIN'
JOIN "companies" c ON c."id" = ur."scopeId"
JOIN "manager_profiles" mp ON mp."userId" = ur."userId"
WHERE ur."scopeType" = 'COMPANY';
