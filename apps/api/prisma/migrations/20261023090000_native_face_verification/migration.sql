ALTER TABLE "face_profiles"
ADD COLUMN "consentVersion" TEXT,
ADD COLUMN "consentedAt" TIMESTAMP(3),
ADD COLUMN "reviewReason" TEXT,
ADD COLUMN "submittedByUserId" TEXT;

ALTER TABLE "attendance_records" ALTER COLUMN "faceScore" SET DATA TYPE DECIMAL(7,4);

CREATE TABLE "face_verification_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "participantType" "ProfileOwnerType" NOT NULL,
    "participantId" TEXT NOT NULL,
    "pointCode" "AttendancePointCode" NOT NULL,
    "attendanceDate" DATE NOT NULL,
    "faceProfileId" TEXT NOT NULL,
    "faceProfileVersion" INTEGER NOT NULL,
    "bizToken" TEXT,
    "status" TEXT NOT NULL,
    "score" DECIMAL(7,4),
    "selfieObjectKey" TEXT,
    "selfieHash" TEXT,
    "providerRequestId" TEXT,
    "failureCode" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "face_verification_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "face_verification_sessions_bizToken_key" ON "face_verification_sessions"("bizToken");
CREATE INDEX "face_verification_sessions_userId_projectId_createdAt_idx" ON "face_verification_sessions"("userId", "projectId", "createdAt");
ALTER TABLE "face_verification_sessions" ADD CONSTRAINT "face_verification_sessions_faceProfileId_fkey" FOREIGN KEY ("faceProfileId") REFERENCES "face_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
