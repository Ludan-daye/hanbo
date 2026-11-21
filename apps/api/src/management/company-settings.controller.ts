import { Body, Controller, Get, Inject, Param, Put, UseGuards } from "@nestjs/common";

import { AccessTokenGuard } from "../auth/access-token.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { PermissionsGuard } from "../authorization/permissions.guard.js";
import { RequirePermission } from "../authorization/require-permission.decorator.js";

import { parseCompanyAttendanceDefaults, parseCompanyProfile } from "./company-settings.parsers.js";
import { CompanySettingsService } from "./company-settings.service.js";
import type { CompanyAttendanceDefaultsResponse, CompanyProfileResponse } from "./company-settings.types.js";

const target = { paramName: "companyId", source: "companyParam" } as const;

/** Company settings: default attendance plan and worktime rule, and contact details. */
@Controller("management/companies/:companyId")
export class CompanySettingsController {
  constructor(
    @Inject(CompanySettingsService) private readonly settings: CompanySettingsService,
  ) {}

  @Get("attendance-defaults")
  @RequirePermission({ permissionCode: "attendance.view", target })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async defaults(@Param("companyId") companyId: string): Promise<CompanyAttendanceDefaultsResponse> {
    return this.settings.defaults(companyId);
  }

  @Put("attendance-defaults")
  @RequirePermission({ permissionCode: "company.manage", target })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async saveDefaults(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("companyId") companyId: string,
    @Body() body: unknown,
  ): Promise<CompanyAttendanceDefaultsResponse> {
    return this.settings.saveDefaults(companyId, actor.userId, parseCompanyAttendanceDefaults(body));
  }

  @Get("profile")
  @RequirePermission({ permissionCode: "company.manage", target })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async profile(@Param("companyId") companyId: string): Promise<CompanyProfileResponse> {
    return this.settings.profile(companyId);
  }

  @Put("profile")
  @RequirePermission({ permissionCode: "company.manage", target })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async updateProfile(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("companyId") companyId: string,
    @Body() body: unknown,
  ): Promise<CompanyProfileResponse> {
    return this.settings.updateProfile(companyId, actor.userId, parseCompanyProfile(body));
  }
}
