import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { UploadsModule } from "../uploads/uploads.module.js";
import { AccountController } from "./account.controller.js";
import { AccountService } from "./account.service.js";
import { WorkerRegistrationService } from "./worker-registration.service.js";

@Module({
  imports: [AuthModule, UploadsModule],
  controllers: [AccountController],
  providers: [AccountService, WorkerRegistrationService],
})
export class AccountModule {}
