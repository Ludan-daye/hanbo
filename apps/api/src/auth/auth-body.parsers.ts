import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

import type { BindByInvitationRequest, RefreshTokenRequest, WechatLoginRequest } from "./auth.types.js";

const wechatLoginRequestSchema = z.object({
  code: z.string().min(1)
});

const refreshTokenRequestSchema = z.object({
  refreshToken: z.string().min(1)
});

const bindByInvitationRequestSchema = z.object({
  invitationCode: z.string().min(1)
});

const parseBody = <T>(body: unknown, schema: z.ZodType<T>, message: string): T => {
  const result = schema.safeParse(body);

  if (!result.success) {
    throw new BadRequestException({
      issues: result.error.issues,
      message
    });
  }

  return result.data;
};

export const parseWechatLoginRequest = (body: unknown): WechatLoginRequest =>
  parseBody(body, wechatLoginRequestSchema, "INVALID_WECHAT_LOGIN_REQUEST");

export const parseRefreshTokenRequest = (body: unknown): RefreshTokenRequest =>
  parseBody(body, refreshTokenRequestSchema, "INVALID_REFRESH_TOKEN_REQUEST");

export const parseBindByInvitationRequest = (body: unknown): BindByInvitationRequest =>
  parseBody(body, bindByInvitationRequestSchema, "INVALID_BIND_BY_INVITATION_REQUEST");
