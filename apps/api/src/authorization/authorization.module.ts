import { Module } from "@nestjs/common";

import { PrismaModule } from "../infrastructure/database/prisma.module.js";

import { AuthorizationContextService } from "./authorization-context.service.js";
import { PermissionsGuard } from "./permissions.guard.js";

@Module({
  imports: [PrismaModule],
  providers: [AuthorizationContextService, PermissionsGuard],
  exports: [AuthorizationContextService, PermissionsGuard]
})
export class AuthorizationModule {}
