import { Controller, Get, Header, Inject, Param, Query, UseGuards } from "@nestjs/common";

import { AccessTokenGuard } from "../auth/access-token.guard.js";
import { PermissionsGuard } from "../authorization/permissions.guard.js";
import { RequirePermission } from "../authorization/require-permission.decorator.js";

import { parseAuditLogQuery } from "./audit-log.parsers.js";
import { AuditLogService } from "./audit-log.service.js";
import type { AuditLogPageResponse } from "./audit-log.types.js";

@Controller("management")
export class AuditLogController {
  constructor(@Inject(AuditLogService) private readonly audit: AuditLogService) {}

  @Get("projects/:projectId/audit-logs")
  @Header("Cache-Control", "no-store")
  @RequirePermission({ permissionCode: "project.manage", target: { paramName: "projectId", source: "projectParam" } })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async projectLog(
    @Param("projectId") projectId: string,
    @Query() query: unknown,
  ): Promise<AuditLogPageResponse> {
    return this.audit.projectLog(projectId, parseAuditLogQuery(query));
  }

  @Get("companies/:companyId/audit-logs")
  @Header("Cache-Control", "no-store")
  @RequirePermission({ permissionCode: "company.manage", target: { paramName: "companyId", source: "companyParam" } })
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  async companyLog(
    @Param("companyId") companyId: string,
    @Query() query: unknown,
  ): Promise<AuditLogPageResponse> {
    return this.audit.companyLog(companyId, parseAuditLogQuery(query));
  }
}
