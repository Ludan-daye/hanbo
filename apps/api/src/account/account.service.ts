import { randomBytes } from "node:crypto";

import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { API_ENV } from "../config/env.module.js";
import type { ApiEnv } from "../config/env.js";
import { assertIdentityMatches } from "../auth/account-onboarding.js";
import {
  decryptPersonnelName,
  encryptPersonnelName,
} from "../management/personnel-name.js";
import { PrismaService } from "../infrastructure/database/prisma.service.js";
import {
  STORAGE_PORT,
  type ReadableStoragePort,
} from "../infrastructure/storage/storage.types.js";
import { imageContentType } from "../uploads/image-content-type.js";
import { UploadsService } from "../uploads/uploads.service.js";
import type { UploadedMultipartFile } from "../uploads/uploads.types.js";
import type { AccountProfile, AccountProfileInput } from "./account.types.js";

@Injectable()
export class AccountService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(UploadsService) private readonly uploads: UploadsService,
    @Inject(STORAGE_PORT) private readonly storage: ReadableStoragePort,
  ) {}

  async getProfile(userId: string): Promise<AccountProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        encryptedRealName: true,
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
      realName:
        user.encryptedRealName === null
          ? null
          : decryptPersonnelName(
              user.encryptedRealName,
              this.env.PERSONNEL_ENCRYPTION_KEY,
            ),
      phone: user.phone,
      nickname: user.nickname,
      avatarDataUrl,
      isBound: user.isBound,
      phoneMasked:
        user.phone === null
          ? null
          : user.phone.replace(/^(\d{3})\d+(\d{4})$/, "$1****$2"),
    };
  }

  async setProfile(
    userId: string,
    profile: AccountProfileInput,
  ): Promise<AccountProfile> {
    await this.prisma.$transaction(async (transaction): Promise<void> => {
      await transaction.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      const user = await transaction.user.findUnique({
        where: { id: userId },
        include: { workerProfile: true, managerProfile: true },
      });
      if (user === null)
        throw new NotFoundException({ message: "ACCOUNT_NOT_FOUND", userId });
      if (user.workerProfile !== null) {
        assertIdentityMatches(profile, {
          realName: decryptPersonnelName(
            user.workerProfile.encryptedName,
            this.env.PERSONNEL_ENCRYPTION_KEY,
          ),
          phone: user.workerProfile.phone,
        });
      }
      if (user.managerProfile !== null) {
        assertIdentityMatches(profile, {
          realName: user.managerProfile.name,
          phone: user.managerProfile.phone,
        });
      }
      await transaction.user.update({
        where: { id: userId },
        data: {
          nickname: profile.nickname,
          phone: profile.phone,
          encryptedRealName: encryptPersonnelName(
            profile.realName,
            this.env.PERSONNEL_ENCRYPTION_KEY,
            randomBytes(12),
          ),
        },
      });
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
    const upload = await this.uploads.storeImage(file, userId);
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
