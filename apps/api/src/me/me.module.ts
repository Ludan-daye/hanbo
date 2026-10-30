import { Module } from "@nestjs/common";

import { ReportsModule } from "../reports/reports.module.js";
import { AttendanceModule } from "../attendance/attendance.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { PrismaModule } from "../infrastructure/database/prisma.module.js";

import { MeController } from "./me.controller.js";
import { MeService } from "./me.service.js";
import { MyProjectService } from "./my-project.service.js";

@Module({
  imports: [ReportsModule, AttendanceModule, AuthModule, PrismaModule],
  controllers: [MeController],
  providers: [MeService, MyProjectService],
  exports: [MeService],
})
export class MeModule {}
