import { Body, Controller, Get, Inject, Param, Put, UseGuards } from "@nestjs/common";
import { AccessTokenGuard } from "../auth/access-token.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { PermissionsGuard } from "../authorization/permissions.guard.js";
import { RequirePermission } from "../authorization/require-permission.decorator.js";
import { parseWorktimeRuleInput } from "./worktime.parsers.js";
import { WorktimeService, type WorktimeConfiguration } from "./worktime.service.js";

@Controller("worktime/projects")
@UseGuards(AccessTokenGuard, PermissionsGuard)
export class WorktimeController {
  constructor(@Inject(WorktimeService) private readonly worktime: WorktimeService) {}

  @Get(":projectId")
  @RequirePermission({ permissionCode: "attendance.view", target: { source: "projectParam", paramName: "projectId" } })
  get(@Param("projectId") projectId: string): Promise<WorktimeConfiguration> {
    return this.worktime.get(projectId);
  }

  @Put(":projectId")
  @RequirePermission({ permissionCode: "project.manage", target: { source: "projectParam", paramName: "projectId" } })
  save(@Param("projectId") projectId: string, @CurrentUser() actor: AuthenticatedUser, @Body() body: unknown): Promise<WorktimeConfiguration> {
    return this.worktime.save(projectId, actor.userId, parseWorktimeRuleInput(body));
  }
}
