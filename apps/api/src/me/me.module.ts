import { Module } from "@nestjs/common";

import { AttendanceModule } from "../attendance/attendance.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { PrismaModule } from "../infrastructure/database/prisma.module.js";

import { MeController } from "./me.controller.js";
import { MeService } from "./me.service.js";

@Module({
  imports: [AttendanceModule, AuthModule, PrismaModule],
  controllers: [MeController],
  providers: [MeService],
  exports: [MeService]
})
export class MeModule {}
