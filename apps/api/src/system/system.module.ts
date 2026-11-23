import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "../authorization/authorization.module.js";
import { PrismaModule } from "../infrastructure/database/prisma.module.js";

import { SystemCompaniesService } from "./system-companies.service.js";
import { SystemController } from "./system.controller.js";

/** Platform management for SYSTEM_ADMIN (/system/*). Phase 1: companies and their administrators. */
@Module({
  imports: [AuthModule, AuthorizationModule, PrismaModule],
  controllers: [SystemController],
  providers: [SystemCompaniesService],
})
export class SystemModule {}
