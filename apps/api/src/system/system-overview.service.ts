import { Inject, Injectable } from "@nestjs/common";

import { PrismaService } from "../infrastructure/database/prisma.service.js";
import { MakeupService } from "../makeup/makeup.service.js";

import { companyAdminFilter } from "./system-companies.service.js";
import type { SystemOverview } from "./system.types.js";

/**
 * The platform home (system admin plan phase 5, Q10): how big the platform is and what waits
 * for this super administrator. No attendance and no reports across companies: those are
 * read inside a company. Each todo counts exactly what its list shows.
 */
@Injectable()
export class SystemOverviewService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MakeupService) private readonly makeups: MakeupService,
  ) {}

  async overview(userId: string): Promise<SystemOverview> {
    const [companies, activeProjects, accounts, withoutAdmin, pendingInvitations, makeupOnlyYou] = await Promise.all([
      this.prisma.company.groupBy({ by: ["status"], _count: { _all: true } }),
      this.prisma.project.count({ where: { status: "ACTIVE" } }),
      // Only bound accounts, as the account list shows them.
      this.prisma.user.groupBy({ by: ["status"], where: { isBound: true }, _count: { _all: true } }),
      this.prisma.company.count({ where: { ...companyAdminFilter("NONE"), status: "ACTIVE" } }),
      this.prisma.companyManagerMember.count({
        where: { company: { status: "ACTIVE" }, managerProfile: { userId: null }, status: "ACTIVE" },
      }),
      this.makeups.countPendingOnlyYou(userId),
    ]);
    const companyCount = (status: string): number => companies.find((row) => row.status === status)?._count._all ?? 0;
    const accountCount = (status: string): number => accounts.find((row) => row.status === status)?._count._all ?? 0;
    return {
      accounts: { active: accountCount("ACTIVE"), disabled: accountCount("DISABLED") },
      companies: { active: companyCount("ACTIVE"), suspended: companyCount("SUSPENDED") },
      projects: { active: activeProjects },
      todos: {
        companiesWithoutAdmin: withoutAdmin,
        makeupOnlyYou,
        pendingAdminInvitations: pendingInvitations,
      },
    };
  }
}
