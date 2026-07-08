import { Controller, Get, Inject, Param, Query, UseGuards } from "@nestjs/common";

import { AccessTokenGuard } from "../auth/access-token.guard.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { AttendanceService } from "../attendance/attendance.service.js";
import type { AttendanceRecordResponse, AttendanceTodayResponse } from "../attendance/attendance.types.js";
import type { MakeupRequestResponse } from "../makeup/makeup.types.js";

import { parseMyAttendanceRecordsQuery } from "./me-query.parsers.js";
import { MeService } from "./me.service.js";
import type { MyProjectMembership } from "./me.types.js";

@Controller("me")
export class MeController {
  constructor(
    @Inject(AttendanceService) private readonly attendanceService: AttendanceService,
    @Inject(MeService) private readonly meService: MeService
  ) {}

  @Get("attendance-records")
  @UseGuards(AccessTokenGuard)
  async listMyAttendanceRecords(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: unknown
  ): Promise<readonly AttendanceRecordResponse[]> {
    const { from, to } = parseMyAttendanceRecordsQuery(query);
    return this.meService.listMyAttendanceRecords(currentUser.userId, from, to);
  }

  @Get("makeups")
  @UseGuards(AccessTokenGuard)
  async listMyMakeups(@CurrentUser() currentUser: AuthenticatedUser): Promise<readonly MakeupRequestResponse[]> {
    return this.meService.listMyMakeups(currentUser.userId);
  }

  @Get("projects")
  @UseGuards(AccessTokenGuard)
  async listMyProjects(@CurrentUser() currentUser: AuthenticatedUser): Promise<readonly MyProjectMembership[]> {
    return this.meService.listMyProjects(currentUser.userId);
  }

  @Get("projects/:projectId/attendance-today")
  @UseGuards(AccessTokenGuard)
  async getMyAttendanceToday(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param("projectId") projectId: string
  ): Promise<AttendanceTodayResponse> {
    return this.attendanceService.getAttendanceToday(projectId, currentUser.userId);
  }
}
