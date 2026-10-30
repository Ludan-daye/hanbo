import { randomBytes } from "node:crypto";
import { copyFile, cp, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";

const foundationMigration: string =
  "20261026100000_personnel_database_foundation";

const runPnpm = (
  argumentsList: readonly string[],
  environment: NodeJS.ProcessEnv,
): void => {
  const pnpmPath: string | undefined = process.env.npm_execpath;
  if (pnpmPath === undefined)
    throw new Error("Run this integration check through pnpm test:database.");
  const result = spawnSync(process.execPath, [pnpmPath, ...argumentsList], {
    env: environment,
    stdio: "inherit",
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `Database integration command failed: ${argumentsList.join(" ")} (status ${result.status}).`,
    );
};

const seedLegacyMemberships = async (database: PrismaClient): Promise<void> => {
  await database.$executeRaw`INSERT INTO "companies" ("id", "name", "status", "updatedAt") VALUES ('database-test-company', 'Database integration company', 'ACTIVE', now())`;
  await database.$executeRaw`INSERT INTO "projects" ("id", "companyId", "name", "address", "centerLatitude", "centerLongitude", "geofenceRadiusM", "status", "plannedStartDate", "updatedAt") VALUES ('database-test-project', 'database-test-company', 'Database integration project', 'Test address', 31, 121, 300, 'ACTIVE', '2026-01-01', now())`;
  await database.$executeRaw`INSERT INTO "worker_profiles" ("id", "encryptedName", "encryptedIdNumber", "idNumberHash", "phone", "workType", "realNameStatus", "faceProfileStatus", "employmentStatus", "updatedAt") VALUES ('database-test-worker', 'test-name', 'test-id', 'test-id-hash', 'test-phone', '木工', 'PENDING', 'PENDING', 'ACTIVE', now())`;
  await database.$executeRaw`INSERT INTO "manager_profiles" ("id", "name", "phone", "status", "createdAt", "updatedAt") VALUES ('database-test-manager', 'Test manager', 'test-manager-phone', 'ACTIVE', '2026-01-02', now())`;
  await database.$executeRaw`INSERT INTO "project_worker_members" ("id", "projectId", "workerId", "enteredAt", "projectRoleLabel", "status", "updatedAt") VALUES ('database-test-worker-member', 'database-test-project', 'database-test-worker', '2026-01-01', '木工', 'ACTIVE', now())`;
  await database.$executeRaw`INSERT INTO "project_manager_members" ("id", "projectId", "managerId", "roleCode", "status", "createdAt", "updatedAt") VALUES ('database-test-manager-member', 'database-test-project', 'database-test-manager', 'PROJECT_ADMIN', 'ACTIVE', '2026-01-02', now())`;
};

const main = async (): Promise<void> => {
  const configuredUrl: string | undefined = process.env.DATABASE_URL;
  if (configuredUrl === undefined)
    throw new Error(
      "DATABASE_URL is required for database integration checks.",
    );
  const databaseUrl: URL = new URL(configuredUrl);
  if (
    !["localhost", "127.0.0.1", "::1", "[::1]"].includes(databaseUrl.hostname)
  ) {
    throw new Error(
      "Database integration checks require a local PostgreSQL server.",
    );
  }
  const schemaName: string = `database_foundation_${Date.now()}_${randomBytes(3).toString("hex")}`;
  databaseUrl.searchParams.set("schema", schemaName);
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "test",
    DATABASE_URL: databaseUrl.toString(),
    DATABASE_FOUNDATION_TEST_URL: databaseUrl.toString(),
    PERSONNEL_ENCRYPTION_KEY: "ab".repeat(32),
  };
  const database: PrismaClient = new PrismaClient({
    datasourceUrl: databaseUrl.toString(),
  });
  const temporaryDirectory: string = await mkdtemp(
    join(tmpdir(), "hanbo-database-check-"),
  );
  const legacyPrismaDirectory: string = join(temporaryDirectory, "prisma");
  try {
    await mkdir(join(legacyPrismaDirectory, "migrations"), { recursive: true });
    await copyFile(
      "prisma/schema.prisma",
      join(legacyPrismaDirectory, "schema.prisma"),
    );
    const migrationEntries = await readdir("prisma/migrations", {
      withFileTypes: true,
    });
    for (const entry of migrationEntries) {
      if (entry.name === "migration_lock.toml" || entry.name < foundationMigration) {
        await cp(
          join("prisma/migrations", entry.name),
          join(legacyPrismaDirectory, "migrations", entry.name),
          { recursive: true },
        );
      }
    }
    runPnpm(
      [
        "exec",
        "prisma",
        "migrate",
        "deploy",
        "--schema",
        join(legacyPrismaDirectory, "schema.prisma"),
      ],
      environment,
    );
    await seedLegacyMemberships(database);
    runPnpm(["exec", "prisma", "migrate", "deploy"], environment);
    runPnpm(["exec", "prisma", "db", "seed"], environment);
    runPnpm(["exec", "prisma", "migrate", "diff", "--from-schema-datasource", "prisma/schema.prisma", "--to-schema-datamodel", "prisma/schema.prisma", "--exit-code"], environment);
    runPnpm(
      ["exec", "vitest", "run", "--no-file-parallelism", "test/database-foundation.integration.test.ts", "test/management-workflows.integration.test.ts", "test/account-onboarding.integration.test.ts", "test/test-login.integration.test.ts", "test/attendance-plans.integration.test.ts"],
      environment,
    );
  } finally {
    await database.$executeRawUnsafe(
      `DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`,
    );
    await database.$disconnect();
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
};

await main();
