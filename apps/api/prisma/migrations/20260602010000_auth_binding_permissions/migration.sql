-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "BindingInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- AlterTable
ALTER TABLE "users"
ADD COLUMN "unionid" TEXT,
ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "binding_invitations" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "targetType" "ProfileOwnerType" NOT NULL,
    "workerProfileId" TEXT,
    "managerProfileId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "acceptedByUserId" TEXT,
    "status" "BindingInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "binding_invitations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "binding_invitations_target_check" CHECK (
        (
            "targetType" = 'WORKER'
            AND "workerProfileId" IS NOT NULL
            AND "managerProfileId" IS NULL
        )
        OR
        (
            "targetType" = 'MANAGER'
            AND "workerProfileId" IS NULL
            AND "managerProfileId" IS NOT NULL
        )
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "users_unionid_key" ON "users"("unionid");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_tokenHash_key" ON "user_sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "user_sessions_userId_expiresAt_revokedAt_idx" ON "user_sessions"("userId", "expiresAt", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "binding_invitations_codeHash_key" ON "binding_invitations"("codeHash");

-- CreateIndex
CREATE INDEX "binding_invitations_createdByUserId_status_idx" ON "binding_invitations"("createdByUserId", "status");

-- CreateIndex
CREATE INDEX "binding_invitations_acceptedByUserId_idx" ON "binding_invitations"("acceptedByUserId");

-- CreateIndex
CREATE INDEX "binding_invitations_targetType_workerProfileId_status_idx" ON "binding_invitations"("targetType", "workerProfileId", "status");

-- CreateIndex
CREATE INDEX "binding_invitations_targetType_managerProfileId_status_idx" ON "binding_invitations"("targetType", "managerProfileId", "status");

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "binding_invitations" ADD CONSTRAINT "binding_invitations_workerProfileId_fkey" FOREIGN KEY ("workerProfileId") REFERENCES "worker_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "binding_invitations" ADD CONSTRAINT "binding_invitations_managerProfileId_fkey" FOREIGN KEY ("managerProfileId") REFERENCES "manager_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "binding_invitations" ADD CONSTRAINT "binding_invitations_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "binding_invitations" ADD CONSTRAINT "binding_invitations_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
