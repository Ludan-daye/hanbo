import { createParamDecorator, ExecutionContext, UnauthorizedException } from "@nestjs/common";

import type { AuthenticatedUser, RequestWithAuthenticatedUser } from "./auth.types.js";

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthenticatedUser => {
  const request = context.switchToHttp().getRequest<RequestWithAuthenticatedUser>();

  if (request.user === undefined) {
    throw new UnauthorizedException({
      message: "AUTHENTICATED_USER_NOT_AVAILABLE"
    });
  }

  return request.user;
});
