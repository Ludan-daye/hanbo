import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { z } from "zod";

import { AccessTokenGuard } from "../auth/access-token.guard.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { PermissionsGuard } from "../authorization/permissions.guard.js";
import { RequirePermission } from "../authorization/require-permission.decorator.js";
import type { UploadedMultipartFile } from "../uploads/uploads.types.js";

import { FaceService } from "./face.service.js";
import {
  FaceLivenessTestService,
  type FaceLivenessTestResult,
} from "./face-liveness-test.service.js";
import type { IssuedVideoFaceSession } from "./face.types.js";
import type { FaceProfileResponse, MyFaceResponse } from "./face.types.js";

const consentSchema = z.object({ consentVersion: z.string().min(1) });
const reviewSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  reason: z.string().trim().min(1).max(300),
});

@Controller("face-profiles")
export class FaceController {
  constructor(
    @Inject(FaceService) private readonly faces: FaceService,
    @Inject(FaceLivenessTestService)
    private readonly livenessTests: FaceLivenessTestService,
  ) {}

  @Post("me/liveness-tests")
  @UseGuards(AccessTokenGuard)
  async startLivenessTest(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<IssuedVideoFaceSession> {
    return this.livenessTests.start(user.userId);
  }

  @Get("me/liveness-tests/:sessionId")
  @Header("Cache-Control", "no-store")
  @UseGuards(AccessTokenGuard)
  async livenessTestResult(
    @CurrentUser() user: AuthenticatedUser,
    @Param("sessionId") sessionId: string,
  ): Promise<FaceLivenessTestResult> {
    return this.livenessTests.result(user.userId, sessionId);
  }

  @Post("me/liveness-tests/:sessionId/video")
  @UseGuards(AccessTokenGuard)
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  async verifyLivenessTest(
    @CurrentUser() user: AuthenticatedUser,
    @Param("sessionId") sessionId: string,
    @UploadedFile() file: UploadedMultipartFile | undefined,
  ): Promise<FaceLivenessTestResult> {
    return this.livenessTests.verify(user.userId, sessionId, file);
  }

  @Get("me")
  @Header("Cache-Control", "no-store")
  @UseGuards(AccessTokenGuard)
  async getMine(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MyFaceResponse> {
    return this.faces.getMine(user.userId);
  }

  @Post("me")
  @UseGuards(AccessTokenGuard)
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: 2 * 1024 * 1024 } }),
  )
  async enroll(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: UploadedMultipartFile | undefined,
    @Body() body: unknown,
  ): Promise<FaceProfileResponse> {
    const parsed = consentSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException({ message: "FACE_CONSENT_REQUIRED" });
    const data = parsed.data;
    return this.faces.enroll(user.userId, file, data.consentVersion);
  }

  @Get("projects/:projectId")
  @RequirePermission({
    permissionCode: "project.manage",
    target: { source: "projectParam", paramName: "projectId" },
  })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async list(
    @Param("projectId") projectId: string,
  ): Promise<readonly FaceProfileResponse[]> {
    return this.faces.listForProject(projectId);
  }

  @Get("projects/:projectId/:profileId/photo")
  @Header("Cache-Control", "no-store")
  @RequirePermission({
    permissionCode: "project.manage",
    target: { source: "projectParam", paramName: "projectId" },
  })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async photo(
    @Param("projectId") projectId: string,
    @Param("profileId") profileId: string,
  ): Promise<{ readonly dataUrl: string }> {
    return this.faces.getPhoto(projectId, profileId);
  }

  @Post("projects/:projectId/:profileId/review")
  @RequirePermission({
    permissionCode: "project.manage",
    target: { source: "projectParam", paramName: "projectId" },
  })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async review(
    @CurrentUser() user: AuthenticatedUser,
    @Param("projectId") projectId: string,
    @Param("profileId") profileId: string,
    @Body() body: unknown,
  ): Promise<FaceProfileResponse> {
    const parsed = reviewSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException({ message: "FACE_REVIEW_REASON_REQUIRED" });
    const data = parsed.data;
    return this.faces.review(
      projectId,
      profileId,
      user.userId,
      data.decision,
      data.reason,
    );
  }
}
