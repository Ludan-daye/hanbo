import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "../authorization/authorization.module.js";
import { PrismaModule } from "../infrastructure/database/prisma.module.js";

import { ManagementController } from "./management.controller.js";
import { ManagementService } from "./management.service.js";

@Module({
  imports: [AuthModule, AuthorizationModule, PrismaModule],
  controllers: [ManagementController],
  providers: [ManagementService],
  exports: [ManagementService]
})
export class ManagementModule {}
