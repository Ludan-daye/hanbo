import { Controller, Get, Inject, Param, Query, UseGuards } from "@nestjs/common";

import { AccessTokenGuard } from "../auth/access-token.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { PermissionsGuard } from "../authorization/permissions.guard.js";
import { RequirePermission } from "../authorization/require-permission.decorator.js";

import { CompanyOverviewService } from "./company-overview.service.js";
import type { CompanyOverviewResponse, ProjectHealthResponse } from "./company-overview.types.js";
import { parseOverviewQuery } from "./project-overview.parsers.js";
import { ProjectOverviewService } from "./project-overview.service.js";
import type { ProjectOverviewResponse } from "./project-overview.types.js";

@Controller("management")
export class ProjectOverviewController {
  constructor(
    @Inject(ProjectOverviewService)
    private readonly overviewService: ProjectOverviewService,
    @Inject(CompanyOverviewService)
    private readonly companyOverview: CompanyOverviewService,
  ) {}

  @Get("companies/:companyId/overview")
  @RequirePermission({
    permissionCode: "company.manage",
    target: { paramName: "companyId", source: "companyParam" },
  })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async company(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("companyId") companyId: string,
    @Query() query: unknown,
  ): Promise<CompanyOverviewResponse> {
    return this.companyOverview.overview(
      actor.userId,
      companyId,
      parseOverviewQuery(query).date,
    );
  }

  @Get("companies/:companyId/project-health")
  @RequirePermission({
    permissionCode: "company.manage",
    target: { paramName: "companyId", source: "companyParam" },
  })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async projectHealth(@Param("companyId") companyId: string): Promise<ProjectHealthResponse> {
    return this.companyOverview.projectHealth(companyId);
  }

  @Get("projects/:projectId/overview")
  @RequirePermission({
    permissionCode: "project.manage",
    target: { paramName: "projectId", source: "projectParam" },
  })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async overview(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("projectId") projectId: string,
    @Query() query: unknown,
  ): Promise<ProjectOverviewResponse> {
    return this.overviewService.overview(
      actor.userId,
      projectId,
      parseOverviewQuery(query).date,
    );
  }
}
