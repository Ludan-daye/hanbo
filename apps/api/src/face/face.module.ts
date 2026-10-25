import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "../authorization/authorization.module.js";
import { API_ENV } from "../config/env.module.js";
import type { ApiEnv } from "../config/env.js";
import { PrismaModule } from "../infrastructure/database/prisma.module.js";
import { TencentNativeFaceConnector } from "../infrastructure/face/tencent-native-face.connector.js";
import { TencentVideoFaceConnector } from "../infrastructure/face/tencent-video-face.connector.js";
import { UploadsModule } from "../uploads/uploads.module.js";

import { FaceController } from "./face.controller.js";
import { FaceService } from "./face.service.js";
import { FaceLivenessTestService } from "./face-liveness-test.service.js";

@Module({
  imports: [AuthModule, AuthorizationModule, PrismaModule, UploadsModule],
  controllers: [FaceController],
  providers: [
    FaceService,
    FaceLivenessTestService,
    {
      provide: TencentVideoFaceConnector,
      inject: [API_ENV],
      useFactory: (env: ApiEnv): TencentVideoFaceConnector => new TencentVideoFaceConnector(env),
    },
    {
      provide: TencentNativeFaceConnector,
      inject: [API_ENV],
      useFactory: (env: ApiEnv): TencentNativeFaceConnector =>
        new TencentNativeFaceConnector(env),
    },
  ],
  exports: [FaceService],
})
export class FaceModule {}
