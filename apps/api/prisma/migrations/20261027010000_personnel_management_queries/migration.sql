ALTER TABLE "worker_profiles" ADD COLUMN "nameSearchHashes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
CREATE INDEX "worker_profiles_nameSearchHashes_idx" ON "worker_profiles" USING GIN ("nameSearchHashes");
CREATE INDEX "project_worker_members_projectId_createdAt_id_idx" ON "project_worker_members"("projectId", "createdAt", "id");
CREATE INDEX "project_manager_members_projectId_createdAt_id_idx" ON "project_manager_members"("projectId", "createdAt", "id");
