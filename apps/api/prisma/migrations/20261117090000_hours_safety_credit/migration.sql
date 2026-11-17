-- CreateTable
CREATE TABLE "safety_credit_policies" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "startsOn" DATE NOT NULL,
    "generalPoints" INTEGER NOT NULL,
    "seriousPoints" INTEGER NOT NULL,
    "majorPoints" INTEGER NOT NULL,
    "recoveryWorkdays" INTEGER NOT NULL,
    "recoveryPoints" INTEGER NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "safety_credit_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safety_violations" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "evidenceObjectKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "points" INTEGER NOT NULL,
    "policyVersion" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdByUserId" TEXT NOT NULL,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "safety_violations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safety_credit_decisions" (
    "id" TEXT NOT NULL,
    "violationId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "safety_credit_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safety_credit_appeals" (
    "id" TEXT NOT NULL,
    "violationId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "safety_credit_appeals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_worktime_rules" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "startsOn" DATE NOT NULL,
    "projectKind" TEXT NOT NULL,
    "lunchStart" TEXT,
    "lunchEnd" TEXT,
    "overtimeStart" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_worktime_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "safety_credit_policies_version_key" ON "safety_credit_policies"("version");

-- CreateIndex
CREATE INDEX "safety_credit_policies_startsOn_version_idx" ON "safety_credit_policies"("startsOn", "version");

-- CreateIndex
CREATE UNIQUE INDEX "safety_violations_eventKey_key" ON "safety_violations"("eventKey");

-- CreateIndex
CREATE INDEX "safety_violations_workerId_occurredAt_idx" ON "safety_violations"("workerId", "occurredAt");

-- CreateIndex
CREATE INDEX "safety_violations_projectId_status_occurredAt_idx" ON "safety_violations"("projectId", "status", "occurredAt");

-- CreateIndex
CREATE INDEX "safety_violations_teamId_status_occurredAt_idx" ON "safety_violations"("teamId", "status", "occurredAt");

-- CreateIndex
CREATE INDEX "safety_credit_decisions_violationId_createdAt_idx" ON "safety_credit_decisions"("violationId", "createdAt");

-- CreateIndex
CREATE INDEX "safety_credit_appeals_violationId_status_idx" ON "safety_credit_appeals"("violationId", "status");

-- CreateIndex
CREATE INDEX "safety_credit_appeals_workerId_createdAt_idx" ON "safety_credit_appeals"("workerId", "createdAt");

-- CreateIndex
CREATE INDEX "project_worktime_rules_projectId_startsOn_version_idx" ON "project_worktime_rules"("projectId", "startsOn", "version");

-- CreateIndex
CREATE UNIQUE INDEX "project_worktime_rules_projectId_version_key" ON "project_worktime_rules"("projectId", "version");

-- AddForeignKey
ALTER TABLE "safety_violations" ADD CONSTRAINT "safety_violations_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "worker_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_violations" ADD CONSTRAINT "safety_violations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_violations" ADD CONSTRAINT "safety_violations_teamId_projectId_fkey" FOREIGN KEY ("teamId", "projectId") REFERENCES "teams"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_violations" ADD CONSTRAINT "safety_violations_memberId_projectId_fkey" FOREIGN KEY ("memberId", "projectId") REFERENCES "project_worker_members"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_credit_decisions" ADD CONSTRAINT "safety_credit_decisions_violationId_fkey" FOREIGN KEY ("violationId") REFERENCES "safety_violations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_credit_appeals" ADD CONSTRAINT "safety_credit_appeals_violationId_fkey" FOREIGN KEY ("violationId") REFERENCES "safety_violations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safety_credit_appeals" ADD CONSTRAINT "safety_credit_appeals_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "worker_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_worktime_rules" ADD CONSTRAINT "project_worktime_rules_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed an explicit global policy; historical incidents before this date need their own policy.
INSERT INTO "safety_credit_policies" (
    "id", "version", "startsOn", "generalPoints", "seriousPoints", "majorPoints",
    "recoveryWorkdays", "recoveryPoints", "createdByUserId"
) VALUES (
    'initial-safety-credit-policy', 1, DATE '2026-11-17', 5, 10, 20,
    10, 5, 'system-initial-policy'
);

ALTER TABLE "safety_credit_policies" ADD CONSTRAINT "safety_credit_policy_positive_values" CHECK (
    "version" > 0 AND "generalPoints" BETWEEN 1 AND 100 AND
    "seriousPoints" BETWEEN 1 AND 100 AND "majorPoints" BETWEEN 1 AND 100 AND
    "recoveryWorkdays" > 0 AND "recoveryPoints" BETWEEN 1 AND 100
);
ALTER TABLE "safety_violations" ADD CONSTRAINT "safety_violation_valid_state" CHECK (
    "status" IN ('PENDING', 'CONFIRMED', 'REJECTED', 'REVOKED') AND
    "severity" IN ('GENERAL', 'SERIOUS', 'MAJOR') AND "points" BETWEEN 1 AND 100
);
ALTER TABLE "safety_credit_decisions" ADD CONSTRAINT "safety_credit_decision_valid_action" CHECK (
    "action" IN ('CONFIRM', 'REJECT', 'REVOKE')
);
ALTER TABLE "safety_credit_appeals" ADD CONSTRAINT "safety_credit_appeal_valid_state" CHECK (
    "status" IN ('PENDING', 'ACCEPTED', 'REJECTED')
);
CREATE UNIQUE INDEX "safety_credit_appeals_pending_violation_key" ON "safety_credit_appeals" ("violationId") WHERE "status" = 'PENDING';

CREATE INDEX "attendance_records_participant_point_status_idx" ON "attendance_records" ("participantType", "participantId", "projectId", "pointCode", "status");
CREATE INDEX "makeup_requests_participant_point_status_idx" ON "makeup_requests" ("participantType", "participantId", "projectId", "pointCode", "status");

