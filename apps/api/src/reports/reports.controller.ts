import { Controller, Get, Inject, Param, Query, UseGuards } from "@nestjs/common";

import { AccessTokenGuard } from "../auth/access-token.guard.js";
import { PermissionsGuard } from "../authorization/permissions.guard.js";
import { RequirePermission } from "../authorization/require-permission.decorator.js";

import { parseDailyReportDate, parseMonthlyReportMonth, parseWeeklyReportStartDate } from "./reports-query.parsers.js";
import { ReportsService } from "./reports.service.js";
import type { DailyAttendanceReportResponse, RangeAttendanceReportResponse } from "./reports.types.js";

@Controller("reports")
export class ReportsController {
  constructor(@Inject(ReportsService) private readonly reportsService: ReportsService) {}

  @Get("projects/:projectId/daily")
  @RequirePermission({
    permissionCode: "attendance.view",
    target: {
      paramName: "projectId",
      source: "projectParam"
    }
  })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async getDailyReport(
    @Param("projectId") projectId: string,
    @Query() query: unknown
  ): Promise<DailyAttendanceReportResponse> {
    return this.reportsService.getDailyReport(projectId, parseDailyReportDate(query));
  }

  @Get("projects/:projectId/weekly")
  @RequirePermission({
    permissionCode: "attendance.view",
    target: {
      paramName: "projectId",
      source: "projectParam"
    }
  })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async getWeeklyReport(
    @Param("projectId") projectId: string,
    @Query() query: unknown
  ): Promise<RangeAttendanceReportResponse> {
    return this.reportsService.getWeeklyReport(projectId, parseWeeklyReportStartDate(query));
  }

  @Get("projects/:projectId/monthly")
  @RequirePermission({
    permissionCode: "attendance.view",
    target: {
      paramName: "projectId",
      source: "projectParam"
    }
  })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async getMonthlyReport(
    @Param("projectId") projectId: string,
    @Query() query: unknown
  ): Promise<RangeAttendanceReportResponse> {
    return this.reportsService.getMonthlyReport(projectId, parseMonthlyReportMonth(query));
  }

  @Get("teams/:teamId/daily")
  @RequirePermission({ permissionCode: "attendance.view", target: { paramName: "teamId", source: "teamParam" } })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async getTeamDailyReport(
    @Param("teamId") teamId: string,
    @Query() query: unknown
  ): Promise<DailyAttendanceReportResponse> {
    return this.reportsService.getTeamDailyReport(teamId, parseDailyReportDate(query));
  }

  @Get("teams/:teamId/weekly")
  @RequirePermission({ permissionCode: "attendance.view", target: { paramName: "teamId", source: "teamParam" } })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async getTeamWeeklyReport(
    @Param("teamId") teamId: string,
    @Query() query: unknown
  ): Promise<RangeAttendanceReportResponse> {
    return this.reportsService.getTeamWeeklyReport(teamId, parseWeeklyReportStartDate(query));
  }

  @Get("teams/:teamId/monthly")
  @RequirePermission({ permissionCode: "attendance.view", target: { paramName: "teamId", source: "teamParam" } })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async getTeamMonthlyReport(
    @Param("teamId") teamId: string,
    @Query() query: unknown
  ): Promise<RangeAttendanceReportResponse> {
    return this.reportsService.getTeamMonthlyReport(teamId, parseMonthlyReportMonth(query));
  }
}
