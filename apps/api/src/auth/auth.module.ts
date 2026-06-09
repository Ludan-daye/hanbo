import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { AuthorizationModule } from "../authorization/authorization.module.js";
import { API_ENV, EnvModule } from "../config/env.module.js";
import type { ApiEnv } from "../config/env.js";
import { PrismaModule } from "../infrastructure/database/prisma.module.js";
import {
  type FetchLike,
  type SleepLike,
  WECHAT_CODE_SESSION_ENDPOINT,
  WechatCodeSessionConnector,
  type WechatCodeSessionWarningLogger
} from "../infrastructure/wechat/wechat-code-session.connector.js";

import { AccessTokenGuard } from "./access-token.guard.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";

const createFetchImplementation = (): FetchLike => async (input: string | URL, init: RequestInit): Promise<Response> =>
  fetch(input, init);

const createSleep = (): SleepLike => async (milliseconds: number): Promise<void> => {
  await new Promise<void>((resolve: () => void): void => {
    setTimeout(resolve, milliseconds);
  });
};

const createWarningLogger = (): WechatCodeSessionWarningLogger => ({
  warn(fields: Record<string, unknown>): void {
    console.warn(JSON.stringify(fields));
  }
});

@Module({
  imports: [AuthorizationModule, EnvModule, JwtModule.register({}), PrismaModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    AccessTokenGuard,
    {
      provide: WechatCodeSessionConnector,
      useFactory: (env: ApiEnv): WechatCodeSessionConnector =>
        new WechatCodeSessionConnector({
          appId: env.WECHAT_APP_ID,
          appSecret: env.WECHAT_APP_SECRET,
          devLoginEnabled: env.WECHAT_DEV_LOGIN,
          endpoint: WECHAT_CODE_SESSION_ENDPOINT,
          fetchImplementation: createFetchImplementation(),
          logger: createWarningLogger(),
          maxAttempts: 3,
          retryDelayMs: 250,
          sleep: createSleep()
        }),
      inject: [API_ENV]
    }
  ],
  exports: [AccessTokenGuard, AuthService, EnvModule, JwtModule, PrismaModule]
})
export class AuthModule {}
