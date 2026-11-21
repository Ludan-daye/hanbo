import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "../authorization/authorization.module.js";
import { PrismaModule } from "../infrastructure/database/prisma.module.js";
import { MakeupModule } from "../makeup/makeup.module.js";
import { ReportsModule } from "../reports/reports.module.js";
import { SafetyCreditModule } from "../safety-credit/safety-credit.module.js";

import { CompanyOverviewService } from "./company-overview.service.js";
import { ProjectOverviewController } from "./project-overview.controller.js";
import { ProjectOverviewService } from "./project-overview.service.js";

@Module({
  imports: [AuthModule, AuthorizationModule, PrismaModule, MakeupModule, ReportsModule, SafetyCreditModule],
  controllers: [ProjectOverviewController],
  providers: [CompanyOverviewService, ProjectOverviewService],
})
export class ProjectOverviewModule {}
