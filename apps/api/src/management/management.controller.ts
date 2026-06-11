import { Body, Controller, Get, Inject, Param, Post, UseGuards } from "@nestjs/common";
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
  parseCreateTeamRequest
} from "./management-body.parsers.js";
import { ManagementService } from "./management.service.js";
import type {
  CompanyResponse,
  ProjectManagerMemberResponse,
  ProjectParticipantResponse,
  ProjectResponse,
  ProjectWorkerMemberResponse,
  TeamResponse
} from "./management.types.js";

@Controller("management")
export class ManagementController {
  constructor(@Inject(ManagementService) private readonly managementService: ManagementService) {}

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
    return this.managementService.createProjectWorker(projectId, parseCreateProjectWorkerRequest(body));
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
    return this.managementService.createProjectManager(projectId, parseCreateProjectManagerRequest(body));
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
}
