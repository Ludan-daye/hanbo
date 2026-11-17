import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "../authorization/authorization.module.js";
import { PrismaModule } from "../infrastructure/database/prisma.module.js";
import { UploadsModule } from "../uploads/uploads.module.js";
import { SafetyCreditController } from "./safety-credit.controller.js";
import { SafetyCreditService } from "./safety-credit.service.js";

@Module({
  imports: [AuthModule, AuthorizationModule, PrismaModule, UploadsModule],
  controllers: [SafetyCreditController],
  providers: [SafetyCreditService],
  exports: [SafetyCreditService],
})
export class SafetyCreditModule {}
