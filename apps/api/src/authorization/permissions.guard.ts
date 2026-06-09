import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { authorizePermission } from "@construction/domain/roles.js";

import type { RequestWithAuthenticatedUser } from "../auth/auth.types.js";

import { AuthorizationContextService } from "./authorization-context.service.js";
import {
  REQUIRED_PERMISSION_METADATA_KEY,
  type RequestWithAuthorizationParams,
  type RequiredPermissionMetadata
} from "./authorization.types.js";

type AuthorizationRequest = RequestWithAuthenticatedUser & RequestWithAuthorizationParams;

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthorizationContextService) private readonly authorizationContext: AuthorizationContextService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.getAllAndOverride<RequiredPermissionMetadata>(
      REQUIRED_PERMISSION_METADATA_KEY,
      [context.getHandler(), context.getClass()]
    );

    if (requirement === undefined) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthorizationRequest>();

    if (request.user === undefined) {
      throw new UnauthorizedException({
        message: "AUTHENTICATED_USER_REQUIRED_FOR_PERMISSION"
      });
    }

    const targetScope = await this.authorizationContext.resolveTargetScope(requirement.target, request);
    const authorizationData = await this.authorizationContext.loadAuthorizationData(request.user.userId);
    const decision = authorizePermission({
      assignments: authorizationData.assignments,
      permissionsByRoleCode: authorizationData.permissionsByRoleCode,
      requiredPermissionCode: requirement.permissionCode,
      targetScope
    });

    if (!decision.isAuthorized) {
      throw new ForbiddenException({
        message: "PERMISSION_DENIED",
        reason: decision.reason,
        requiredPermissionCode: requirement.permissionCode,
        targetScope,
        userId: request.user.userId
      });
    }

    return true;
  }
}
