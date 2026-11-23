import { Module } from "@nestjs/common";

import { AuditLogModule } from "../audit/audit-log.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "../authorization/authorization.module.js";
import { PrismaModule } from "../infrastructure/database/prisma.module.js";

import { SystemAccountsService } from "./system-accounts.service.js";
import { SystemCompaniesService } from "./system-companies.service.js";
import { SystemController } from "./system.controller.js";

/**
 * Platform management for SYSTEM_ADMIN (/system/*). Companies and their administrators
 * (phase 1), accounts (phase 2), the platform operation log (phase 4).
 */
@Module({
  imports: [AuditLogModule, AuthModule, AuthorizationModule, PrismaModule],
  controllers: [SystemController],
  providers: [SystemAccountsService, SystemCompaniesService],
})
export class SystemModule {}
