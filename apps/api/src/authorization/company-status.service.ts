import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import type { AuthorizationTargetScope, ScopedRoleAssignment } from "@construction/domain/roles.js";

import { PrismaService } from "../infrastructure/database/prisma.service.js";

import { AuthorizationContextService } from "./authorization-context.service.js";

/** The one status that makes a company read-only (system admin plan phase 3, Q5). */
export const COMPANY_SUSPENDED_STATUS = "SUSPENDED";

/** HTTP methods that change something. Everything else (GET, HEAD, OPTIONS) stays open. */
export const isWriteMethod = (method: string): boolean => ["DELETE", "PATCH", "POST", "PUT"].includes(method.toUpperCase());

/** SYSTEM_ADMIN on the GLOBAL scope is never held back by a suspended company. */
export const holdsPlatformRole = (assignments: readonly ScopedRoleAssignment[]): boolean =>
  assignments.some((assignment) => assignment.roleCode === "SYSTEM_ADMIN" && assignment.scope.scopeType === "GLOBAL");

/** The company a resolved target belongs to; null for the GLOBAL scope. */
export const targetCompanyId = (scope: AuthorizationTargetScope): string | null =>
  scope.scopeType === "GLOBAL" ? null : scope.companyId;

export const companySuspended = (companyId: string): ForbiddenException =>
  new ForbiddenException({ companyId, message: "COMPANY_SUSPENDED" });

/**
 * Suspended means read-only (Q5): the company's people can still sign in, look and export,
 * but nothing that writes may run against the company. The PermissionsGuard applies this to
 * every write with a company in its target; routes that check permissions in the service
 * call it themselves (the full list is in the plan's phase 3 record).
 *
 * A missing company or project is left to the caller, which already answers 404 for it.
 */
@Injectable()
export class CompanyStatusService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthorizationContextService) private readonly authorization: AuthorizationContextService,
  ) {}

  async isSuspended(companyId: string): Promise<boolean> {
    const company = await this.prisma.company.findUnique({ select: { status: true }, where: { id: companyId } });
    return company?.status === COMPANY_SUSPENDED_STATUS;
  }

  /**
   * Throws 403 COMPANY_SUSPENDED unless the company is active or the user is a platform
   * administrator. Pass the assignments when they are already loaded.
   */
  async assertCompanyActive(
    companyId: string,
    userId: string,
    assignments?: readonly ScopedRoleAssignment[],
  ): Promise<void> {
    if (!(await this.isSuspended(companyId))) return;
    const held = assignments ?? (await this.authorization.loadAuthorizationData(userId)).assignments;
    if (holdsPlatformRole(held)) return;
    throw companySuspended(companyId);
  }

  async assertProjectCompanyActive(projectId: string, userId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (project !== null) await this.assertCompanyActive(project.companyId, userId);
  }

  async assertTeamCompanyActive(teamId: string, userId: string): Promise<void> {
    const team = await this.prisma.team.findUnique({ include: { project: true }, where: { id: teamId } });
    if (team !== null) await this.assertCompanyActive(team.project.companyId, userId);
  }
}
