-- Preserve existing point identifiers while allowing administrator-defined points.
ALTER TABLE "attendance_records" ALTER COLUMN "pointCode" TYPE TEXT USING "pointCode"::text;
ALTER TABLE "makeup_requests" ALTER COLUMN "pointCode" TYPE TEXT USING "pointCode"::text;
ALTER TABLE "face_verification_sessions" ALTER COLUMN "pointCode" TYPE TEXT USING "pointCode"::text;
CREATE TABLE "attendance_plans" (
 "id" TEXT PRIMARY KEY, "projectId" TEXT NOT NULL REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "scopeType" TEXT NOT NULL CHECK ("scopeType" IN ('PROJECT','TEAM','MEMBER')),
 "scopeId" TEXT NOT NULL, "authorUserId" TEXT REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "authorRoleLevel" INTEGER NOT NULL CHECK ("authorRoleLevel" BETWEEN 2 AND 6),
 "startsOn" DATE NOT NULL, "endsOn" DATE, "inherit" BOOLEAN NOT NULL DEFAULT false,
 "name" TEXT NOT NULL, "points" JSONB NOT NULL, "workdayMask" INTEGER NOT NULL CHECK ("workdayMask" BETWEEN 1 AND 127),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ("endsOn" IS NULL OR "endsOn" >= "startsOn"), CHECK (jsonb_typeof("points") = 'array')
);
CREATE INDEX "attendance_plans_projectId_scopeType_scopeId_startsOn_creat_idx" ON "attendance_plans"("projectId","scopeType","scopeId","startsOn","createdAt");
-- The new baseline starts tomorrow; earlier schedules and records remain unchanged.
INSERT INTO "attendance_plans" ("id","projectId","scopeType","scopeId","authorRoleLevel","startsOn","name","points","workdayMask")
SELECT 'baseline-two-' || "id", "id", 'PROJECT', "id", 6,
 (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date + 1,
 '每日两次', '[{"code":"START","label":"上班","kind":"START","time":"08:00","graceMins":0},{"code":"END","label":"下班","kind":"END","time":"17:30","graceMins":0}]'::jsonb,127
FROM "projects";

ALTER TABLE "attendance_records" ADD COLUMN "pointLabel" TEXT;
ALTER TABLE "makeup_requests" ADD COLUMN "pointLabel" TEXT;
