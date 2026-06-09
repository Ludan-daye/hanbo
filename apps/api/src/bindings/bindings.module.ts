import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "../authorization/authorization.module.js";
import { PrismaModule } from "../infrastructure/database/prisma.module.js";

import { BindingsController } from "./bindings.controller.js";
import { BindingsService } from "./bindings.service.js";

@Module({
  imports: [AuthModule, AuthorizationModule, PrismaModule],
  controllers: [BindingsController],
  providers: [BindingsService],
  exports: [BindingsService]
})
export class BindingsModule {}
