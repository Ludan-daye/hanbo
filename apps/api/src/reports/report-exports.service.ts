import { createHash } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
  type OnModuleDestroy,
} from "@nestjs/common";
import {
  authorizePermission,
  type AuthorizationTargetScope,
} from "@construction/domain/roles.js";
import type { ReportExport, ReportExportScope } from "@prisma/client";
import { AuthorizationContextService } from "../authorization/authorization-context.service.js";
import { PrismaService } from "../infrastructure/database/prisma.service.js";
import {
  STORAGE_PORT,
  type ReadableStoragePort,
} from "../infrastructure/storage/storage.types.js";
import { API_ENV } from "../config/env.module.js";
import type { ApiEnv } from "../config/env.js";
import { ReportsService } from "./reports.service.js";
import {
  createMonthlyWorkbook,
  REPORT_CALCULATION_VERSION,
  REPORT_CONTENT_TYPE,
} from "./report-workbook.js";

export type ExportScopeInput = {
  readonly scope: ReportExportScope;
  readonly scopeId: string;
  readonly month: string;
};
export type ExportView = {
  readonly id: string;
  readonly month: string;
  readonly version: number;
  readonly status: ReportExport["status"];
  readonly createdAt: string;
  readonly completedAt: string | null;
  readonly dataCutoffAt: string | null;
  readonly errorMessage: string | null;
  readonly fileName: string;
};
const fileName = (job: ReportExport): string =>
  `hanbo-${job.month.toISOString().slice(0, 7)}-v${job.version}-${job.id.slice(0, 8)}.xlsx`;
const view = (job: ReportExport): ExportView => ({
  id: job.id,
  month: job.month.toISOString().slice(0, 7),
  version: job.version,
  status: job.status,
  createdAt: job.createdAt.toISOString(),
  completedAt: job.completedAt?.toISOString() ?? null,
  dataCutoffAt:
    job.status === "COMPLETED" ? job.dataCutoffAt.toISOString() : null,
  errorMessage: job.errorMessage,
  fileName: fileName(job),
});
const jobInput = (job: ReportExport): ExportScopeInput => ({
  scope: job.scope,
  scopeId: job.teamId ?? job.projectId ?? job.companyId,
  month: job.month.toISOString().slice(0, 7),
});

@Injectable()
export class ReportExportsService implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private readonly logger = new Logger(ReportExportsService.name);
  constructor(
    @Inject(PrismaService) private readonly database: PrismaService,
    @Inject(ReportsService) private readonly reports: ReportsService,
    @Inject(AuthorizationContextService)
    private readonly authorization: AuthorizationContextService,
    @Inject(STORAGE_PORT) private readonly storage: ReadableStoragePort,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  onModuleInit(): void {
    if (this.env.NODE_ENV === "test") return;
    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = true;
      void this.processNext()
        .catch((error: unknown) =>
          this.logger.error({
            message: "REPORT_EXPORT_WORKER_FAILED",
            error: error instanceof Error ? error.message : String(error),
          }),
        )
        .finally(() => {
          this.running = false;
        });
    }, 2000);
    this.timer.unref();
  }
  onModuleDestroy(): void {
    if (this.timer !== null) clearInterval(this.timer);
  }
  private async target(
    userId: string,
    input: ExportScopeInput,
  ): Promise<AuthorizationTargetScope> {
    const source =
      input.scope === "TEAM"
        ? "teamParam"
        : input.scope === "PROJECT"
          ? "projectParam"
          : "companyParam";
    const scope = await this.authorization.resolveTargetScope(
      { source, paramName: "id" },
      { params: { id: input.scopeId } },
    );
    const data = await this.authorization.loadAuthorizationData(userId);
    const user = await this.database.user.findUnique({
      where: { id: userId },
      select: { status: true },
    });
    if (
      user?.status !== "ACTIVE" ||
      !authorizePermission({
        ...data,
        targetScope: scope,
        requiredPermissionCode: "attendance.view",
      }).isAuthorized
    )
      throw new ForbiddenException({
        message: "无权导出或下载此范围的考勤报表。",
        scope: input.scope,
        scopeId: input.scopeId,
      });
    return scope;
  }
  async create(userId: string, input: ExportScopeInput): Promise<ExportView> {
    if (
      input.month >
      new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 7)
    )
      throw new BadRequestException({
        message: "不能导出未来月份，请选择本月或历史月份。",
      });
    const target = await this.target(userId, input);
    if (target.scopeType === "GLOBAL")
      throw new BadRequestException({
        message: "请选择具体公司、项目或班组。",
      });
    const where = {
      scope: input.scope,
      companyId: target.companyId,
      projectId: target.scopeType === "COMPANY" ? null : target.projectId,
      teamId: target.scopeType === "TEAM" ? target.teamId : null,
      month: new Date(`${input.month}-01T00:00:00Z`),
    };
    const job = await this.database.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`report-user:${userId}`}, 0))`;
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`report:${input.scope}:${input.scopeId}:${input.month}`}, 0))`;
      const existing = await transaction.reportExport.findFirst({
        where: {
          ...where,
          requestedByUserId: userId,
          status: { in: ["PENDING", "PROCESSING"] },
        },
      });
      if (existing !== null) return existing;
      if (
        (await transaction.reportExport.count({
          where: {
            requestedByUserId: userId,
            status: { in: ["PENDING", "PROCESSING"] },
          },
        })) >= 3
      )
        throw new ConflictException({
          message: "已有 3 个导出任务正在处理，请完成后再试。",
        });
      const latest = await transaction.reportExport.findFirst({
        where,
        orderBy: { version: "desc" },
      });
      const created = await transaction.reportExport.create({
        data: {
          ...where,
          requestedByUserId: userId,
          version: (latest?.version ?? 0) + 1,
          calculationVersion: REPORT_CALCULATION_VERSION,
          dataCutoffAt: new Date(),
        },
      });
      await transaction.auditLog.create({
        data: {
          actorUserId: userId,
          action: "report.export.requested",
          entityType: "ReportExport",
          entityId: created.id,
          metadata: {
            scope: input.scope,
            scopeId: input.scopeId,
            month: input.month,
            version: created.version,
          },
        },
      });
      return created;
    });
    return view(job);
  }
  async list(
    userId: string,
    input: ExportScopeInput,
  ): Promise<readonly ExportView[]> {
    await this.target(userId, input);
    const scope =
      input.scope === "TEAM"
        ? { teamId: input.scopeId }
        : input.scope === "PROJECT"
          ? { projectId: input.scopeId }
          : { companyId: input.scopeId };
    return (
      await this.database.reportExport.findMany({
        where: {
          ...scope,
          scope: input.scope,
          requestedByUserId: userId,
          month: new Date(`${input.month}-01T00:00:00Z`),
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      })
    ).map(view);
  }
  private async owned(userId: string, id: string): Promise<ReportExport> {
    const job = await this.database.reportExport.findUnique({ where: { id } });
    if (job === null || job.requestedByUserId !== userId)
      throw new NotFoundException({ message: "导出任务不存在。", id });
    await this.target(userId, jobInput(job));
    return job;
  }
  async get(userId: string, id: string): Promise<ExportView> {
    return view(await this.owned(userId, id));
  }
  async download(
    userId: string,
    id: string,
  ): Promise<{ readonly bytes: Buffer; readonly name: string }> {
    const job = await this.owned(userId, id);
    if (job.status !== "COMPLETED" || job.fileId === null)
      throw new ConflictException({
        message: "报表尚未生成完成，请稍后查看任务状态。",
        id,
        status: job.status,
      });
    const file = await this.database.storedFile.findUnique({
      where: { id: job.fileId },
    });
    if (
      file === null ||
      file.deletedAt !== null ||
      (file.expiresAt !== null && file.expiresAt <= new Date())
    )
      throw new NotFoundException({
        message: "报表文件已失效，请重新生成。",
        id,
      });
    let bytes: Buffer;
    try {
      bytes = await this.storage.get(file.objectKey);
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        throw new NotFoundException({
          message: "报表文件已丢失，请重新生成。",
          id,
        });
      throw error;
    }
    if (createHash("sha256").update(bytes).digest("hex") !== file.hash)
      throw new ConflictException({
        message: "报表文件校验失败，请重新生成。",
        id,
      });
    await this.database.auditLog.create({
      data: {
        actorUserId: userId,
        action: "report.export.downloaded",
        entityType: "ReportExport",
        entityId: id,
        metadata: { version: job.version },
      },
    });
    return { bytes, name: fileName(job) };
  }
  /** Claim one durable job atomically; interrupted jobs expire and can be regenerated explicitly. */
  async processNext(): Promise<boolean> {
    await this.database.reportExport.updateMany({
      where: {
        status: "PROCESSING",
        startedAt: { lt: new Date(Date.now() - 15 * 60_000) },
      },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        errorCode: "EXPORT_INTERRUPTED",
        errorMessage: "任务中断或超时，请重新生成。",
      },
    });
    const claimed = await this.database.$queryRaw<
      readonly ReportExport[]
    >`UPDATE "report_exports" SET "status" = 'PROCESSING', "startedAt" = ${new Date()} WHERE "id" = (SELECT "id" FROM "report_exports" WHERE "status" = 'PENDING' ORDER BY "createdAt", "id" FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`;
    const job = claimed[0];
    if (job === undefined) return false;
    try {
      await this.target(job.requestedByUserId, jobInput(job));
      const projects = await this.database.project.findMany({
        where:
          job.projectId === null
            ? { companyId: job.companyId }
            : { id: job.projectId },
        select: { id: true, name: true },
      });
      const company = await this.database.company.findUniqueOrThrow({
        where: { id: job.companyId },
        select: { name: true },
      });
      const team =
        job.teamId === null
          ? null
          : await this.database.team.findUniqueOrThrow({
              where: { id: job.teamId },
              select: { name: true },
            });
      const scopeName = [
        company.name,
        ...projects.map((p) => p.name),
        ...(team === null ? [] : [team.name]),
      ].join(" / ");
      const snapshot = await this.reports.monthlySnapshot(
        projects.map((p) => p.id),
        job.teamId,
        jobInput(job).scopeId,
        job.month.toISOString().slice(0, 7),
      );
      const bytes = await createMonthlyWorkbook(job, scopeName, snapshot);
      const key = `reports/${job.companyId}/${job.id}.xlsx`;
      await this.storage.put(key, bytes, REPORT_CONTENT_TYPE);
      await this.database.$transaction(async (transaction) => {
        const file = await transaction.storedFile.create({
          data: {
            objectKey: key,
            uploaderUserId: job.requestedByUserId,
            contentType: REPORT_CONTENT_TYPE,
            sizeBytes: bytes.length,
            hash: createHash("sha256").update(bytes).digest("hex"),
          },
        });
        const updated = await transaction.reportExport.updateMany({
          where: { id: job.id, status: "PROCESSING", startedAt: job.startedAt },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
            dataCutoffAt: snapshot.cutoff,
            fileId: file.id,
          },
        });
        if (updated.count !== 1)
          throw new ConflictException({
            message: "EXPORT_JOB_NO_LONGER_ACTIVE",
            id: job.id,
          });
      });
      return true;
    } catch (error: unknown) {
      await this.database.reportExport.updateMany({
        where: { id: job.id, status: "PROCESSING", startedAt: job.startedAt },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          errorCode: "EXPORT_FAILED",
          errorMessage:
            "报表生成失败，请重试；持续失败请联系管理员并提供任务编号。",
        },
      });
      this.logger.error({
        message: "REPORT_EXPORT_FAILED",
        exportId: job.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
