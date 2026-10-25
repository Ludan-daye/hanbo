import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { API_ENV } from "../config/env.module.js";
import type { ApiEnv } from "../config/env.js";
import { LocalDiskStorage } from "../infrastructure/storage/local-disk-storage.js";
import { STORAGE_PORT, type StoragePort } from "../infrastructure/storage/storage.types.js";

import { UploadsController } from "./uploads.controller.js";
import { UploadsService } from "./uploads.service.js";

@Module({
  imports: [AuthModule],
  controllers: [UploadsController],
  exports: [UploadsService, STORAGE_PORT],
  providers: [
    UploadsService,
    {
      provide: STORAGE_PORT,
      useFactory: (env: ApiEnv): StoragePort => new LocalDiskStorage(env.UPLOADS_DIR),
      inject: [API_ENV]
    }
  ]
})
export class UploadsModule {}
