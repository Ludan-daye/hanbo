import { ReportDetailsController } from "./report-details.controller.js";
import { ProjectEvaluationsService } from "./project-evaluations.service.js";
import { UploadsModule } from "../uploads/uploads.module.js";
import { ReportExportsController } from "./report-exports.controller.js";
import { ReportExportsService } from "./report-exports.service.js";
import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "../authorization/authorization.module.js";
import { PrismaModule } from "../infrastructure/database/prisma.module.js";

import { ReportsController } from "./reports.controller.js";
import { ReportsService } from "./reports.service.js";

@Module({
  imports: [AuthModule, AuthorizationModule, PrismaModule, UploadsModule],
  controllers: [
    ReportsController,
    ReportExportsController,
    ReportDetailsController,
  ],
  providers: [ReportsService, ReportExportsService, ProjectEvaluationsService],
  exports: [ReportsService],
})
export class ReportsModule {}
