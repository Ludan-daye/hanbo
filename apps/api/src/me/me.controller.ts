import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";

import { ReportsService } from "../reports/reports.service.js";
import type { DailyAttendanceReportParticipant } from "../reports/reports.types.js";
import { AccessTokenGuard } from "../auth/access-token.guard.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { EffectivePlan } from "../attendance/attendance-plans.js";
import { AttendanceService } from "../attendance/attendance.service.js";
import type {
  AttendanceRecordResponse,
  AttendanceTodayResponse,
} from "../attendance/attendance.types.js";
import type { MakeupRequestResponse } from "../makeup/makeup.types.js";

import { parseMyAttendanceRecordsQuery } from "./me-query.parsers.js";
import { MeService } from "./me.service.js";
import type { MyProjectMembership } from "./me.types.js";

@Controller("me")
export class MeController {
  constructor(
    @Inject(AttendanceService)
    private readonly attendanceService: AttendanceService,
    @Inject(ReportsService) private readonly reports: ReportsService,
    @Inject(MeService) private readonly meService: MeService,
  ) {}

  @Get("projects/:projectId/attendance-plan")
  @UseGuards(AccessTokenGuard)
  async plan(
    @CurrentUser() user: AuthenticatedUser,
    @Param("projectId") projectId: string,
    @Query("date") date: string,
  ): Promise<EffectivePlan> {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(new Date(date).getTime()) ||
      new Date(date).toISOString().slice(0, 10) !== date
    )
      throw new BadRequestException({ message: "INVALID_ATTENDANCE_DATE" });
    return this.attendanceService.getMyPlan(projectId, user.userId, date);
  }

  @Get("attendance-days")
  @UseGuards(AccessTokenGuard)
  async days(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: unknown,
  ): Promise<
    readonly (DailyAttendanceReportParticipant & {
      readonly attendanceDate: string;
    })[]
  > {
    const { from, to } = parseMyAttendanceRecordsQuery(query);
    return this.reports.personalDays(user.userId, from, to);
  }

  @Get("attendance-records")
  @UseGuards(AccessTokenGuard)
  async listMyAttendanceRecords(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: unknown,
  ): Promise<readonly AttendanceRecordResponse[]> {
    const { from, to } = parseMyAttendanceRecordsQuery(query);
    return this.meService.listMyAttendanceRecords(currentUser.userId, from, to);
  }

  @Get("makeups")
  @UseGuards(AccessTokenGuard)
  async listMyMakeups(
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<readonly MakeupRequestResponse[]> {
    return this.meService.listMyMakeups(currentUser.userId);
  }

  @Get("projects")
  @UseGuards(AccessTokenGuard)
  async listMyProjects(
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<readonly MyProjectMembership[]> {
    return this.meService.listMyProjects(currentUser.userId);
  }

  @Get("projects/:projectId/attendance-today")
  @UseGuards(AccessTokenGuard)
  async getMyAttendanceToday(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param("projectId") projectId: string,
  ): Promise<AttendanceTodayResponse> {
    return this.attendanceService.getAttendanceToday(
      projectId,
      currentUser.userId,
    );
  }
}
