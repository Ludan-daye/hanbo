import type { UserStatus } from "@prisma/client";

export type AuthenticatedUser = {
  readonly sessionId: string;
  readonly sessionVersion: number;
  readonly userId: string;
};

export type RequestWithAuthenticatedUser = {
  readonly headers: Record<string, string | string[] | undefined>;
  readonly ip?: string;
  user?: AuthenticatedUser;
};

export type RequestMetadata = {
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
};

export type WechatLoginRequest = {
  readonly code: string;
};

export type RefreshTokenRequest = {
  readonly refreshToken: string;
};

export type BindByInvitationRequest = {
  readonly invitationCode: string;
};

export type AccessTokenPayload = {
  readonly sid: string;
  readonly sub: string;
  readonly sv: number;
};

export type AuthenticatedUserResponse = {
  readonly id: string;
  readonly isBound: boolean;
  readonly openid: string;
  readonly status: UserStatus;
};

export type LoginResponse = {
  readonly accessToken: string;
  readonly accessTokenExpiresAt: string;
  readonly refreshToken: string;
  readonly refreshTokenExpiresAt: string;
  readonly user: AuthenticatedUserResponse;
};

export type RefreshResponse = {
  readonly accessToken: string;
  readonly accessTokenExpiresAt: string;
  readonly user: AuthenticatedUserResponse;
};

export type BindByInvitationResponse = {
  readonly profileId: string;
  readonly targetType: "MANAGER" | "WORKER";
};
