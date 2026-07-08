import { Controller, Inject, Post, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

import { AccessTokenGuard } from "../auth/access-token.guard.js";

import { UploadsService } from "./uploads.service.js";
import type { UploadedMultipartFile, UploadResponse } from "./uploads.types.js";

export const maxUploadSizeBytes = 5 * 1024 * 1024;

@Controller("uploads")
export class UploadsController {
  constructor(@Inject(UploadsService) private readonly uploadsService: UploadsService) {}

  @Post()
  @UseGuards(AccessTokenGuard)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: maxUploadSizeBytes } }))
  async upload(@UploadedFile() file: UploadedMultipartFile | undefined): Promise<UploadResponse> {
    return this.uploadsService.storeImage(file);
  }
}
