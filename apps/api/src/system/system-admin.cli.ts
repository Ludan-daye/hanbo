import { PrismaClient } from "@prisma/client";

import { runSystemAdminCommand } from "./system-admins.js";

// Grant, revoke and list super administrators from the server (system admin plan Q3).
// Locally: corepack pnpm --filter @construction/api system-admin list
// In the test server's container: node dist/system/system-admin.cli.js list
// Nothing imports this file; it only runs as a command.

const prisma = new PrismaClient();
try {
  process.exitCode = await runSystemAdminCommand(process.argv.slice(2), prisma, {
    error: (line) => console.error(line),
    log: (line) => console.log(line),
  });
} finally {
  await prisma.$disconnect();
}
