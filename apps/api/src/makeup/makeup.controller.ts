import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import { AccessTokenGuard } from "../auth/access-token.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { PermissionsGuard } from "../authorization/permissions.guard.js";
import { RequirePermission } from "../authorization/require-permission.decorator.js";

import {
  parseCreateMakeupRequestBody,
  parseReviewMakeupRequestBody,
} from "./makeup-body.parsers.js";
import { MakeupService } from "./makeup.service.js";
import type {
  MakeupInboxResponse,
  MakeupRequestResponse,
  ReviewMakeupResponse,
} from "./makeup.types.js";

@Controller("makeups")
export class MakeupController {
  constructor(
    @Inject(MakeupService) private readonly makeupService: MakeupService,
  ) {}

  @Get("pending")
  @UseGuards(AccessTokenGuard)
  async inbox(
    @CurrentUser() user: AuthenticatedUser,
    @Query("cursor") cursor: string | undefined,
  ): Promise<MakeupInboxResponse> {
    return this.makeupService.pendingInbox(user.userId, cursor ?? null);
  }

  @Post("projects/:projectId/requests")
  @UseGuards(AccessTokenGuard)
  async createMakeupRequest(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param("projectId") projectId: string,
    @Body() body: unknown,
  ): Promise<MakeupRequestResponse> {
    return this.makeupService.createMakeupRequest(
      projectId,
      currentUser.userId,
      parseCreateMakeupRequestBody(body),
    );
  }

  // No controller-level @RequirePermission: the request id alone does not carry a project scope,
  // and MakeupService delegates to `canApproveScopedMakeupRequest` which resolves the project
  // from the persisted MakeupRequest and enforces makeup.approve at that scope (with self-approval blocked).
  @Post("requests/:requestId/approve")
  @UseGuards(AccessTokenGuard)
  async approveMakeupRequest(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param("requestId") requestId: string,
    @Body() body: unknown,
  ): Promise<ReviewMakeupResponse> {
    return this.makeupService.approveMakeupRequest(
      requestId,
      currentUser.userId,
      parseReviewMakeupRequestBody(body),
    );
  }

  // No controller-level @RequirePermission: the request id alone does not carry a project scope,
  // and MakeupService delegates to `canApproveScopedMakeupRequest` which resolves the project
  // from the persisted MakeupRequest and enforces makeup.approve at that scope (with self-approval blocked).
  @Post("requests/:requestId/reject")
  @UseGuards(AccessTokenGuard)
  async rejectMakeupRequest(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param("requestId") requestId: string,
    @Body() body: unknown,
  ): Promise<ReviewMakeupResponse> {
    return this.makeupService.rejectMakeupRequest(
      requestId,
      currentUser.userId,
      parseReviewMakeupRequestBody(body),
    );
  }

  @Get("teams/:teamId/pending")
  @RequirePermission({
    permissionCode: "makeup.approve",
    target: { paramName: "teamId", source: "teamParam" },
  })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async listTeamPendingMakeups(
    @Param("teamId") teamId: string,
  ): Promise<readonly MakeupRequestResponse[]> {
    return this.makeupService.listTeamPendingRequests(teamId);
  }
}
