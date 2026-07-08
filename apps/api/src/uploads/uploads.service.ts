import { createHash, randomUUID } from "node:crypto";

import { BadRequestException, Inject, Injectable } from "@nestjs/common";

import { STORAGE_PORT, type StoragePort } from "../infrastructure/storage/storage.types.js";

import type { UploadedMultipartFile, UploadResponse } from "./uploads.types.js";

const contentTypeExtensions: ReadonlyMap<string, string> = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"]
]);

@Injectable()
export class UploadsService {
  constructor(@Inject(STORAGE_PORT) private readonly storage: StoragePort) {}

  async storeImage(file: UploadedMultipartFile | undefined): Promise<UploadResponse> {
    if (file === undefined) {
      throw new BadRequestException({
        message: "UPLOAD_FILE_REQUIRED"
      });
    }

    const extension = contentTypeExtensions.get(file.mimetype);

    if (extension === undefined) {
      throw new BadRequestException({
        contentType: file.mimetype,
        message: "UPLOAD_CONTENT_TYPE_NOT_ALLOWED"
      });
    }

    const hash = createHash("sha256").update(file.buffer).digest("hex");
    const objectKey = `uploads/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${extension}`;
    await this.storage.put(objectKey, file.buffer, file.mimetype);

    return {
      contentType: file.mimetype,
      hash,
      objectKey,
      sizeBytes: file.size
    };
  }
}
