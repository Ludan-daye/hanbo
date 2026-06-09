import { Module } from "@nestjs/common";

import { AttendanceModule } from "../attendance/attendance.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "../authorization/authorization.module.js";
import { PrismaModule } from "../infrastructure/database/prisma.module.js";

import { MakeupController } from "./makeup.controller.js";
import { MakeupService } from "./makeup.service.js";

@Module({
  imports: [AuthModule, AuthorizationModule, PrismaModule, AttendanceModule],
  controllers: [MakeupController],
  providers: [MakeupService],
  exports: [MakeupService]
})
export class MakeupModule {}
