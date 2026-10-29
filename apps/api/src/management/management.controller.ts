import { Body, Controller, GoneException, Get, Inject, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { GLOBAL_SCOPE_ID } from "@construction/domain/roles.js";

import { AccessTokenGuard } from "../auth/access-token.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { PermissionsGuard } from "../authorization/permissions.guard.js";
import { RequirePermission } from "../authorization/require-permission.decorator.js";

import {
  parseCreateCompanyRequest,
  parseCreateProjectManagerRequest,
  parseCreateProjectRequest,
  parseCreateProjectWorkerRequest,
  parseCreateTeamRequest,
  parseUpdateProjectRequest,
  parseUpdateTeamRequest
} from "./management-body.parsers.js";
import { ManagementService } from "./management.service.js";
import { ParticipantsService } from "./participants.service.js";
import { parseParticipantPage, parseParticipantWrite, parseReuseParticipant } from "./participants.parsers.js";
import type { ReuseProjectResponse } from "./participants.types.js";
import { TeamsService } from "./teams.service.js";
import type { ManagedTeamResponse } from "./teams.types.js";
import type { ManagedParticipantResponse, ParticipantPageResponse } from "./participants.types.js";
import type { BindingInvitationListItem } from "./management-invitation.types.js";
import type {
  CompanyParticipantResponse,
  CompanyResponse,
  ManagedProjectResponse,
  ProjectManagerMemberResponse,
  ProjectParticipantResponse,
  ProjectResponse,
  ProjectWorkerMemberResponse,
  TeamResponse
} from "./management.types.js";

@Controller("management")
export class ManagementController {
  constructor(
    @Inject(ManagementService) private readonly managementService: ManagementService,
    @Inject(ParticipantsService) private readonly participants: ParticipantsService,
    @Inject(TeamsService) private readonly teams: TeamsService
  ) {}

  @Get("projects/:projectId/managed-teams")
  @RequirePermission({ permissionCode: "team.manage", target: { source: "projectParam", paramName: "projectId" } })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async managedTeams(@Param("projectId") projectId: string): Promise<readonly ManagedTeamResponse[]> {
    return this.teams.list(projectId);
  }

  @Get("projects/:projectId/teams/:teamId")
  @RequirePermission({ permissionCode: "team.manage", target: { source: "projectParam", paramName: "projectId" } })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async managedTeam(@Param("projectId") projectId: string, @Param("teamId") teamId: string): Promise<ManagedTeamResponse> {
    return this.teams.get(projectId, teamId);
  }

  @Put("projects/:projectId/teams/:teamId")
  @RequirePermission({ permissionCode: "team.manage", target: { source: "projectParam", paramName: "projectId" } })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async updateTeam(@CurrentUser() actor: AuthenticatedUser, @Param("projectId") projectId: string, @Param("teamId") teamId: string, @Body() body: unknown): Promise<ManagedTeamResponse> {
    return this.teams.update(projectId, teamId, actor.userId, parseUpdateTeamRequest(body));
  }

  @Get("projects/:projectId/reuse-projects")
  @RequirePermission({ permissionCode: "project.manage", target: { source: "projectParam", paramName: "projectId" } })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async reuseProjects(@CurrentUser() actor: AuthenticatedUser, @Param("projectId") projectId: string): Promise<readonly ReuseProjectResponse[]> {
    return this.participants.reuseProjects(projectId, actor.userId);
  }

  @Post("projects/:projectId/reused-participants")
  @RequirePermission({ permissionCode: "project.manage", target: { source: "projectParam", paramName: "projectId" } })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async reuseParticipant(@CurrentUser() actor: AuthenticatedUser, @Param("projectId") projectId: string, @Body() body: unknown): Promise<ManagedParticipantResponse> {
    return this.participants.reuse(projectId, actor.userId, parseReuseParticipant(body));
  }

  @Get("projects/:projectId")
  @RequirePermission({ permissionCode: "project.manage", target: { source: "projectParam", paramName: "projectId" } })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async managedProject(@Param("projectId") projectId: string): Promise<ManagedProjectResponse> {
    return this.managementService.getManagedProject(projectId);
  }

  @Put("projects/:projectId")
  @RequirePermission({ permissionCode: "project.manage", target: { source: "projectParam", paramName: "projectId" } })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async updateProject(@CurrentUser() actor: AuthenticatedUser, @Param("projectId") projectId: string, @Body() body: unknown): Promise<ManagedProjectResponse> {
    return this.managementService.updateProject(projectId, actor.userId, parseUpdateProjectRequest(body));
  }

  @Get("projects/:projectId/participant-page")
  @RequirePermission({ permissionCode: "project.manage", target: { source: "projectParam", paramName: "projectId" } })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async participantPage(@Param("projectId") projectId: string, @Query() query: unknown): Promise<ParticipantPageResponse> {
    return this.participants.page(projectId, parseParticipantPage(query));
  }

  @Get("projects/:projectId/participants/:memberId")
  @RequirePermission({ permissionCode: "project.manage", target: { source: "projectParam", paramName: "projectId" } })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async participant(@Param("projectId") projectId: string, @Param("memberId") memberId: string): Promise<ManagedParticipantResponse> {
    return this.participants.get(projectId, memberId);
  }

  @Post("projects/:projectId/participants")
  @RequirePermission({ permissionCode: "project.manage", target: { source: "projectParam", paramName: "projectId" } })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async createParticipant(@CurrentUser() actor: AuthenticatedUser, @Param("projectId") projectId: string, @Body() body: unknown): Promise<ManagedParticipantResponse> {
    return this.participants.create(projectId, actor.userId, parseParticipantWrite(body));
  }

  @Put("projects/:projectId/participants/:memberId")
  @RequirePermission({ permissionCode: "project.manage", target: { source: "projectParam", paramName: "projectId" } })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async updateParticipant(@CurrentUser() actor: AuthenticatedUser, @Param("projectId") projectId: string, @Param("memberId") memberId: string, @Body() body: unknown): Promise<ManagedParticipantResponse> {
    return this.participants.update(projectId, memberId, actor.userId, parseParticipantWrite(body));
  }

  @Post("companies")
  @RequirePermission({
    permissionCode: "system.manage",
    target: {
      source: "static",
      targetScope: {
        scopeId: GLOBAL_SCOPE_ID,
        scopeType: "GLOBAL"
      }
    }
  })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async createCompany(@Body() body: unknown): Promise<CompanyResponse> {
    return this.managementService.createCompany(parseCreateCompanyRequest(body));
  }

  @Post("companies/:companyId/projects")
  @RequirePermission({
    permissionCode: "project.create",
    target: {
      paramName: "companyId",
      source: "companyParam"
    }
  })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async createProject(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param("companyId") companyId: string,
    @Body() body: unknown
  ): Promise<ProjectResponse> {
    return this.managementService.createProject(companyId, currentUser.userId, parseCreateProjectRequest(body));
  }

  @Post("projects/:projectId/teams")
  @RequirePermission({
    permissionCode: "team.manage",
    target: {
      paramName: "projectId",
      source: "projectParam"
    }
  })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async createTeam(
    @Param("projectId") projectId: string,
    @Body() body: unknown
  ): Promise<TeamResponse> {
    return this.managementService.createTeam(projectId, parseCreateTeamRequest(body));
  }

  @Post("projects/:projectId/workers")
  @RequirePermission({
    permissionCode: "worker.manage",
    target: {
      paramName: "projectId",
      source: "projectParam"
    }
  })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async createProjectWorker(
    @Param("projectId") projectId: string,
    @Body() body: unknown
  ): Promise<ProjectWorkerMemberResponse> {
    throw new GoneException({ message: "请使用统一人员建档接口 /management/projects/:projectId/participants。" });
  }

  @Post("projects/:projectId/managers")
  @RequirePermission({
    permissionCode: "project.manage",
    target: {
      paramName: "projectId",
      source: "projectParam"
    }
  })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async createProjectManager(
    @Param("projectId") projectId: string,
    @Body() body: unknown
  ): Promise<ProjectManagerMemberResponse> {
    throw new GoneException({ message: "请使用统一人员建档接口 /management/projects/:projectId/participants。" });
  }

  @Get("companies/:companyId/projects")
  @RequirePermission({
    permissionCode: "attendance.view",
    target: { paramName: "companyId", source: "companyParam" }
  })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async listCompanyProjects(
    @Param("companyId") companyId: string
  ): Promise<readonly ProjectResponse[]> {
    return this.managementService.listCompanyProjects(companyId);
  }

  @Get("companies/:companyId/participants")
  @RequirePermission({
    permissionCode: "attendance.view",
    target: { paramName: "companyId", source: "companyParam" }
  })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async listCompanyParticipants(
    @Param("companyId") companyId: string
  ): Promise<readonly CompanyParticipantResponse[]> {
    return this.managementService.listCompanyParticipants(companyId);
  }

  @Get("projects/:projectId/participants")
  @RequirePermission({
    permissionCode: "attendance.view",
    target: {
      paramName: "projectId",
      source: "projectParam"
    }
  })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async listProjectParticipants(@Param("projectId") projectId: string): Promise<readonly ProjectParticipantResponse[]> {
    return this.managementService.listProjectParticipants(projectId);
  }

  @Get("teams/:teamId/participants")
  @RequirePermission({
    permissionCode: "attendance.view",
    target: {
      paramName: "teamId",
      source: "teamParam"
    }
  })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async listTeamParticipants(
    @Param("teamId") teamId: string
  ): Promise<readonly ProjectParticipantResponse[]> {
    return this.managementService.listTeamParticipants(teamId);
  }

  @Get("projects/:projectId/teams")
  @RequirePermission({ permissionCode: "team.manage", target: { paramName: "projectId", source: "projectParam" } })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async listProjectTeams(@Param("projectId") projectId: string): Promise<readonly TeamResponse[]> {
    return this.managementService.listProjectTeams(projectId);
  }

  @Get("projects/:projectId/invitations")
  @RequirePermission({ permissionCode: "binding.invitation.create", target: { paramName: "projectId", source: "projectParam" } })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async listProjectInvitations(@Param("projectId") projectId: string): Promise<readonly BindingInvitationListItem[]> {
    return this.managementService.listProjectInvitations(projectId);
  }

  @Post("projects/:projectId/invitations/:invitationId/revoke")
  @RequirePermission({ permissionCode: "binding.invitation.create", target: { paramName: "projectId", source: "projectParam" } })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async revokeProjectInvitation(
    @Param("projectId") projectId: string,
    @Param("invitationId") invitationId: string
  ): Promise<BindingInvitationListItem> {
    return this.managementService.revokeProjectInvitation(projectId, invitationId);
  }
}
