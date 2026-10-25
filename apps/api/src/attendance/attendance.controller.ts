import { Body, Controller, Get, Header, Inject, Param, Post, Put, Query, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

import { AccessTokenGuard } from "../auth/access-token.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import type { IssuedFaceSession, IssuedVideoFaceSession, CompletedFaceSession } from "../face/face.types.js";
import type { UploadedMultipartFile } from "../uploads/uploads.types.js";
import { PermissionsGuard } from "../authorization/permissions.guard.js";
import { RequirePermission } from "../authorization/require-permission.decorator.js";

import {
  parseConfigureDefaultScheduleRequest,
  parseConfigureDefaultShiftRequest,
  parseFaceVerificationPoint,
  parseSubmitAttendanceRecordRequest
} from "./attendance-body.parsers.js";
import { AttendanceService } from "./attendance.service.js";
import type { DefaultAttendanceConfiguration, DefaultScheduleResponse, DefaultShiftResponse, SubmitAttendanceRecordResponse } from "./attendance.types.js";

@Controller("attendance")
export class AttendanceController {
  constructor(@Inject(AttendanceService) private readonly attendanceService: AttendanceService) {}

  @Post("projects/:projectId/face-verifications/video")
  @RequirePermission({ permissionCode: "attendance.submit", target: { paramName: "projectId", source: "projectParam" } })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async createVideoSession(@CurrentUser() user: AuthenticatedUser, @Param("projectId") projectId: string, @Body() body: unknown): Promise<IssuedVideoFaceSession> {
    return this.attendanceService.createVideoFaceSession(projectId, user.userId, parseFaceVerificationPoint(body));
  }

  @Post("projects/:projectId/face-verifications/:sessionId/video")
  @RequirePermission({ permissionCode: "attendance.submit", target: { paramName: "projectId", source: "projectParam" } })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 5 * 1024 * 1024 } }))
  async verifyVideo(@CurrentUser() user: AuthenticatedUser, @Param("projectId") projectId: string, @Param("sessionId") sessionId: string, @UploadedFile() file: UploadedMultipartFile | undefined, @Body() body: unknown): Promise<CompletedFaceSession> {
    return this.attendanceService.verifyVideoFaceSession(projectId, user.userId, parseFaceVerificationPoint(body), sessionId, file);
  }

  @Get("projects/:projectId/face-verifications/:sessionId/video-result")
  @Header("Cache-Control", "no-store")
  @RequirePermission({ permissionCode: "attendance.submit", target: { paramName: "projectId", source: "projectParam" } })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async videoResult(@CurrentUser() user: AuthenticatedUser, @Param("projectId") projectId: string, @Param("sessionId") sessionId: string, @Query() query: unknown): Promise<CompletedFaceSession> {
    return this.attendanceService.videoFaceResult(projectId, user.userId, parseFaceVerificationPoint(query), sessionId);
  }

  @Post("projects/:projectId/face-verifications")
  @RequirePermission({ permissionCode: "attendance.submit", target: { paramName: "projectId", source: "projectParam" } })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async createFaceSession(@CurrentUser() user: AuthenticatedUser, @Param("projectId") projectId: string, @Body() body: unknown): Promise<IssuedFaceSession> {
    return this.attendanceService.createNativeFaceSession(projectId, user.userId, parseFaceVerificationPoint(body));
  }

  @Post("projects/:projectId/face-verifications/:sessionId/complete")
  @RequirePermission({ permissionCode: "attendance.submit", target: { paramName: "projectId", source: "projectParam" } })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
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
    return this.attendanceService.configureDefaultShift(projectId, parseConfigureDefaultShiftRequest(body));
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
    return this.attendanceService.configureDefaultSchedule(projectId, parseConfigureDefaultScheduleRequest(body));
  }

  @Post("projects/:projectId/records")
  @RequirePermission({
    permissionCode: "attendance.submit",
    target: {
      paramName: "projectId",
      source: "projectParam"
    }
  })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
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
