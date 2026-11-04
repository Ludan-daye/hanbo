import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Inject,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import type {
  NewTaskInvitation,
  SafetyBriefing,
  SafetyIssue,
  SafetyIssuePage,
  SavedTeamDailySummary,
  TaskInvitation,
  TaskJoinResult,
  TeamDailySummary,
  TeamTask,
  TeamTaskWorker,
  TeamTaskDefaults,
  TeamTaskTemplatePage,
} from "@construction/domain";

import { AccessTokenGuard } from "../auth/access-token.guard.js";
import { AllowIncompleteAccount } from "../auth/account-onboarding.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { PermissionsGuard } from "../authorization/permissions.guard.js";
import { RequirePermission } from "../authorization/require-permission.decorator.js";
import {
  parseBriefing,
  parseCode,
  parseDay,
  parseInvitation,
  parseIssue,
  parseResolution,
  parseTask,
  parseTaskDetails,
  parseTaskMembers,
  parseTaskStatus,
} from "./team-work.parsers.js";
import { TeamWorkService } from "./team-work.service.js";
import { TemporaryInvitationsService } from "./temporary-invitations.service.js";

@Controller("team-work/teams/:teamId")
@UseGuards(AccessTokenGuard, PermissionsGuard)
@RequirePermission({
  permissionCode: "team.work.manage",
  target: { source: "teamParam", paramName: "teamId" },
})
export class TeamWorkController {
  constructor(
    @Inject(TeamWorkService) private readonly work: TeamWorkService,
    @Inject(TemporaryInvitationsService)
    private readonly invites: TemporaryInvitationsService,
  ) {}
  @Get("workers")
  @Header("Cache-Control", "no-store")
  workers(@Param("teamId") teamId: string): Promise<readonly TeamTaskWorker[]> {
    return this.work.assignableWorkers(teamId);
  }
  @Get("task-defaults")
  @Header("Cache-Control", "no-store")
  taskDefaults(
    @Param("teamId") teamId: string,
    @Query("date") date: string,
  ): Promise<TeamTaskDefaults> {
    return this.work.taskDefaults(teamId, parseDay(date));
  }
  @Get("task-templates")
  @Header("Cache-Control", "no-store")
  taskTemplates(
    @Param("teamId") teamId: string,
    @Query("cursor") cursor: string | undefined,
    @Query("search") search: string | undefined,
  ): Promise<TeamTaskTemplatePage> {
    return this.work.taskTemplates(teamId, cursor, search?.trim() ?? "");
  }
  @Post("tasks/:taskId/members")
  addMembers(
    @Param("teamId") teamId: string,
    @Param("taskId") taskId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() body: unknown,
  ): Promise<TeamTask> {
    return this.work.addTaskMembers(
      teamId,
      taskId,
      actor.userId,
      parseTaskMembers(body),
    );
  }
  @Get("tasks")
  @Header("Cache-Control", "no-store")
  tasks(
    @Param("teamId") teamId: string,
    @Query("date") date: string,
  ): Promise<readonly TeamTask[]> {
    return this.work.listTasks(teamId, parseDay(date));
  }
  @Post("tasks")
  createTask(
    @Param("teamId") teamId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() body: unknown,
  ): Promise<TeamTask> {
    return this.work.createTask(teamId, actor.userId, parseTask(body));
  }
  @Put("tasks/:taskId")
  updateTask(
    @Param("teamId") teamId: string,
    @Param("taskId") taskId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() body: unknown,
  ): Promise<TeamTask> {
    return this.work.updateTask(
      teamId,
      taskId,
      actor.userId,
      parseTaskDetails(body),
    );
  }
  @Delete("tasks/:taskId/members/:memberId")
  removeMember(
    @Param("teamId") teamId: string,
    @Param("taskId") taskId: string,
    @Param("memberId") memberId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    return this.work.removeTaskMember(teamId, taskId, memberId, actor.userId);
  }
  @Put("tasks/:taskId/status")
  closeTask(
    @Param("teamId") teamId: string,
    @Param("taskId") taskId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() body: unknown,
  ): Promise<void> {
    return this.work.closeTask(
      teamId,
      taskId,
      actor.userId,
      parseTaskStatus(body),
    );
  }
  @Post("tasks/:taskId/members/:memberId/exit")
  exitTask(
    @Param("teamId") teamId: string,
    @Param("taskId") taskId: string,
    @Param("memberId") memberId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    return this.work.confirmTaskExit(teamId, taskId, memberId, actor.userId);
  }
  @Get("tasks/:taskId/invitations")
  @Header("Cache-Control", "no-store")
  invitations(
    @Param("teamId") teamId: string,
    @Param("taskId") taskId: string,
  ): Promise<readonly TaskInvitation[]> {
    return this.invites.list(teamId, taskId);
  }
  @Post("tasks/:taskId/invitations")
  @Header("Cache-Control", "no-store")
  invite(
    @Param("teamId") teamId: string,
    @Param("taskId") taskId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() body: unknown,
  ): Promise<NewTaskInvitation> {
    return this.invites.create(
      teamId,
      taskId,
      actor.userId,
      parseInvitation(body),
    );
  }
  @Post("tasks/:taskId/invitations/:id/revoke")
  revoke(
    @Param("teamId") teamId: string,
    @Param("taskId") taskId: string,
    @Param("id") id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    return this.invites.revoke(teamId, taskId, id, actor.userId);
  }
  @Get("briefings")
  briefings(
    @Param("teamId") teamId: string,
    @Query("date") date: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<readonly SafetyBriefing[]> {
    return this.work.briefings(
      { teamId, workDate: new Date(parseDay(date)) },
      actor.userId,
    );
  }
  @Post("briefings")
  @RequirePermission({
    permissionCode: "team.safety.manage",
    target: { source: "teamParam", paramName: "teamId" },
  })
  publish(
    @Param("teamId") teamId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() body: unknown,
  ): Promise<void> {
    return this.work.publishBriefing(teamId, actor.userId, parseBriefing(body));
  }
  @Get("issues")
  issues(
    @Param("teamId") teamId: string,
    @Query("date") date: string,
  ): Promise<readonly SafetyIssue[]> {
    return this.work.issues(teamId, parseDay(date));
  }
  @Get("issues/open")
  @Header("Cache-Control", "no-store")
  openIssues(
    @Param("teamId") teamId: string,
    @Query("cursor") cursor: string | undefined,
  ): Promise<SafetyIssuePage> {
    return this.work.openIssues(teamId, cursor ?? null);
  }
  @Post("issues")
  @RequirePermission({
    permissionCode: "team.safety.manage",
    target: { source: "teamParam", paramName: "teamId" },
  })
  record(
    @Param("teamId") teamId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() body: unknown,
  ): Promise<void> {
    return this.work.recordIssue(teamId, actor.userId, parseIssue(body));
  }
  @Put("issues/:id/resolution")
  @RequirePermission({
    permissionCode: "team.safety.manage",
    target: { source: "teamParam", paramName: "teamId" },
  })
  resolve(
    @Param("teamId") teamId: string,
    @Param("id") id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() body: unknown,
  ): Promise<void> {
    return this.work.resolveIssue(
      teamId,
      id,
      actor.userId,
      parseResolution(body),
    );
  }
  @Get("daily")
  daily(
    @Param("teamId") teamId: string,
    @Query("date") date: string,
  ): Promise<TeamDailySummary> {
    return this.work.daily(teamId, parseDay(date));
  }
  @Get("daily/:date")
  @Header("Cache-Control", "no-store")
  async savedDaily(
    @Param("teamId") teamId: string,
    @Param("date") date: string,
  ): Promise<SavedTeamDailySummary> {
    return { snapshot: await this.work.savedDaily(teamId, parseDay(date)) };
  }
  @Post("daily/:date")
  saveDaily(
    @Param("teamId") teamId: string,
    @Param("date") date: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<TeamDailySummary> {
    return this.work.saveDaily(teamId, parseDay(date), actor.userId);
  }
}

@Controller("team-work/me")
@UseGuards(AccessTokenGuard)
export class MyTeamWorkController {
  constructor(
    @Inject(TeamWorkService) private readonly work: TeamWorkService,
    @Inject(TemporaryInvitationsService)
    private readonly invites: TemporaryInvitationsService,
  ) {}
  @Post("join")
  @AllowIncompleteAccount()
  join(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() body: unknown,
  ): Promise<TaskJoinResult> {
    return this.invites.accept(actor.userId, parseCode(body));
  }
  @Get("tasks")
  @Header("Cache-Control", "no-store")
  tasks(
    @CurrentUser() actor: AuthenticatedUser,
    @Query("date") date: string,
  ): Promise<readonly TeamTask[]> {
    return this.work.myTasks(actor.userId, parseDay(date));
  }
  @Get("briefings")
  briefings(
    @CurrentUser() actor: AuthenticatedUser,
    @Query("date") date: string,
  ): Promise<readonly SafetyBriefing[]> {
    return this.work.myBriefings(actor.userId, parseDay(date));
  }
  @Post("briefings/:id/acknowledge")
  acknowledge(
    @Param("id") id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    return this.work.acknowledge(id, actor.userId);
  }
}
