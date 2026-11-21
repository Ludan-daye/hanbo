import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import { PrismaService } from "../infrastructure/database/prisma.service.js";
import { MakeupService } from "../makeup/makeup.service.js";
import { ReportsService } from "../reports/reports.service.js";

import type { CompanyOverviewResponse } from "./company-overview.types.js";

@Injectable()
export class CompanyOverviewService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ReportsService) private readonly reports: ReportsService,
    @Inject(MakeupService) private readonly makeups: MakeupService,
  ) {}

  /**
   * Each number equals the rows of the list it opens: the company daily report split
   * by project, the company makeup inbox (all / onlyMine), pending transfer requests,
   * and per project the first-review violations and pending baseline photos.
   */
  async overview(
    userId: string,
    companyId: string,
    date: string,
  ): Promise<CompanyOverviewResponse> {
    const projects = await this.prisma.project.findMany({
      where: { companyId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, name: true, status: true },
    });
    if (projects.length === 0 && (await this.prisma.company.count({ where: { id: companyId } })) === 0)
      throw new NotFoundException({ message: "COMPANY_NOT_FOUND", companyId });
    const projectIds = projects.map((project) => project.id);
    const [daily, makeups, transferPending, violations, faces] =
      await Promise.all([
        this.reports.getCompanyDailyTotalsByProject(companyId, date),
        this.makeups.countPendingForCompany(userId, companyId),
        this.prisma.personnelTransferRequest.count({
          where: { companyId, status: "PENDING" },
        }),
        this.prisma.safetyViolation.groupBy({
          by: ["projectId"],
          where: { projectId: { in: projectIds }, status: "PENDING" },
          _count: { _all: true },
        }),
        this.pendingFacesByProject(projectIds),
      ]);
    return {
      attendance: {
        expected: daily.totals.scheduledDays,
        missing: daily.totals.missingPunchCount,
        present: daily.totals.actualAttendedDays,
        workedMinutes: daily.totals.workedMinutes,
      },
      companyId,
      date,
      projects: projects.map((project) => {
        const totals = daily.byProject.get(project.id);
        return {
          attendance: {
            expected: totals?.scheduledDays ?? 0,
            missing: totals?.missingPunchCount ?? 0,
            present: totals?.actualAttendedDays ?? 0,
          },
          name: project.name,
          projectId: project.id,
          status: project.status,
          todos: {
            facePending: faces.get(project.id) ?? 0,
            violationPending:
              violations.find((row) => row.projectId === project.id)?._count
                ._all ?? 0,
          },
        };
      }),
      todos: {
        makeupOnlyYou: makeups.onlyYou,
        makeupPending: makeups.all,
        transferPending,
      },
    };
  }

  /** Same owners as the project overview: active worker and manager members, per project. */
  private async pendingFacesByProject(
    projectIds: readonly string[],
  ): Promise<ReadonlyMap<string, number>> {
    const counts = new Map<string, number>();
    if (projectIds.length === 0) return counts;
    const [workers, managers] = await Promise.all([
      this.prisma.projectWorkerMember.findMany({
        where: { projectId: { in: [...projectIds] }, status: "ACTIVE" },
        select: { projectId: true, workerId: true },
      }),
      this.prisma.projectManagerMember.findMany({
        where: { projectId: { in: [...projectIds] }, status: "ACTIVE" },
        select: { managerId: true, projectId: true },
      }),
    ]);
    if (workers.length === 0 && managers.length === 0) return counts;
    const pending = await this.prisma.faceProfile.findMany({
      where: {
        status: "PENDING",
        OR: [
          {
            ownerType: "WORKER",
            ownerId: { in: [...new Set(workers.map((row) => row.workerId))] },
          },
          {
            ownerType: "MANAGER",
            ownerId: { in: [...new Set(managers.map((row) => row.managerId))] },
          },
        ],
      },
      select: { ownerId: true, ownerType: true },
    });
    const owners = new Set(
      pending.map((row) => `${row.ownerType}:${row.ownerId}`),
    );
    const seen = new Set<string>();
    const add = (projectId: string, owner: string): void => {
      // One per person and project, like the face-review pending tab.
      if (!owners.has(owner) || seen.has(`${projectId}|${owner}`)) return;
      seen.add(`${projectId}|${owner}`);
      counts.set(projectId, (counts.get(projectId) ?? 0) + 1);
    };
    for (const row of workers) add(row.projectId, `WORKER:${row.workerId}`);
    for (const row of managers) add(row.projectId, `MANAGER:${row.managerId}`);
    return counts;
  }
}
