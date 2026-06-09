-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RoleCode" AS ENUM ('SYSTEM_ADMIN', 'COMPANY_ADMIN', 'PROJECT_ADMIN', 'TEAM_LEADER', 'WORKER');

-- CreateEnum
CREATE TYPE "ProfileOwnerType" AS ENUM ('WORKER', 'MANAGER');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PREPARING', 'ACTIVE', 'SUSPENDED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('ACTIVE', 'EXITED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AttendancePointCode" AS ENUM ('SEGMENT_1_START', 'SEGMENT_1_END', 'SEGMENT_2_START', 'SEGMENT_2_END');

-- CreateEnum
CREATE TYPE "AttendanceRecordSource" AS ENUM ('DEVICE', 'MAKEUP');

-- CreateEnum
CREATE TYPE "AttendanceRecordStatus" AS ENUM ('VALID', 'INVALID');

-- CreateEnum
CREATE TYPE "MakeupStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "UserRoleScopeType" AS ENUM ('GLOBAL', 'COMPANY', 'PROJECT', 'TEAM');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "openid" TEXT NOT NULL,
    "phone" TEXT,
    "isBound" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "encryptedName" TEXT NOT NULL,
    "encryptedIdNumber" TEXT NOT NULL,
    "idNumberHash" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "workType" TEXT NOT NULL,
    "realNameStatus" TEXT NOT NULL,
    "faceProfileStatus" TEXT NOT NULL,
    "employmentStatus" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "worker_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manager_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manager_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "code" "RoleCode" NOT NULL,
    "level" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "scopeType" "UserRoleScopeType" NOT NULL,
    "scopeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "centerLatitude" DECIMAL(10,7) NOT NULL,
    "centerLongitude" DECIMAL(10,7) NOT NULL,
    "geofenceRadiusM" INTEGER NOT NULL,
    "status" "ProjectStatus" NOT NULL,
    "plannedStartDate" DATE NOT NULL,
    "plannedEndDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_worker_members" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "teamId" TEXT,
    "requiresAttendance" BOOLEAN NOT NULL DEFAULT true,
    "enteredAt" TIMESTAMP(3) NOT NULL,
    "exitedAt" TIMESTAMP(3),
    "projectRoleLabel" TEXT NOT NULL,
    "status" "MemberStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_worker_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_manager_members" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "roleCode" "RoleCode" NOT NULL,
    "teamScopeId" TEXT,
    "requiresAttendance" BOOLEAN NOT NULL DEFAULT true,
    "status" "MemberStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_manager_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_segments" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "lateGraceMins" INTEGER NOT NULL DEFAULT 0,
    "earlyGraceMins" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedules" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "face_profiles" (
    "id" TEXT NOT NULL,
    "ownerType" "ProfileOwnerType" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "baselineObjectKey" TEXT NOT NULL,
    "baselineImageHash" TEXT NOT NULL,
    "faceServiceId" TEXT,
    "status" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "face_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "participantType" "ProfileOwnerType" NOT NULL,
    "participantId" TEXT NOT NULL,
    "attendanceDate" DATE NOT NULL,
    "pointCode" "AttendancePointCode" NOT NULL,
    "source" "AttendanceRecordSource" NOT NULL,
    "status" "AttendanceRecordStatus" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "serverReceivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "locationAccuracyM" DECIMAL(8,2),
    "geofenceDistanceM" DECIMAL(8,2),
    "selfieObjectKey" TEXT NOT NULL,
    "sitePhotoObjectKey" TEXT NOT NULL,
    "selfieHash" TEXT NOT NULL,
    "sitePhotoHash" TEXT NOT NULL,
    "faceScore" DECIMAL(6,4),
    "facePassed" BOOLEAN NOT NULL,
    "abnormalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_results" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "attendanceDate" DATE NOT NULL,
    "participantType" "ProfileOwnerType" NOT NULL,
    "participantId" TEXT NOT NULL,
    "workedMinutes" INTEGER NOT NULL,
    "isLate" BOOLEAN NOT NULL,
    "isEarlyLeave" BOOLEAN NOT NULL,
    "isMissingPunch" BOOLEAN NOT NULL,
    "isAbsent" BOOLEAN NOT NULL,
    "approvedMakeupCount" INTEGER NOT NULL DEFAULT 0,
    "abnormalRecordCount" INTEGER NOT NULL DEFAULT 0,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "makeup_requests" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "requesterUserId" TEXT NOT NULL,
    "participantType" "ProfileOwnerType" NOT NULL,
    "participantId" TEXT NOT NULL,
    "attendanceDate" DATE NOT NULL,
    "pointCode" "AttendancePointCode" NOT NULL,
    "requestedOccurredAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "MakeupStatus" NOT NULL,
    "approverUserId" TEXT,
    "approvalReason" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "makeup_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_openid_key" ON "users"("openid");

-- CreateIndex
CREATE UNIQUE INDEX "worker_profiles_userId_key" ON "worker_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "worker_profiles_idNumberHash_key" ON "worker_profiles"("idNumberHash");

-- CreateIndex
CREATE INDEX "worker_profiles_phone_idx" ON "worker_profiles"("phone");

-- CreateIndex
CREATE INDEX "worker_profiles_employmentStatus_idx" ON "worker_profiles"("employmentStatus");

-- CreateIndex
CREATE UNIQUE INDEX "manager_profiles_userId_key" ON "manager_profiles"("userId");

-- CreateIndex
CREATE INDEX "manager_profiles_phone_idx" ON "manager_profiles"("phone");

-- CreateIndex
CREATE INDEX "manager_profiles_status_idx" ON "manager_profiles"("status");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "role_permissions_roleId_idx" ON "role_permissions"("roleId");

-- CreateIndex
CREATE INDEX "role_permissions_permissionId_idx" ON "role_permissions"("permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_roleId_permissionId_key" ON "role_permissions"("roleId", "permissionId");

-- CreateIndex
CREATE INDEX "user_roles_userId_idx" ON "user_roles"("userId");

-- CreateIndex
CREATE INDEX "user_roles_scopeType_scopeId_idx" ON "user_roles"("scopeType", "scopeId");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_userId_roleId_scopeType_scopeId_key" ON "user_roles"("userId", "roleId", "scopeType", "scopeId");

-- CreateIndex
CREATE INDEX "projects_companyId_status_idx" ON "projects"("companyId", "status");

-- CreateIndex
CREATE INDEX "teams_projectId_status_idx" ON "teams"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "teams_id_projectId_key" ON "teams"("id", "projectId");

-- CreateIndex
CREATE INDEX "project_worker_members_projectId_teamId_status_idx" ON "project_worker_members"("projectId", "teamId", "status");

-- CreateIndex
CREATE INDEX "project_worker_members_workerId_status_idx" ON "project_worker_members"("workerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "project_worker_members_projectId_workerId_key" ON "project_worker_members"("projectId", "workerId");

-- CreateIndex
CREATE INDEX "project_manager_members_projectId_roleCode_status_idx" ON "project_manager_members"("projectId", "roleCode", "status");

-- CreateIndex
CREATE INDEX "project_manager_members_projectId_teamScopeId_status_idx" ON "project_manager_members"("projectId", "teamScopeId", "status");

-- CreateIndex
CREATE INDEX "project_manager_members_managerId_status_idx" ON "project_manager_members"("managerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "project_manager_members_projectId_managerId_key" ON "project_manager_members"("projectId", "managerId");

-- CreateIndex
CREATE INDEX "shifts_projectId_isDefault_idx" ON "shifts"("projectId", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "shift_segments_shiftId_sequence_key" ON "shift_segments"("shiftId", "sequence");

-- CreateIndex
CREATE INDEX "schedules_shiftId_startsOn_idx" ON "schedules"("shiftId", "startsOn");

-- CreateIndex
CREATE INDEX "schedules_ownerType_ownerId_startsOn_idx" ON "schedules"("ownerType", "ownerId", "startsOn");

-- CreateIndex
CREATE INDEX "face_profiles_ownerType_ownerId_status_idx" ON "face_profiles"("ownerType", "ownerId", "status");

-- CreateIndex
CREATE INDEX "attendance_records_projectId_attendanceDate_participantType_idx" ON "attendance_records"("projectId", "attendanceDate", "participantType", "participantId");

-- CreateIndex
CREATE INDEX "attendance_records_projectId_attendanceDate_pointCode_idx" ON "attendance_records"("projectId", "attendanceDate", "pointCode");

-- CreateIndex
CREATE INDEX "attendance_results_projectId_attendanceDate_idx" ON "attendance_results"("projectId", "attendanceDate");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_results_projectId_attendanceDate_participantType_key" ON "attendance_results"("projectId", "attendanceDate", "participantType", "participantId");

-- CreateIndex
CREATE INDEX "makeup_requests_projectId_attendanceDate_status_idx" ON "makeup_requests"("projectId", "attendanceDate", "status");

-- CreateIndex
CREATE INDEX "makeup_requests_requesterUserId_status_idx" ON "makeup_requests"("requesterUserId", "status");

-- CreateIndex
CREATE INDEX "audit_logs_actorUserId_createdAt_idx" ON "audit_logs"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "worker_profiles" ADD CONSTRAINT "worker_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manager_profiles" ADD CONSTRAINT "manager_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_worker_members" ADD CONSTRAINT "project_worker_members_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_worker_members" ADD CONSTRAINT "project_worker_members_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "worker_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_worker_members" ADD CONSTRAINT "project_worker_members_teamId_projectId_fkey" FOREIGN KEY ("teamId", "projectId") REFERENCES "teams"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_manager_members" ADD CONSTRAINT "project_manager_members_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_manager_members" ADD CONSTRAINT "project_manager_members_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "manager_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_manager_members" ADD CONSTRAINT "project_manager_members_teamScopeId_projectId_fkey" FOREIGN KEY ("teamScopeId", "projectId") REFERENCES "teams"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_segments" ADD CONSTRAINT "shift_segments_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_results" ADD CONSTRAINT "attendance_results_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "makeup_requests" ADD CONSTRAINT "makeup_requests_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "makeup_requests" ADD CONSTRAINT "makeup_requests_requesterUserId_fkey" FOREIGN KEY ("requesterUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "makeup_requests" ADD CONSTRAINT "makeup_requests_approverUserId_fkey" FOREIGN KEY ("approverUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
