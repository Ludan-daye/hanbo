import { Body, Controller, GoneException, Get, Header, Inject, Param, Post, Put, Query, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

import { AccessTokenGuard } from "../auth/access-token.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import type { IssuedFaceSession, IssuedVideoFaceSession, CompletedFaceSession } from "../face/face.types.js";
import type { UploadedMultipartFile } from "../uploads/uploads.types.js";
import { PermissionsGuard } from "../authorization/permissions.guard.js";
import { RequirePermission } from "../authorization/require-permission.decorator.js";

import {
  parseFaceVerificationPoint,
  parseSubmitAttendanceRecordRequest
} from "./attendance-body.parsers.js";
import { AttendanceService } from "./attendance.service.js";
import type { DefaultAttendanceConfiguration, DefaultScheduleResponse, DefaultShiftResponse, SubmitAttendanceRecordResponse } from "./attendance.types.js";

@Controller("attendance")
export class AttendanceController {
  constructor(@Inject(AttendanceService) private readonly attendanceService: AttendanceService) {}

  @Post("projects/:projectId/face-verifications/video")
  @UseGuards(AccessTokenGuard)
  async createVideoSession(@CurrentUser() user: AuthenticatedUser, @Param("projectId") projectId: string, @Body() body: unknown): Promise<IssuedVideoFaceSession> {
    return this.attendanceService.createVideoFaceSession(projectId, user.userId, parseFaceVerificationPoint(body));
  }

  @Post("projects/:projectId/face-verifications/:sessionId/video")
  @UseGuards(AccessTokenGuard)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 5 * 1024 * 1024 } }))
  async verifyVideo(@CurrentUser() user: AuthenticatedUser, @Param("projectId") projectId: string, @Param("sessionId") sessionId: string, @UploadedFile() file: UploadedMultipartFile | undefined, @Body() body: unknown): Promise<CompletedFaceSession> {
    return this.attendanceService.verifyVideoFaceSession(projectId, user.userId, parseFaceVerificationPoint(body), sessionId, file);
  }

  @Get("projects/:projectId/face-verifications/:sessionId/video-result")
  @Header("Cache-Control", "no-store")
  @UseGuards(AccessTokenGuard)
  async videoResult(@CurrentUser() user: AuthenticatedUser, @Param("projectId") projectId: string, @Param("sessionId") sessionId: string, @Query() query: unknown): Promise<CompletedFaceSession> {
    return this.attendanceService.videoFaceResult(projectId, user.userId, parseFaceVerificationPoint(query), sessionId);
  }

  @Post("projects/:projectId/face-verifications")
  @UseGuards(AccessTokenGuard)
  async createFaceSession(@CurrentUser() user: AuthenticatedUser, @Param("projectId") projectId: string, @Body() body: unknown): Promise<IssuedFaceSession> {
    return this.attendanceService.createNativeFaceSession(projectId, user.userId, parseFaceVerificationPoint(body));
  }

  @Post("projects/:projectId/face-verifications/:sessionId/complete")
  @UseGuards(AccessTokenGuard)
  async completeFaceSession(@CurrentUser() user: AuthenticatedUser, @Param("projectId") projectId: string, @Param("sessionId") sessionId: string, @Body() body: unknown): Promise<CompletedFaceSession> {
    return this.attendanceService.completeNativeFaceSession(projectId, user.userId, parseFaceVerificationPoint(body), sessionId);
  }

  @Get("projects/:projectId/default-configuration")
  @RequirePermission({ permissionCode: "project.manage", target: { paramName: "projectId", source: "projectParam" } })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async getDefaultConfiguration(@Param("projectId") projectId: string): Promise<DefaultAttendanceConfiguration> {
    return this.attendanceService.getDefaultConfiguration(projectId);
  }

  @Put("projects/:projectId/default-shift")
  @RequirePermission({
    permissionCode: "project.manage",
    target: {
      paramName: "projectId",
      source: "projectParam"
    }
  })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async configureDefaultShift(
    @Param("projectId") projectId: string,
    @Body() body: unknown
  ): Promise<DefaultShiftResponse> {
    throw new GoneException({ message: "旧排班写入接口已停用，请使用打卡安排并指定未来生效日期。" });
  }

  @Put("projects/:projectId/default-schedule")
  @RequirePermission({
    permissionCode: "project.manage",
    target: {
      paramName: "projectId",
      source: "projectParam"
    }
  })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async configureDefaultSchedule(
    @Param("projectId") projectId: string,
    @Body() body: unknown
  ): Promise<DefaultScheduleResponse> {
    throw new GoneException({ message: "旧排班写入接口已停用，请使用打卡安排并指定未来生效日期。" });
  }

  @Post("projects/:projectId/records")
  @UseGuards(AccessTokenGuard)
  async submitAttendanceRecord(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param("projectId") projectId: string,
    @Body() body: unknown
  ): Promise<SubmitAttendanceRecordResponse> {
    return this.attendanceService.submitAttendanceRecord(
      projectId,
      currentUser.userId,
      parseSubmitAttendanceRecordRequest(body)
    );
  }
}
