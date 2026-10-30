import { PrismaClient } from "@prisma/client";

import { provisionTestAccounts } from "../src/auth/provision-test-accounts.js";
import { loadEnv } from "../src/config/env.js";

const env = loadEnv(process.env);
if (env.DEPLOYMENT_ENV !== "test" || env.TEST_LOGIN_SECRET_HASH.length === 0) {
  throw new Error("Test account provisioning requires DEPLOYMENT_ENV=test and TEST_LOGIN_SECRET_HASH.");
}
const database: PrismaClient = new PrismaClient();
try {
  await provisionTestAccounts(database, env.PERSONNEL_ENCRYPTION_KEY, env.UPLOADS_DIR);
  console.info(JSON.stringify({ event: "test_accounts_provisioned", count: 5 }));
} finally {
  await database.$disconnect();
}
