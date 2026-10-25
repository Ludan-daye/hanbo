import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { PrismaService } from "../infrastructure/database/prisma.service.js";
import {
  STORAGE_PORT,
  type ReadableStoragePort,
} from "../infrastructure/storage/storage.types.js";
import { imageContentType } from "../uploads/image-content-type.js";
import { UploadsService } from "../uploads/uploads.service.js";
import type { UploadedMultipartFile } from "../uploads/uploads.types.js";
import type { AccountProfile } from "./account.types.js";

@Injectable()
export class AccountService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(UploadsService) private readonly uploads: UploadsService,
    @Inject(STORAGE_PORT) private readonly storage: ReadableStoragePort,
  ) {}

  async getProfile(userId: string): Promise<AccountProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        nickname: true,
        avatarObjectKey: true,
        avatarContentType: true,
        isBound: true,
        phone: true,
      },
    });
    if (user === null)
      throw new NotFoundException({ message: "ACCOUNT_NOT_FOUND", userId });
    if (user.avatarObjectKey !== null && user.avatarContentType === null) {
      throw new Error("Stored account avatar is missing its content type.");
    }
    const avatarDataUrl =
      user.avatarObjectKey === null
        ? null
        : `data:${user.avatarContentType};base64,${(await this.storage.get(user.avatarObjectKey)).toString("base64")}`;
    return {
      nickname: user.nickname,
      avatarDataUrl,
      isBound: user.isBound,
      phoneMasked:
        user.phone === null
          ? null
          : user.phone.replace(/^(\d{3})\d+(\d{4})$/, "$1****$2"),
    };
  }

  async setNickname(userId: string, nickname: string): Promise<AccountProfile> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { nickname },
    });
    return this.getProfile(userId);
  }

  async setAvatar(
    userId: string,
    file: UploadedMultipartFile | undefined,
  ): Promise<AccountProfile> {
    if (file === undefined || file.size === 0 || file.size > 2 * 1024 * 1024) {
      throw new BadRequestException({ message: "ACCOUNT_AVATAR_SIZE_INVALID" });
    }
    if (imageContentType(file.buffer) !== file.mimetype) {
      throw new BadRequestException({
        message: "ACCOUNT_AVATAR_IMAGE_INVALID",
      });
    }
    const upload = await this.uploads.storeImage(file);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        avatarObjectKey: upload.objectKey,
        avatarContentType: upload.contentType,
      },
    });
    return this.getProfile(userId);
  }
}
