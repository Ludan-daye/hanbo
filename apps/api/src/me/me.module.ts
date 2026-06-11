import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { PrismaModule } from "../infrastructure/database/prisma.module.js";

import { MeController } from "./me.controller.js";
import { MeService } from "./me.service.js";

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [MeController],
  providers: [MeService],
  exports: [MeService]
})
export class MeModule {}
