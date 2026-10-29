import { Module } from "@nestjs/common";

import { UploadsModule } from "../uploads/uploads.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "../authorization/authorization.module.js";
import { FaceModule } from "../face/face.module.js";
import { API_ENV } from "../config/env.module.js";
import type { ApiEnv } from "../config/env.js";
import { FACE_VERIFICATION_CONNECTOR, type FaceVerificationConnector } from "../infrastructure/face/face-verification.types.js";
import { FailClosedFaceVerificationConnector } from "../infrastructure/face/fail-closed-face-verification.connector.js";
import { StubFaceVerificationConnector } from "../infrastructure/face/stub-face-verification.connector.js";
import { PrismaModule } from "../infrastructure/database/prisma.module.js";

import { AttendancePlansController } from "./attendance-plans.controller.js";
import { AttendanceController } from "./attendance.controller.js";
import { AttendanceService } from "./attendance.service.js";

@Module({
  imports: [AuthModule, AuthorizationModule, PrismaModule, FaceModule, UploadsModule],
  controllers: [AttendanceController, AttendancePlansController],
  providers: [
    AttendanceService,
    {
      provide: FACE_VERIFICATION_CONNECTOR,
      useFactory: (env: ApiEnv): FaceVerificationConnector =>
        env.FACE_DEV_STUB
          ? new StubFaceVerificationConnector(env.FACE_DEV_STUB_SCORE)
          : new FailClosedFaceVerificationConnector(),
      inject: [API_ENV]
    }
  ],
  exports: [AttendanceService]
})
export class AttendanceModule {}
