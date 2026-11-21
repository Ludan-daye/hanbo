-- A company's default attendance plan (points and workdays) and worktime rule.
-- Applied once to a new project when it is created (2026-11-21 Q6); later edits here
-- never change existing projects. Each save appends a version; nothing is backfilled.
CREATE TABLE "company_attendance_defaults" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "points" JSONB NOT NULL,
    "workdays" INTEGER[],
    "projectKind" TEXT NOT NULL,
    "lunchStart" TEXT,
    "lunchEnd" TEXT,
    "overtimeStart" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_attendance_defaults_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "company_attendance_defaults_companyId_version_key" ON "company_attendance_defaults"("companyId", "version");

ALTER TABLE "company_attendance_defaults" ADD CONSTRAINT "company_attendance_defaults_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
