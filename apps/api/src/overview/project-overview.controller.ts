import { Controller, Get, Inject, Param, Query, UseGuards } from "@nestjs/common";

import { AccessTokenGuard } from "../auth/access-token.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { PermissionsGuard } from "../authorization/permissions.guard.js";
import { RequirePermission } from "../authorization/require-permission.decorator.js";

import { parseOverviewQuery } from "./project-overview.parsers.js";
import { ProjectOverviewService } from "./project-overview.service.js";
import type { ProjectOverviewResponse } from "./project-overview.types.js";

@Controller("management")
export class ProjectOverviewController {
  constructor(
    @Inject(ProjectOverviewService)
    private readonly overviewService: ProjectOverviewService,
  ) {}

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
