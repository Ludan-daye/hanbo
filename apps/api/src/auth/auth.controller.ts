import { Body, Controller, Get, Inject, Post, Req, UseGuards } from "@nestjs/common";

import { AccessTokenGuard } from "./access-token.guard.js";
import { AuthService } from "./auth.service.js";
import {
  parseBindByInvitationRequest,
  parseRefreshTokenRequest,
  parseWechatLoginRequest
} from "./auth-body.parsers.js";
import { CurrentUser } from "./current-user.decorator.js";
import type {
  AuthenticatedUser,
  BindByInvitationResponse,
  LoginResponse,
  MeResponse,
  RefreshResponse,
  RequestMetadata,
  RequestWithAuthenticatedUser
} from "./auth.types.js";

const getHeaderValue = (
  headers: Record<string, string | string[] | undefined>,
  headerName: string
): string | undefined => {
  const value = headers[headerName];

  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
};

const getRequestMetadata = (request: RequestWithAuthenticatedUser): RequestMetadata => ({
  ipAddress: request.ip ?? null,
  userAgent: getHeaderValue(request.headers, "user-agent") ?? null
});

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post("wechat/login")
  async login(@Body() body: unknown, @Req() request: RequestWithAuthenticatedUser): Promise<LoginResponse> {
    return this.authService.loginWithWechatCode(parseWechatLoginRequest(body), getRequestMetadata(request));
  }

  @Post("refresh")
  async refresh(@Body() body: unknown, @Req() request: RequestWithAuthenticatedUser): Promise<RefreshResponse> {
    return this.authService.refreshAccessToken(parseRefreshTokenRequest(body), getRequestMetadata(request));
  }

  @Get("me")
  @UseGuards(AccessTokenGuard)
  async me(@CurrentUser() currentUser: AuthenticatedUser): Promise<MeResponse> {
    return this.authService.getMe(currentUser.userId);
  }

  @Post("logout")
  @UseGuards(AccessTokenGuard)
  async logout(@CurrentUser() currentUser: AuthenticatedUser): Promise<{ readonly status: "ok" }> {
    return this.authService.logout(currentUser);
  }

  @Post("bind")
  @UseGuards(AccessTokenGuard)
  async bind(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: unknown
  ): Promise<BindByInvitationResponse> {
    return this.authService.bindByInvitation(currentUser, parseBindByInvitationRequest(body));
  }
}
