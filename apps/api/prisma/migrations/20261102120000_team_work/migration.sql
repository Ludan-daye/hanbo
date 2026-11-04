-- CreateTable
CREATE TABLE "team_work_tasks" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "workType" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_work_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_task_assignments" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_task_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "temporary_task_invitations" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "encryptedName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedByUserId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "status" "BindingInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "temporary_task_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "temporary_invite_attempts" (
    "userId" TEXT NOT NULL,
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "temporary_invite_attempts_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "team_safety_briefings" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_safety_briefings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_safety_acknowledgements" (
    "id" TEXT NOT NULL,
    "briefingId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_safety_acknowledgements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_safety_issues" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "memberId" TEXT,
    "workDate" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_safety_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_daily_logs" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "snapshot" JSONB NOT NULL,
    "generatedByUserId" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_daily_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "team_work_tasks_teamId_startsAt_idx" ON "team_work_tasks"("teamId", "startsAt");

-- CreateIndex
CREATE INDEX "team_task_assignments_memberId_idx" ON "team_task_assignments"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "team_task_assignments_taskId_memberId_key" ON "team_task_assignments"("taskId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "temporary_task_invitations_codeHash_key" ON "temporary_task_invitations"("codeHash");

-- CreateIndex
CREATE INDEX "temporary_task_invitations_taskId_status_idx" ON "temporary_task_invitations"("taskId", "status");

-- CreateIndex
CREATE INDEX "team_safety_briefings_teamId_workDate_idx" ON "team_safety_briefings"("teamId", "workDate");

-- CreateIndex
CREATE INDEX "team_safety_acknowledgements_memberId_idx" ON "team_safety_acknowledgements"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "team_safety_acknowledgements_briefingId_memberId_key" ON "team_safety_acknowledgements"("briefingId", "memberId");

-- CreateIndex
CREATE INDEX "team_safety_issues_teamId_workDate_idx" ON "team_safety_issues"("teamId", "workDate");

-- CreateIndex
CREATE UNIQUE INDEX "team_daily_logs_teamId_workDate_key" ON "team_daily_logs"("teamId", "workDate");

-- AddForeignKey
ALTER TABLE "team_work_tasks" ADD CONSTRAINT "team_work_tasks_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_task_assignments" ADD CONSTRAINT "team_task_assignments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "team_work_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_task_assignments" ADD CONSTRAINT "team_task_assignments_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "project_worker_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "temporary_task_invitations" ADD CONSTRAINT "temporary_task_invitations_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "team_work_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_safety_briefings" ADD CONSTRAINT "team_safety_briefings_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_safety_acknowledgements" ADD CONSTRAINT "team_safety_acknowledgements_briefingId_fkey" FOREIGN KEY ("briefingId") REFERENCES "team_safety_briefings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_safety_acknowledgements" ADD CONSTRAINT "team_safety_acknowledgements_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "project_worker_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_safety_issues" ADD CONSTRAINT "team_safety_issues_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_safety_issues" ADD CONSTRAINT "team_safety_issues_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "project_worker_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_daily_logs" ADD CONSTRAINT "team_daily_logs_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "team_work_tasks" ADD CONSTRAINT "team_task_status_check" CHECK (status IN ('OPEN', 'COMPLETED', 'CANCELLED'));
ALTER TABLE "team_work_tasks" ADD CONSTRAINT "team_task_duration_check" CHECK ("endsAt" > "startsAt" AND "endsAt" <= "startsAt" + interval '24 hours');
ALTER TABLE "team_task_assignments" ADD CONSTRAINT "team_task_source_check" CHECK (source IN ('ASSIGNED', 'TEMPORARY_INVITE'));
ALTER TABLE "team_safety_issues" ADD CONSTRAINT "team_safety_severity_check" CHECK (severity IN ('GENERAL', 'SERIOUS'));
ALTER TABLE "team_safety_issues" ADD CONSTRAINT "team_safety_resolution_check" CHECK (("resolvedAt" IS NULL AND resolution IS NULL AND "resolvedByUserId" IS NULL) OR ("resolvedAt" IS NOT NULL AND resolution IS NOT NULL AND "resolvedByUserId" IS NOT NULL));
INSERT INTO "permissions" (id, code, name) VALUES
  ('team-work-manage', 'team.work.manage', 'Manage team work and temporary invitations'),
  ('team-safety-manage', 'team.safety.manage', 'Manage team safety')
ON CONFLICT (code) DO NOTHING;
INSERT INTO "role_permissions" (id, "roleId", "permissionId")
SELECT 'team-work-' || p.id, r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code = 'TEAM_LEADER' AND p.code IN ('team.work.manage', 'team.safety.manage')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
