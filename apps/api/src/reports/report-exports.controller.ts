import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { AccessTokenGuard } from "../auth/access-token.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { parseMonthlyReportMonth } from "./reports-query.parsers.js";
import {
  ReportExportsService,
  type ExportScopeInput,
  type ExportView,
} from "./report-exports.service.js";
import { REPORT_CONTENT_TYPE } from "./report-workbook.js";
const parseScope = (body: unknown): ExportScopeInput => {
  const result = z
    .object({
      scope: z.enum(["COMPANY", "PROJECT", "TEAM"]),
      scopeId: z.string().trim().min(1).max(150),
      month: z.string(),
    })
    .strict()
    .safeParse(body);
  if (!result.success)
    throw new BadRequestException({
      message: "请选择有效的导出范围和月份。",
      issues: result.error.issues,
    });
  return {
    ...result.data,
    month: parseMonthlyReportMonth({ month: result.data.month }),
  };
};
@Controller("report-exports")
@UseGuards(AccessTokenGuard)
export class ReportExportsController {
  constructor(
    @Inject(ReportExportsService)
    private readonly exports: ReportExportsService,
  ) {}
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ): Promise<ExportView> {
    return this.exports.create(user.userId, parseScope(body));
  }
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: unknown,
  ): Promise<readonly ExportView[]> {
    return this.exports.list(user.userId, parseScope(query));
  }
  @Get(":id")
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ): Promise<ExportView> {
    return this.exports.get(user.userId, id);
  }
  @Get(":id/file")
  @Header("Cache-Control", "private, no-store")
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ): Promise<StreamableFile> {
    const file = await this.exports.download(user.userId, id);
    return new StreamableFile(file.bytes, {
      type: REPORT_CONTENT_TYPE,
      disposition: `attachment; filename="${file.name}"`,
      length: file.bytes.length,
    });
  }
}
