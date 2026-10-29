import { createHash, randomUUID } from "node:crypto";

import { BadRequestException, Inject, Injectable } from "@nestjs/common";

import {
  STORAGE_PORT,
  type ReadableStoragePort,
} from "../infrastructure/storage/storage.types.js";

import { PrismaService } from "../infrastructure/database/prisma.service.js";
import { imageContentType } from "./image-content-type.js";
import type { UploadedMultipartFile, UploadResponse } from "./uploads.types.js";

const contentTypeExtensions: ReadonlyMap<string, string> = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
]);

@Injectable()
export class UploadsService {
  constructor(
    @Inject(STORAGE_PORT) private readonly storage: ReadableStoragePort,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async storeImage(
    file: UploadedMultipartFile | undefined,
    userId: string,
  ): Promise<UploadResponse> {
    if (file === undefined) {
      throw new BadRequestException({
        message: "UPLOAD_FILE_REQUIRED",
      });
    }

    const extension = contentTypeExtensions.get(file.mimetype);

    if (extension === undefined) {
      throw new BadRequestException({
        contentType: file.mimetype,
        message: "UPLOAD_CONTENT_TYPE_NOT_ALLOWED",
      });
    }

    if (imageContentType(file.buffer) !== file.mimetype)
      throw new BadRequestException({
        message: "UPLOAD_IMAGE_CONTENT_INVALID",
      });
    const hash = createHash("sha256").update(file.buffer).digest("hex");
    const objectKey = `uploads/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${extension}`;
    await this.storage.put(objectKey, file.buffer, file.mimetype);

    await this.prisma.storedFile.create({
      data: {
        objectKey,
        uploaderUserId: userId,
        contentType: file.mimetype,
        sizeBytes: file.size,
        hash,
      },
    });
    return {
      contentType: file.mimetype,
      hash,
      objectKey,
      sizeBytes: file.size,
    };
  }
  async requireOwnedImage(
    userId: string,
    objectKey: string,
    hash: string,
  ): Promise<void> {
    const file = await this.prisma.storedFile.findUnique({
      where: { objectKey },
    });
    if (
      file === null ||
      file.uploaderUserId !== userId ||
      file.hash !== hash ||
      file.deletedAt !== null ||
      (file.expiresAt !== null && file.expiresAt <= new Date()) ||
      !contentTypeExtensions.has(file.contentType)
    )
      throw new BadRequestException({
        message: "现场照片不存在、已失效或不属于当前账号，请重新拍摄上传。",
      });
    let bytes: Buffer;
    try {
      bytes = await this.storage.get(objectKey);
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        throw new BadRequestException({
          message: "现场照片文件已丢失，请重新拍摄上传。",
          objectKey,
        });
      throw error;
    }
    if (createHash("sha256").update(bytes).digest("hex") !== file.hash)
      throw new BadRequestException({
        message: "现场照片文件校验失败，请重新上传。",
      });
  }
}
