import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { AccessTokenGuard } from "../auth/access-token.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { PermissionsGuard } from "../authorization/permissions.guard.js";
import { RequirePermission } from "../authorization/require-permission.decorator.js";
import { PrismaService } from "../infrastructure/database/prisma.service.js";
import { parseDailyReportDate } from "./reports-query.parsers.js";
import { ProjectEvaluationsService } from "./project-evaluations.service.js";
import { ReportsService } from "./reports.service.js";
import type { ProjectEvaluation, ReportPersonDetail } from "./reports.types.js";

const range = (
  query: unknown,
): { readonly from: string; readonly to: string } => {
  const parsed = z
    .object({ from: z.string(), to: z.string() })
    .strict()
    .safeParse(query);
  if (!parsed.success)
    throw new BadRequestException({
      message: "请选择明细日期范围。",
      issues: parsed.error.issues,
    });
  const from = parseDailyReportDate({ date: parsed.data.from });
  const to = parseDailyReportDate({ date: parsed.data.to });
  if (to < from || Date.parse(to) - Date.parse(from) > 30 * 86400000)
    throw new BadRequestException({
      message: "单次明细查询范围须为 1–31 天。",
      from,
      to,
    });
  return { from, to };
};
@Controller("reports")
@UseGuards(AccessTokenGuard, PermissionsGuard)
export class ReportDetailsController {
  constructor(
    @Inject(ReportsService) private readonly reports: ReportsService,
    @Inject(ProjectEvaluationsService)
    private readonly evaluations: ProjectEvaluationsService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}
  @Get("projects/:projectId/members/:memberId")
  @RequirePermission({
    permissionCode: "attendance.view",
    target: { source: "projectParam", paramName: "projectId" },
  })
  async project(
    @CurrentUser() user: AuthenticatedUser,
    @Param("projectId") projectId: string,
    @Param("memberId") memberId: string,
    @Query() query: unknown,
  ): Promise<ReportPersonDetail> {
    const dates = range(query);
    const detail = await this.reports.personDetail(
      projectId,
      memberId,
      null,
      dates.from,
      dates.to,
    );
    return {
      ...detail,
      canEvaluate: await this.evaluations.canEvaluate(
        user.userId,
        projectId,
        memberId,
      ),
    };
  }
  @Get("teams/:teamId/members/:memberId")
  @RequirePermission({
    permissionCode: "attendance.view",
    target: { source: "teamParam", paramName: "teamId" },
  })
  async team(
    @CurrentUser() user: AuthenticatedUser,
    @Param("teamId") teamId: string,
    @Param("memberId") memberId: string,
    @Query() query: unknown,
  ): Promise<ReportPersonDetail> {
    const dates = range(query);
    const team = await this.prisma.team.findUniqueOrThrow({
      where: { id: teamId },
    });
    const detail = await this.reports.personDetail(
      team.projectId,
      memberId,
      teamId,
      dates.from,
      dates.to,
    );
    return {
      ...detail,
      canEvaluate: await this.evaluations.canEvaluate(
        user.userId,
        team.projectId,
        memberId,
      ),
    };
  }
  @Post("projects/:projectId/members/:memberId/evaluation")
  @RequirePermission({
    permissionCode: "project.manage",
    target: { source: "projectParam", paramName: "projectId" },
  })
  save(
    @CurrentUser() user: AuthenticatedUser,
    @Param("projectId") projectId: string,
    @Param("memberId") memberId: string,
    @Body() body: unknown,
  ): Promise<ProjectEvaluation> {
    const parsed = z
      .object({
        score: z.number().int().min(0).max(100),
        comment: z.string().trim().max(1000),
        expectedUpdatedAt: z.string().datetime().nullable(),
      })
      .strict()
      .safeParse(body);
    if (!parsed.success)
      throw new BadRequestException({
        message: "评分须为 0–100 的整数，评语不超过 1000 字。",
        issues: parsed.error.issues,
      });
    return this.evaluations.save(user.userId, projectId, memberId, parsed.data);
  }
}
