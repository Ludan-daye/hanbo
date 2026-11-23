import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "../authorization/authorization.module.js";
import { PrismaModule } from "../infrastructure/database/prisma.module.js";
import { MakeupModule } from "../makeup/makeup.module.js";

import { SystemOverviewController } from "./system-overview.controller.js";
import { SystemOverviewService } from "./system-overview.service.js";

/**
 * The platform home (phase 5). Kept apart from SystemModule because the makeup count needs
 * MakeupModule, and with it attendance; the rest of /system/* does not.
 */
@Module({
  imports: [AuthModule, AuthorizationModule, MakeupModule, PrismaModule],
  controllers: [SystemOverviewController],
  providers: [SystemOverviewService],
})
export class SystemOverviewModule {}
