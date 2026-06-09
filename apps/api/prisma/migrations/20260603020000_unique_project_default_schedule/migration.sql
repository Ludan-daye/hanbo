CREATE UNIQUE INDEX "schedules_project_default_unique"
ON "schedules"("ownerType", "ownerId")
WHERE "ownerType" = 'PROJECT';
