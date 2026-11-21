import { Body, Controller, Get, Inject, Param, Post, UseGuards } from "@nestjs/common";

import { AccessTokenGuard } from "../auth/access-token.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { PermissionsGuard } from "../authorization/permissions.guard.js";
import { RequirePermission } from "../authorization/require-permission.decorator.js";

import { parseOffboard, parseParticipantTypeParam } from "./company-people.parsers.js";
import { CompanyPeopleService } from "./company-people.service.js";
import type { CompanyPersonResponse, ProjectAdminsResponse } from "./company-people.types.js";

const COMPANY = {
  permissionCode: "company.manage",
  target: { paramName: "companyId", source: "companyParam" },
} as const;

/** Company-admin views of people across the company's projects. */
@Controller("management/companies/:companyId")
export class CompanyPeopleController {
  constructor(
    @Inject(CompanyPeopleService) private readonly people: CompanyPeopleService,
  ) {}

  @Get("project-admins")
  @RequirePermission(COMPANY)
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async projectAdmins(@Param("companyId") companyId: string): Promise<ProjectAdminsResponse> {
    return this.people.projectAdmins(companyId);
  }

  @Get("people/:participantType/:profileId")
  @RequirePermission(COMPANY)
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async person(
    @Param("companyId") companyId: string,
    @Param("participantType") participantType: string,
    @Param("profileId") profileId: string,
  ): Promise<CompanyPersonResponse> {
    return this.people.person(companyId, parseParticipantTypeParam(participantType), profileId);
  }

  @Post("people/:participantType/:profileId/offboard")
  @RequirePermission(COMPANY)
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async offboard(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("companyId") companyId: string,
    @Param("participantType") participantType: string,
    @Param("profileId") profileId: string,
    @Body() body: unknown,
  ): Promise<CompanyPersonResponse> {
    return this.people.offboard(
      companyId,
      parseParticipantTypeParam(participantType),
      profileId,
      actor.userId,
      parseOffboard(body),
    );
  }
}
