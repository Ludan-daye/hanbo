import { spawnSync } from "node:child_process";

import { PrismaClient } from "@prisma/client";

/** Run the native-face HTTP integration suite in a new, isolated local PostgreSQL schema. */
const databaseUrl = new URL(process.env.DATABASE_URL);
if (
  !["localhost", "127.0.0.1", "::1", "[::1]"].includes(databaseUrl.hostname)
) {
  throw new Error(
    "Native face integration tests require a local PostgreSQL server.",
  );
}
const pnpmPath = process.env.npm_execpath;
if (pnpmPath === undefined)
  throw new Error(
    "Run this script with pnpm --filter @construction/api test:face.",
  );
const database = new PrismaClient();
const schemas =
  await database.$queryRaw`SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'face_native_integration'`;
if (schemas.length > 0) {
  await database.$disconnect();
  throw new Error(
    "The face_native_integration schema already exists. Inspect it before running tests; existing data will not be overwritten.",
  );
}
databaseUrl.searchParams.set("schema", "face_native_integration");
const testEnvironment = {
  ...process.env,
  DATABASE_URL: databaseUrl.toString(),
  FACE_TEST_DATABASE_URL: databaseUrl.toString(),
};
try {
  const schema = spawnSync(
    process.execPath,
    [pnpmPath, "exec", "prisma", "db", "push", "--skip-generate"],
    { env: testEnvironment, stdio: "inherit" },
  );
  if (schema.error !== undefined) throw schema.error;
  if (schema.status !== 0)
    throw new Error(
      `Integration schema setup failed with status ${schema.status}.`,
    );
  const result = spawnSync(
    process.execPath,
    [pnpmPath, "exec", "vitest", "run", "test/face-native.integration.test.ts"],
    { env: testEnvironment, stdio: "inherit" },
  );
  if (result.error !== undefined) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  await database.$executeRawUnsafe(
    'DROP SCHEMA IF EXISTS "face_native_integration" CASCADE',
  );
  await database.$disconnect();
}
