import { Body, Controller, Get, Inject, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { GLOBAL_SCOPE_ID } from "@construction/domain/roles.js";

import { AccessTokenGuard } from "../auth/access-token.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { PermissionsGuard } from "../authorization/permissions.guard.js";
import { RequirePermission } from "../authorization/require-permission.decorator.js";

import {
  parseCandidateSearch,
  parseCompanyAdminAppointment,
  parseSystemCompanyCreate,
  parseSystemCompanyQuery,
  parseSystemCompanyUpdate,
} from "./system.parsers.js";
import { SystemCompaniesService } from "./system-companies.service.js";
import type {
  CompanyAdminAppointed,
  CompanyAdminCandidate,
  CompanyAdminRevoked,
  IssuedCompanyInvitation,
  SystemCompanyDetail,
  SystemCompanyPage,
} from "./system.types.js";

/** Every platform endpoint needs system.manage on the GLOBAL scope (SYSTEM_ADMIN). */
const platform = {
  permissionCode: "system.manage",
  target: { source: "static", targetScope: { scopeId: GLOBAL_SCOPE_ID, scopeType: "GLOBAL" } },
} as const;

/** Platform management (system admin plan): companies and company administrators so far. */
@Controller("system")
export class SystemController {
  constructor(@Inject(SystemCompaniesService) private readonly companies: SystemCompaniesService) {}

  @Get("companies")
  @RequirePermission(platform)
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async listCompanies(@Query() query: unknown): Promise<SystemCompanyPage> {
    return this.companies.list(parseSystemCompanyQuery(query));
  }

  @Post("companies")
  @RequirePermission(platform)
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async createCompany(@CurrentUser() actor: AuthenticatedUser, @Body() body: unknown): Promise<SystemCompanyDetail> {
    return this.companies.create(actor.userId, parseSystemCompanyCreate(body));
  }

  @Get("companies/:companyId")
  @RequirePermission(platform)
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async company(@Param("companyId") companyId: string): Promise<SystemCompanyDetail> {
    return this.companies.detail(companyId);
  }

  @Put("companies/:companyId")
  @RequirePermission(platform)
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async updateCompany(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("companyId") companyId: string,
    @Body() body: unknown,
  ): Promise<SystemCompanyDetail> {
    return this.companies.update(actor.userId, companyId, parseSystemCompanyUpdate(body));
  }

  @Get("companies/:companyId/admin-candidates")
  @RequirePermission(platform)
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async adminCandidates(@Param("companyId") companyId: string, @Query() query: unknown): Promise<readonly CompanyAdminCandidate[]> {
    return this.companies.candidates(companyId, parseCandidateSearch(query));
  }

  @Post("companies/:companyId/admins")
  @RequirePermission(platform)
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async appointAdmin(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("companyId") companyId: string,
    @Body() body: unknown,
  ): Promise<CompanyAdminAppointed> {
    return this.companies.appoint(actor.userId, companyId, parseCompanyAdminAppointment(body));
  }

  @Post("companies/:companyId/admins/:memberId/invitation")
  @RequirePermission(platform)
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async reissueInvitation(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("companyId") companyId: string,
    @Param("memberId") memberId: string,
  ): Promise<IssuedCompanyInvitation> {
    return this.companies.reissueInvitation(actor.userId, companyId, memberId);
  }

  @Post("companies/:companyId/admins/:memberId/revoke")
  @RequirePermission(platform)
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async revokeAdmin(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("companyId") companyId: string,
    @Param("memberId") memberId: string,
  ): Promise<CompanyAdminRevoked> {
    return this.companies.revoke(actor.userId, companyId, memberId);
  }
}
