import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { GLOBAL_SCOPE_ID, ROLE_LEVEL, getHighestRoleCode } from "@construction/domain/roles.js";

import { API_ENV } from "../config/env.module.js";
import type { ApiEnv } from "../config/env.js";
import { PrismaService } from "../infrastructure/database/prisma.service.js";
import { decryptPersonnelName, personnelSearchHash } from "../management/personnel-name.js";

import type {
  SystemAccountDetail,
  SystemAccountPage,
  SystemAccountQuery,
  SystemAccountRole,
  SystemAccountRoleSource,
  SystemAccountRow,
} from "./system.types.js";

const PAGE = 30;

const systemAdminRole = { role: { code: "SYSTEM_ADMIN" }, scopeId: GLOBAL_SCOPE_ID, scopeType: "GLOBAL" } as const;

const accountInclude = {
  managerProfile: { select: { id: true, name: true, phone: true } },
  roles: { include: { role: { select: { code: true } } } },
  workerProfile: { select: { encryptedName: true, id: true, phone: true } },
} satisfies Prisma.UserInclude;

type Account = Prisma.UserGetPayload<{ include: typeof accountInclude }>;

const SOURCES: Readonly<Record<SystemAccountRole["scopeType"], SystemAccountRoleSource>> = {
  COMPANY: "COMPANY_APPOINTMENT",
  GLOBAL: "PLATFORM",
  PROJECT: "PROJECT_MEMBERSHIP",
  TEAM: "PROJECT_MEMBERSHIP",
};

/**
 * Accounts for the platform (system admin plan phase 2, Q4, Q6). Only bound accounts are
 * listed: an unbound one cannot use anything. Roles are shown, not changed, here; disabling
 * signs the person out at once (sessionVersion and every session) and leaves memberships,
 * attendance and makeups as they are.
 */
@Injectable()
export class SystemAccountsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  async list(query: SystemAccountQuery): Promise<SystemAccountPage> {
    const search = query.search;
    const rows = await this.prisma.user.findMany({
      where: {
        isBound: true,
        ...(query.status === null ? {} : { status: query.status }),
        ...(query.role === null ? {} : { roles: { some: { role: { code: query.role } } } }),
        ...(search.length === 0 ? {} : { OR: this.searchFilters(search) }),
      },
      include: accountInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PAGE + 1,
      ...(query.cursor === null ? {} : { cursor: { id: query.cursor }, skip: 1 }),
    });
    const page = rows.slice(0, PAGE);
    return {
      items: page.map((account) => this.row(account)),
      nextCursor: rows.length > PAGE ? page[PAGE - 1]!.id : null,
    };
  }

  async detail(userId: string): Promise<SystemAccountDetail> {
    const account = await this.account(userId);
    const assignments = [...account.roles].sort(
      (a, b) => ROLE_LEVEL[b.role.code] - ROLE_LEVEL[a.role.code] || a.createdAt.getTime() - b.createdAt.getTime(),
    );
    const idsFor = (scopeType: SystemAccountRole["scopeType"]): string[] =>
      assignments.filter((row) => row.scopeType === scopeType).map((row) => row.scopeId);
    const [companies, projects, teams, activeSessionCount] = await Promise.all([
      this.prisma.company.findMany({ where: { id: { in: idsFor("COMPANY") } }, select: { id: true, name: true } }),
      this.prisma.project.findMany({ where: { id: { in: idsFor("PROJECT") } }, select: { companyId: true, id: true, name: true } }),
      this.prisma.team.findMany({
        where: { id: { in: idsFor("TEAM") } },
        select: { id: true, name: true, project: { select: { companyId: true, id: true, name: true } } },
      }),
      this.prisma.userSession.count({ where: { expiresAt: { gt: new Date() }, revokedAt: null, userId } }),
    ]);
    const projectIds = [...new Set([...projects.map((row) => row.id), ...teams.map((row) => row.project.id)])];
    const members = await this.memberships(account, projectIds);
    const roles = assignments.map((assignment): SystemAccountRole => {
      const base = { roleCode: assignment.role.code, scopeId: assignment.scopeId, scopeType: assignment.scopeType, source: SOURCES[assignment.scopeType] };
      switch (assignment.scopeType) {
        case "GLOBAL":
          return { ...base, companyId: null, memberId: null, projectId: null, scopeName: "全平台" };
        case "COMPANY":
          return {
            ...base,
            companyId: assignment.scopeId,
            memberId: null,
            projectId: null,
            scopeName: companies.find((row) => row.id === assignment.scopeId)?.name ?? "已删除的公司",
          };
        case "PROJECT": {
          const project = projects.find((row) => row.id === assignment.scopeId);
          return {
            ...base,
            companyId: project?.companyId ?? null,
            memberId: members.get(assignment.scopeId) ?? null,
            projectId: project?.id ?? null,
            scopeName: project?.name ?? "已删除的项目",
          };
        }
        case "TEAM": {
          const team = teams.find((row) => row.id === assignment.scopeId);
          return {
            ...base,
            companyId: team?.project.companyId ?? null,
            memberId: team === undefined ? null : (members.get(team.project.id) ?? null),
            projectId: team?.project.id ?? null,
            scopeName: team === undefined ? "已删除的班组" : `${team.project.name} / ${team.name}`,
          };
        }
      }
    });
    return {
      ...this.row(account),
      activeSessionCount,
      createdAt: account.createdAt.toISOString(),
      isSystemAdmin: account.roles.some((row) => row.role.code === "SYSTEM_ADMIN" && row.scopeType === "GLOBAL"),
      profileId: account.managerProfile?.id ?? account.workerProfile?.id ?? null,
      roles,
    };
  }

  /**
   * Q4: signs the person out at once. Not oneself, not a super administrator (those are
   * managed by the server command); the update re-checks both, so a race changes nothing.
   */
  async disable(actorUserId: string, userId: string): Promise<SystemAccountDetail> {
    if (actorUserId === userId) throw new ForbiddenException({ message: "CANNOT_DISABLE_SELF", userId });
    const account = await this.account(userId);
    this.assertNotSystemAdmin(account);
    await this.prisma.$transaction(async (transaction): Promise<void> => {
      const result = await transaction.user.updateMany({
        where: { id: userId, isBound: true, roles: { none: systemAdminRole }, status: "ACTIVE" },
        data: { sessionVersion: { increment: 1 }, status: "DISABLED" },
      });
      if (result.count !== 1) throw new ConflictException({ message: "ACCOUNT_STATUS_CHANGED_RELOAD", userId });
      const sessions = await transaction.userSession.updateMany({
        where: { revokedAt: null, userId },
        data: { revokedAt: new Date() },
      });
      await transaction.auditLog.create({
        data: {
          action: "ACCOUNT_DISABLED",
          actorUserId,
          entityId: userId,
          entityType: "user",
          metadata: { ...this.profileMetadata(account), revokedSessions: sessions.count, userId },
        },
      });
    });
    return this.detail(userId);
  }

  /** The person signs in again as usual; roles and memberships were never touched. */
  async enable(actorUserId: string, userId: string): Promise<SystemAccountDetail> {
    const account = await this.account(userId);
    this.assertNotSystemAdmin(account);
    await this.prisma.$transaction(async (transaction): Promise<void> => {
      const result = await transaction.user.updateMany({
        where: { id: userId, isBound: true, roles: { none: systemAdminRole }, status: "DISABLED" },
        data: { status: "ACTIVE" },
      });
      if (result.count !== 1) throw new ConflictException({ message: "ACCOUNT_STATUS_CHANGED_RELOAD", userId });
      await transaction.auditLog.create({
        data: {
          action: "ACCOUNT_ENABLED",
          actorUserId,
          entityId: userId,
          entityType: "user",
          metadata: { ...this.profileMetadata(account), userId },
        },
      });
    });
    return this.detail(userId);
  }

  private row(account: Account): SystemAccountRow {
    return {
      displayName: this.displayName(account),
      highestRoleCode: getHighestRoleCode(account.roles.map((row) => ({ roleCode: row.role.code }))),
      lastLoginAt: account.lastLoginAt?.toISOString() ?? null,
      phone: account.managerProfile?.phone ?? account.workerProfile?.phone ?? account.phone,
      profileType: account.managerProfile !== null ? "MANAGER" : account.workerProfile !== null ? "WORKER" : null,
      roleCount: account.roles.length,
      status: account.status,
      userId: account.id,
    };
  }

  private async account(userId: string): Promise<Account> {
    const account = await this.prisma.user.findUnique({ where: { id: userId }, include: accountInclude });
    if (account === null || !account.isBound) throw new NotFoundException({ message: "ACCOUNT_NOT_FOUND", userId });
    return account;
  }

  private assertNotSystemAdmin(account: Account): void {
    if (account.roles.some((row) => row.role.code === "SYSTEM_ADMIN" && row.scopeType === "GLOBAL"))
      throw new ForbiddenException({ message: "SYSTEM_ADMIN_MANAGED_BY_SCRIPT", userId: account.id });
  }

  /** The audit sentence names the person through their profile. */
  private profileMetadata(account: Account): Record<string, string> {
    if (account.managerProfile !== null) return { participantType: "MANAGER", profileId: account.managerProfile.id };
    if (account.workerProfile !== null) return { participantType: "WORKER", profileId: account.workerProfile.id };
    return {};
  }

  /** Project id → the account's membership there (one per project and profile). */
  private async memberships(account: Account, projectIds: readonly string[]): Promise<Map<string, string>> {
    const members = new Map<string, string>();
    if (projectIds.length === 0) return members;
    const rows =
      account.managerProfile !== null
        ? await this.prisma.projectManagerMember.findMany({
            where: { managerId: account.managerProfile.id, projectId: { in: [...projectIds] } },
            select: { id: true, projectId: true, status: true },
          })
        : account.workerProfile !== null
          ? await this.prisma.projectWorkerMember.findMany({
              where: { projectId: { in: [...projectIds] }, workerId: account.workerProfile.id },
              select: { id: true, projectId: true, status: true },
            })
          : [];
    // An active membership wins over an exited one in the same project.
    for (const row of [...rows].sort((a, b) => Number(a.status === "ACTIVE") - Number(b.status === "ACTIVE")))
      members.set(row.projectId, row.id);
    return members;
  }

  private searchFilters(search: string): Prisma.UserWhereInput[] {
    const filters: Prisma.UserWhereInput[] = [
      { phone: { contains: search } },
      { managerProfile: { name: { contains: search, mode: "insensitive" } } },
      { managerProfile: { phone: { contains: search } } },
      { workerProfile: { phone: { contains: search } } },
    ];
    // Worker names are encrypted; their prefixes are searchable through keyed hashes.
    if (this.keyConfigured())
      filters.push({ workerProfile: { nameSearchHashes: { has: personnelSearchHash(search, this.env.PERSONNEL_ENCRYPTION_KEY) } } });
    return filters;
  }

  private keyConfigured(): boolean {
    return /^[a-fA-F0-9]{64}$/.test(this.env.PERSONNEL_ENCRYPTION_KEY);
  }

  private decrypt(encrypted: string | null | undefined): string | null {
    if (encrypted === null || encrypted === undefined || !encrypted.startsWith("name-v1:") || !this.keyConfigured()) return null;
    return decryptPersonnelName(encrypted, this.env.PERSONNEL_ENCRYPTION_KEY);
  }

  private displayName(account: Account): string {
    return (
      account.managerProfile?.name ??
      this.decrypt(account.workerProfile?.encryptedName) ??
      this.decrypt(account.encryptedRealName) ??
      account.nickname ??
      "未填姓名"
    );
  }
}
