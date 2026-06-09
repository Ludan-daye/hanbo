import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { z } from "zod";

import { API_ENV } from "../config/env.module.js";
import type { ApiEnv } from "../config/env.js";
import { PrismaService } from "../infrastructure/database/prisma.service.js";

import type { AccessTokenPayload, RequestWithAuthenticatedUser } from "./auth.types.js";

const accessTokenPayloadSchema = z.object({
  sid: z.string().min(1),
  sub: z.string().min(1),
  sv: z.number().int().positive()
});

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

export const extractBearerToken = (authorizationHeader: string | undefined): string => {
  if (authorizationHeader === undefined) {
    throw new UnauthorizedException({
      message: "MISSING_AUTHORIZATION_HEADER"
    });
  }

  const [scheme, token, extra] = authorizationHeader.split(" ");

  if (scheme !== "Bearer" || token === undefined || token.length === 0 || extra !== undefined) {
    throw new UnauthorizedException({
      authorizationHeaderPresent: true,
      message: "INVALID_AUTHORIZATION_HEADER"
    });
  }

  return token;
};

const parseAccessTokenPayload = (payload: unknown): AccessTokenPayload => {
  const result = accessTokenPayloadSchema.safeParse(payload);

  if (!result.success) {
    throw new UnauthorizedException({
      issues: result.error.issues,
      message: "INVALID_ACCESS_TOKEN_PAYLOAD"
    });
  }

  return result.data;
};

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(API_ENV) private readonly env: ApiEnv
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithAuthenticatedUser>();
    const token = extractBearerToken(getHeaderValue(request.headers, "authorization"));
    const payload = await this.verifyToken(token);
    const session = await this.prisma.userSession.findUnique({
      include: {
        user: true
      },
      where: {
        id: payload.sid
      }
    });

    if (session === null) {
      throw new UnauthorizedException({
        message: "SESSION_NOT_FOUND",
        sessionId: payload.sid,
        userId: payload.sub
      });
    }

    if (session.userId !== payload.sub || session.user.sessionVersion !== payload.sv) {
      throw new UnauthorizedException({
        message: "ACCESS_TOKEN_SESSION_MISMATCH",
        sessionId: payload.sid,
        userId: payload.sub
      });
    }

    if (session.revokedAt !== null || session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException({
        message: "SESSION_INACTIVE",
        sessionId: payload.sid,
        userId: payload.sub
      });
    }

    if (session.user.status !== "ACTIVE") {
      throw new UnauthorizedException({
        message: "USER_DISABLED",
        userId: payload.sub
      });
    }

    request.user = {
      sessionId: payload.sid,
      sessionVersion: payload.sv,
      userId: payload.sub
    };

    return true;
  }

  private async verifyToken(token: string): Promise<AccessTokenPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<Record<string, unknown>>(token, {
        secret: this.env.JWT_ACCESS_TOKEN_SECRET
      });
      return parseAccessTokenPayload(payload);
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException({
        errorName: error instanceof Error ? error.name : "UnknownError",
        message: "INVALID_ACCESS_TOKEN"
      });
    }
  }
}
