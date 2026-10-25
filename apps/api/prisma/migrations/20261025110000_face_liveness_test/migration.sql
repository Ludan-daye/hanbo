CREATE TABLE "face_liveness_test_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "faceProfileId" TEXT NOT NULL,
    "faceProfileVersion" INTEGER NOT NULL,
    "actionSequence" TEXT,
    "status" TEXT NOT NULL,
    "videoHash" TEXT,
    "score" DECIMAL(7,4),
    "providerRequestId" TEXT,
    "failureCode" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "face_liveness_test_sessions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "face_liveness_test_sessions_userId_createdAt_idx" ON "face_liveness_test_sessions"("userId", "createdAt");
ALTER TABLE "face_liveness_test_sessions" ADD CONSTRAINT "face_liveness_test_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "face_liveness_test_sessions" ADD CONSTRAINT "face_liveness_test_sessions_faceProfileId_fkey" FOREIGN KEY ("faceProfileId") REFERENCES "face_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
