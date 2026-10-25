ALTER TABLE "face_verification_sessions"
  ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'WECHAT_NATIVE',
  ADD COLUMN "actionSequence" TEXT,
  ADD COLUMN "videoHash" TEXT,
  ADD COLUMN "providerAttempts" INTEGER NOT NULL DEFAULT 0;
