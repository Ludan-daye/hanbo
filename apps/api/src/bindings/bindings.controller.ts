import { Body, Controller, Inject, Param, Post, UseGuards } from "@nestjs/common";

import { AccessTokenGuard } from "../auth/access-token.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { PermissionsGuard } from "../authorization/permissions.guard.js";
import { RequirePermission } from "../authorization/require-permission.decorator.js";

import { parseCreateBindingInvitationRequest } from "./bindings-body.parsers.js";
import { BindingsService } from "./bindings.service.js";
import type { BindingInvitationResponse } from "./bindings.types.js";

@Controller("bindings")
export class BindingsController {
  constructor(@Inject(BindingsService) private readonly bindingsService: BindingsService) {}

  @Post("projects/:projectId/invitations")
  @RequirePermission({
    permissionCode: "binding.invitation.create",
    target: {
      paramName: "projectId",
      source: "projectParam"
    }
  })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async createProjectInvitation(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param("projectId") projectId: string,
    @Body() body: unknown
  ): Promise<BindingInvitationResponse> {
    return this.bindingsService.createProjectInvitation(
      projectId,
      currentUser.userId,
      parseCreateBindingInvitationRequest(body)
    );
  }
}
