-- AlterTable
ALTER TABLE "face_verification_sessions" ADD COLUMN     "safetyConfirmationId" TEXT;

-- AlterTable
ALTER TABLE "attendance_records" ADD COLUMN     "safetyConfirmationId" TEXT;

-- CreateTable
CREATE TABLE "attendance_safety_confirmations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "teamId" TEXT,
    "memberId" TEXT NOT NULL,
    "participantType" "ProfileOwnerType" NOT NULL,
    "participantId" TEXT NOT NULL,
    "attendanceDate" DATE NOT NULL,
    "pointCode" TEXT NOT NULL,
    "baselineVersion" TEXT NOT NULL,
    "briefingIds" TEXT[],
    "snapshot" JSONB NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_safety_confirmations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_safety_confirmations_projectId_attendanceDate_te_idx" ON "attendance_safety_confirmations"("projectId", "attendanceDate", "teamId");

-- CreateIndex
CREATE INDEX "attendance_safety_confirmations_userId_confirmedAt_idx" ON "attendance_safety_confirmations"("userId", "confirmedAt");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_safetyConfirmationId_key" ON "attendance_records"("safetyConfirmationId");

-- AddForeignKey
ALTER TABLE "face_verification_sessions" ADD CONSTRAINT "face_verification_sessions_safetyConfirmationId_fkey" FOREIGN KEY ("safetyConfirmationId") REFERENCES "attendance_safety_confirmations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_safetyConfirmationId_fkey" FOREIGN KEY ("safetyConfirmationId") REFERENCES "attendance_safety_confirmations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_safety_confirmations" ADD CONSTRAINT "attendance_safety_confirmations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_safety_confirmations" ADD CONSTRAINT "attendance_safety_confirmations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_safety_confirmations" ADD CONSTRAINT "attendance_safety_confirmations_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

