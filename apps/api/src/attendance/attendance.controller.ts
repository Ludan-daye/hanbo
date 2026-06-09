import { Body, Controller, Inject, Param, Post, Put, UseGuards } from "@nestjs/common";

import { AccessTokenGuard } from "../auth/access-token.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { PermissionsGuard } from "../authorization/permissions.guard.js";
import { RequirePermission } from "../authorization/require-permission.decorator.js";

import {
  parseConfigureDefaultScheduleRequest,
  parseConfigureDefaultShiftRequest,
  parseSubmitAttendanceRecordRequest
} from "./attendance-body.parsers.js";
import { AttendanceService } from "./attendance.service.js";
import type { DefaultScheduleResponse, DefaultShiftResponse, SubmitAttendanceRecordResponse } from "./attendance.types.js";

@Controller("attendance")
export class AttendanceController {
  constructor(@Inject(AttendanceService) private readonly attendanceService: AttendanceService) {}

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
