import { Module } from "@nestjs/common";

import { PrismaModule } from "../infrastructure/database/prisma.module.js";

import { ActiveCompanyGuard } from "./active-company.guard.js";
import { AuthorizationContextService } from "./authorization-context.service.js";
import { CompanyStatusService } from "./company-status.service.js";
import { PermissionsGuard } from "./permissions.guard.js";

@Module({
  imports: [PrismaModule],
  providers: [ActiveCompanyGuard, AuthorizationContextService, CompanyStatusService, PermissionsGuard],
  exports: [ActiveCompanyGuard, AuthorizationContextService, CompanyStatusService, PermissionsGuard]
})
export class AuthorizationModule {}
