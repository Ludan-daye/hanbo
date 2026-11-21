import { Inject, Injectable } from "@nestjs/common";

import { PrismaService } from "../infrastructure/database/prisma.service.js";
import { MakeupService } from "../makeup/makeup.service.js";
import { ReportsService } from "../reports/reports.service.js";

import type { ProjectOverviewResponse } from "./project-overview.types.js";
import { overviewAttendance as headcount } from "./overview-attendance.js";

@Injectable()
export class ProjectOverviewService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ReportsService) private readonly reports: ReportsService,
    @Inject(MakeupService) private readonly makeups: MakeupService,
  ) {}

  /**
   * Each number equals the rows of the list it opens: the daily report's totals,
   * the makeup inbox filtered to this project, the safety-review tabs and the
   * pending tab of face review.
   */
  async overview(
    userId: string,
    projectId: string,
    date: string,
  ): Promise<ProjectOverviewResponse> {
    const [daily, makeupPending, violationPending, appealPending, facePending] =
      await Promise.all([
        this.reports.getDailyReport(projectId, date),
        this.makeups.countPendingForProject(userId, projectId),
        this.prisma.safetyViolation.count({
          where: { projectId, status: "PENDING" },
        }),
        this.prisma.safetyViolation.count({
          where: { projectId, appeals: { some: { status: "PENDING" } } },
        }),
        this.pendingFaces(projectId),
      ]);
    return {
      attendance: {
        ...headcount(daily.participants),
        workedMinutes: daily.totals.workedMinutes,
      },
      date,
      projectId,
      todos: { appealPending, facePending, makeupPending, violationPending },
    };
  }

  /** Same owners as FaceService.listForProject: active worker and manager members. */
  private async pendingFaces(projectId: string): Promise<number> {
    const [workers, managers] = await Promise.all([
      this.prisma.projectWorkerMember.findMany({
        where: { projectId, status: "ACTIVE" },
        select: { workerId: true },
      }),
      this.prisma.projectManagerMember.findMany({
        where: { projectId, status: "ACTIVE" },
        select: { managerId: true },
      }),
    ]);
    if (workers.length === 0 && managers.length === 0) return 0;
    return this.prisma.faceProfile.count({
      where: {
        status: "PENDING",
        OR: [
          {
            ownerType: "WORKER",
            ownerId: { in: workers.map((row) => row.workerId) },
          },
          {
            ownerType: "MANAGER",
            ownerId: { in: managers.map((row) => row.managerId) },
          },
        ],
      },
    });
  }
}
