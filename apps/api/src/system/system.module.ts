import { Module } from "@nestjs/common";

import { AuditLogModule } from "../audit/audit-log.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "../authorization/authorization.module.js";
import { PrismaModule } from "../infrastructure/database/prisma.module.js";

import { AppSettingsController } from "./app-settings.controller.js";
import { PlatformSettingsService } from "./platform-settings.service.js";
import { SystemAccountsService } from "./system-accounts.service.js";
import { SystemCompaniesService } from "./system-companies.service.js";
import { SystemController } from "./system.controller.js";

/**
 * Platform management for SYSTEM_ADMIN (/system/*). Companies and their administrators
 * (phase 1), accounts (phase 2), the platform operation log (phase 4), platform settings and
 * GET /app/settings for everyone (phase 5). The platform home is SystemOverviewModule.
 */
@Module({
  imports: [AuditLogModule, AuthModule, AuthorizationModule, PrismaModule],
  controllers: [AppSettingsController, SystemController],
  providers: [PlatformSettingsService, SystemAccountsService, SystemCompaniesService],
})
export class SystemModule {}
