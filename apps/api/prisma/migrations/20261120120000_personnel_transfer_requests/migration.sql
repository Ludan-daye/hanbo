-- Cross-project people requests: a project admin asks, a company admin approves or rejects.
CREATE TABLE "personnel_transfer_requests" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "targetProjectId" TEXT NOT NULL,
    "sourceProjectId" TEXT NOT NULL,
    "sourceMemberId" TEXT NOT NULL,
    "participantType" "ProfileOwnerType" NOT NULL,
    "profileId" TEXT NOT NULL,
    "projectRoleLabel" TEXT NOT NULL,
    "teamId" TEXT,
    "additionalRoles" JSONB NOT NULL DEFAULT '[]',
    "requiresAttendance" BOOLEAN NOT NULL,
    "enteredAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedByUserId" TEXT NOT NULL,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewReason" TEXT,
    "createdMemberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personnel_transfer_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "personnel_transfer_requests_companyId_status_createdAt_idx" ON "personnel_transfer_requests"("companyId", "status", "createdAt");
CREATE INDEX "personnel_transfer_requests_targetProjectId_createdAt_idx" ON "personnel_transfer_requests"("targetProjectId", "createdAt");
CREATE INDEX "personnel_transfer_requests_profileId_participantType_statu_idx" ON "personnel_transfer_requests"("profileId", "participantType", "status");

ALTER TABLE "personnel_transfer_requests" ADD CONSTRAINT "personnel_transfer_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "personnel_transfer_requests" ADD CONSTRAINT "personnel_transfer_requests_targetProjectId_fkey" FOREIGN KEY ("targetProjectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "personnel_transfer_requests" ADD CONSTRAINT "personnel_transfer_requests_sourceProjectId_fkey" FOREIGN KEY ("sourceProjectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "personnel_transfer_requests" ADD CONSTRAINT "personnel_transfer_request_valid_state" CHECK (
    "status" IN ('PENDING', 'APPROVED', 'REJECTED') AND "sourceProjectId" <> "targetProjectId"
);
