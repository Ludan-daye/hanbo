import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import type { RequestWithAuthenticatedUser } from "../auth/auth.types.js";

import { AuthorizationContextService } from "./authorization-context.service.js";
import {
  REQUIRED_ACTIVE_COMPANY_METADATA_KEY,
  type ActiveCompanyTarget,
  type RequestWithAuthorizationParams,
} from "./authorization.types.js";
import { CompanyStatusService, targetCompanyId } from "./company-status.service.js";

type ActiveCompanyRequest = RequestWithAuthenticatedUser & RequestWithAuthorizationParams;

/**
 * Rejects the request with 403 COMPANY_SUSPENDED when the company behind the route's
 * project, team or company param is suspended (system admin plan phase 3). Runs after
 * AccessTokenGuard; the permission check itself stays in the service.
 */
@Injectable()
export class ActiveCompanyGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthorizationContextService) private readonly authorizationContext: AuthorizationContextService,
    @Inject(CompanyStatusService) private readonly companies: CompanyStatusService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const target = this.reflector.getAllAndOverride<ActiveCompanyTarget | undefined>(REQUIRED_ACTIVE_COMPANY_METADATA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (target === undefined) return true;
    const request = context.switchToHttp().getRequest<ActiveCompanyRequest>();
    if (request.user === undefined)
      throw new UnauthorizedException({ message: "AUTHENTICATED_USER_REQUIRED_FOR_PERMISSION" });
    const companyId = targetCompanyId(await this.authorizationContext.resolveTargetScope(target, request));
    if (companyId !== null) await this.companies.assertCompanyActive(companyId, request.user.userId);
    return true;
  }
}
