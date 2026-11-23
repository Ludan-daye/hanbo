import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "../authorization/authorization.module.js";
import { PrismaModule } from "../infrastructure/database/prisma.module.js";

import { AuditLogController } from "./audit-log.controller.js";
import { AuditLogService } from "./audit-log.service.js";

@Module({
  imports: [AuthModule, AuthorizationModule, PrismaModule],
  controllers: [AuditLogController],
  providers: [AuditLogService],
  // The platform log (/system/audit-logs) pages the same way.
  exports: [AuditLogService],
})
export class AuditLogModule {}
