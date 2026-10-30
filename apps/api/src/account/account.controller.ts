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
import type { WorkerRegistration } from "@construction/domain";

import { AllowIncompleteAccount } from "../auth/account-onboarding.js";
import { AccessTokenGuard } from "../auth/access-token.guard.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { UploadedMultipartFile } from "../uploads/uploads.types.js";
import { AccountService } from "./account.service.js";
import type { AccountProfile } from "./account.types.js";
import { WorkerRegistrationService } from "./worker-registration.service.js";

const workerRegistrationSchema = z
  .object({
    idNumber: z.string().max(18),
    residentialAddress: z.string().max(200),
    emergencyContactName: z.string().max(30),
    emergencyContactPhone: z.string().max(20),
    hasLongTermMedication: z.boolean(),
    medicationDetails: z.string().max(500),
    hasPersonalInsurance: z.boolean(),
    insuranceDetails: z.string().max(500),
    payrollBankCard: z.string().max(30),
  })
  .strict();

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
    @Inject(WorkerRegistrationService)
    private readonly registrations: WorkerRegistrationService,
  ) {}

  @Get("worker-registration")
  @Header("Cache-Control", "no-store")
  async getWorkerRegistration(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<WorkerRegistration> {
    return this.registrations.get(user.userId);
  }

  @Put("worker-registration")
  @Header("Cache-Control", "no-store")
  async setWorkerRegistration(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ): Promise<AccountProfile> {
    const parsed = workerRegistrationSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException({ message: "WORKER_REGISTRATION_INVALID" });
    await this.registrations.save(user.userId, parsed.data);
    return this.accounts.getProfile(user.userId);
  }

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
