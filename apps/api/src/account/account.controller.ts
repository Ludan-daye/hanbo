import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { z } from "zod";

import { AllowIncompleteAccount } from "../auth/account-onboarding.js";
import { AccessTokenGuard } from "../auth/access-token.guard.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { UploadedMultipartFile } from "../uploads/uploads.types.js";
import { AccountService } from "./account.service.js";
import type { AccountProfile } from "./account.types.js";

const profileSchema = z.object({
  nickname: z.string().trim().min(1).max(32),
  realName: z
    .string()
    .trim()
    .min(1)
    .max(30)
    .regex(/^[\p{L}\p{M} ·•・.'’-]+$/u),
  phone: z
    .string()
    .trim()
    .regex(/^1[3-9]\d{9}$/),
});

@AllowIncompleteAccount()
@Controller("account")
@UseGuards(AccessTokenGuard)
export class AccountController {
  constructor(
    @Inject(AccountService) private readonly accounts: AccountService,
  ) {}

  @Get("profile")
  @Header("Cache-Control", "no-store")
  async getProfile(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AccountProfile> {
    return this.accounts.getProfile(user.userId);
  }

  @Put("profile")
  async setProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ): Promise<AccountProfile> {
    const parsed = profileSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException({ message: "ACCOUNT_PROFILE_INVALID" });
    return this.accounts.setProfile(user.userId, parsed.data);
  }

  @Post("avatar")
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: 2 * 1024 * 1024 } }),
  )
  async setAvatar(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: UploadedMultipartFile | undefined,
  ): Promise<AccountProfile> {
    return this.accounts.setAvatar(user.userId, file);
  }
}
