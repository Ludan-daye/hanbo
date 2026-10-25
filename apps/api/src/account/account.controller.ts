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

import { AccessTokenGuard } from "../auth/access-token.guard.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { UploadedMultipartFile } from "../uploads/uploads.types.js";
import { AccountService } from "./account.service.js";
import type { AccountProfile } from "./account.types.js";

const nicknameSchema = z.object({ nickname: z.string().trim().min(1).max(32) });

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
  async setNickname(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ): Promise<AccountProfile> {
    const parsed = nicknameSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException({ message: "ACCOUNT_NICKNAME_INVALID" });
    return this.accounts.setNickname(user.userId, parsed.data.nickname);
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
