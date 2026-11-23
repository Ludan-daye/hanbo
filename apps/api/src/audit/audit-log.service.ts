import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import {
  auditActionsIn,
  auditCategoryOf,
  auditSentence,
  auditTargetRef,
  type AuditLogKind,
  type AuditTargetRef,
} from "@construction/domain";
import type { Prisma } from "@prisma/client";

import { API_ENV } from "../config/env.module.js";
import type { ApiEnv } from "../config/env.js";
import { PrismaService } from "../infrastructure/database/prisma.service.js";
import { decryptPersonnelName } from "../management/personnel-name.js";

import { encodeAuditCursor } from "./audit-log.parsers.js";
import type {
  AuditLogPageResponse,
  AuditLogQuery,
  PlatformAuditLogQuery,
} from "./audit-log.types.js";

const PAGE_SIZE = 30;
const refKey = (ref: AuditTargetRef): string =>
  ref.kind === "profile"
    ? `profile:${ref.participantType}:${ref.id}`
    : `${ref.kind}:${ref.id}`;

/**
 * Read-only operation log, newest first: one project (AuditLog.projectId), one company
 * (AuditLog.companyId), or the whole platform (system admin plan phase 4).
 */
@Injectable()
export class AuditLogService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  async projectLog(
    projectId: string,
    query: AuditLogQuery,
  ): Promise<AuditLogPageResponse> {
    if (query.projectId !== null && query.projectId !== projectId)
      throw new BadRequestException({
        message: "AUDIT_PROJECT_OUT_OF_SCOPE",
        projectId: query.projectId,
      });
    return this.page({ projectId }, query, "PROJECT");
  }

  async companyLog(
    companyId: string,
    query: AuditLogQuery,
  ): Promise<AuditLogPageResponse> {
    const projects = (
      await this.prisma.project.findMany({
        where: { companyId },
        select: { id: true },
      })
    ).map((row) => row.id);
    if (query.projectId !== null && !projects.includes(query.projectId))
      throw new BadRequestException({
        message: "AUDIT_PROJECT_OUT_OF_SCOPE",
        projectId: query.projectId,
      });
    // AuditLog.companyId (2026-11-21): project rows plus company-level ones
    // (project creation, exports, offboarding, defaults, company profile).
    return this.page(
      query.projectId === null
        ? { companyId }
        : { companyId, projectId: query.projectId },
      query,
      "COMPANY",
    );
  }

  /**
   * Everything on the platform (Q9): every company's rows and the ones that belong to no
   * company (accounts, super admins, the safety credit policy). Narrowed by company, type
   * (平台 here takes in what the platform did to a company) and actor, which answers whose
   * registrations a super admin has read (Q8). An unknown company or actor just finds nothing.
   */
  async platformLog(query: PlatformAuditLogQuery): Promise<AuditLogPageResponse> {
    return this.page(
      {
        ...(query.actorUserId === null ? {} : { actorUserId: query.actorUserId }),
        ...(query.companyId === null ? {} : { companyId: query.companyId }),
      },
      query,
      "PLATFORM",
    );
  }

  private name(value: string | null | undefined): string | null {
    return value !== null && value !== undefined && value.startsWith("name-v1:")
      ? decryptPersonnelName(value, this.env.PERSONNEL_ENCRYPTION_KEY)
      : null;
  }

  private async page(
    scope: Prisma.AuditLogWhereInput,
    query: Pick<AuditLogQuery, "cursor" | "type">,
    kind: AuditLogKind,
  ): Promise<AuditLogPageResponse> {
    const where: Prisma.AuditLogWhereInput = {
      ...scope,
      ...(query.type === null
        ? {}
        : { action: { in: [...auditActionsIn(query.type, kind)] } }),
      ...(query.cursor === null
        ? {}
        : {
            OR: [
              { createdAt: { lt: query.cursor.createdAt } },
              { createdAt: query.cursor.createdAt, id: { lt: query.cursor.id } },
            ],
          }),
    };
    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PAGE_SIZE + 1,
    });
    const visible = rows.slice(0, PAGE_SIZE);
    const refs = new Map<string, AuditTargetRef>();
    const targets = new Map<string, AuditTargetRef | null>();
    for (const row of visible) {
      const ref = auditTargetRef(row);
      targets.set(row.id, ref);
      if (ref !== null) refs.set(refKey(ref), ref);
    }
    const ids = (kind: AuditTargetRef["kind"], type?: string) => [
      ...new Set(
        [...refs.values()]
          .filter(
            (ref) =>
              ref.kind === kind &&
              (type === undefined ||
                (ref.kind === "profile" && ref.participantType === type)),
          )
          .map((ref) => ref.id),
      ),
    ];
    const violations = await this.prisma.safetyViolation.findMany({
      where: { id: { in: ids("violation") } },
      select: { id: true, workerId: true },
    });
    const present = (values: readonly (string | null)[]): string[] => [
      ...new Set(values.filter((value): value is string => value !== null)),
    ];
    const [
      users,
      projects,
      companies,
      workerMembers,
      managerMembers,
      workers,
      managers,
      teams,
      tasks,
    ] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: present(visible.map((row) => row.actorUserId)) } },
        select: { id: true, encryptedRealName: true, nickname: true },
      }),
      this.prisma.project.findMany({
        where: { id: { in: present(visible.map((row) => row.projectId)) } },
        select: { id: true, name: true },
      }),
      this.prisma.company.findMany({
        where: { id: { in: present(visible.map((row) => row.companyId)) } },
        select: { id: true, name: true },
      }),
      this.prisma.projectWorkerMember.findMany({
        where: { id: { in: ids("member") } },
        select: { id: true, worker: { select: { encryptedName: true } } },
      }),
      this.prisma.projectManagerMember.findMany({
        where: { id: { in: ids("member") } },
        select: { id: true, manager: { select: { name: true } } },
      }),
      this.prisma.workerProfile.findMany({
        where: {
          id: {
            in: [
              ...ids("profile", "WORKER"),
              ...violations.map((row) => row.workerId),
            ],
          },
        },
        select: { id: true, encryptedName: true },
      }),
      this.prisma.managerProfile.findMany({
        where: { id: { in: ids("profile", "MANAGER") } },
        select: { id: true, name: true },
      }),
      this.prisma.team.findMany({
        where: { id: { in: ids("team") } },
        select: { id: true, name: true },
      }),
      this.prisma.teamWorkTask.findMany({
        where: { id: { in: ids("task") } },
        select: { id: true, title: true },
      }),
    ]);
    const workerName = (id: string): string | null =>
      this.name(workers.find((row) => row.id === id)?.encryptedName);
    const targetName = (ref: AuditTargetRef | null): string | null => {
      if (ref === null) return null;
      switch (ref.kind) {
        case "member": {
          const worker = workerMembers.find((row) => row.id === ref.id);
          if (worker !== undefined) return this.name(worker.worker.encryptedName);
          return managerMembers.find((row) => row.id === ref.id)?.manager.name ?? null;
        }
        case "profile":
          return ref.participantType === "WORKER"
            ? workerName(ref.id)
            : (managers.find((row) => row.id === ref.id)?.name ?? null);
        case "violation": {
          const violation = violations.find((row) => row.id === ref.id);
          return violation === undefined ? null : workerName(violation.workerId);
        }
        case "team":
          return teams.find((row) => row.id === ref.id)?.name ?? null;
        case "task":
          return tasks.find((row) => row.id === ref.id)?.title ?? null;
      }
    };
    const items = visible.map((row) => {
      const user = users.find((item) => item.id === row.actorUserId);
      const actorName =
        user === undefined
          ? null
          : (this.name(user.encryptedRealName) ?? user.nickname ?? null);
      return {
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        action: row.action,
        category: auditCategoryOf(row.action, kind),
        actorName,
        actorUserId: row.actorUserId,
        sentence: auditSentence(row, actorName, targetName(targets.get(row.id) ?? null)),
        companyId: row.companyId,
        companyName:
          companies.find((company) => company.id === row.companyId)?.name ?? null,
        projectId: row.projectId,
        projectName:
          projects.find((project) => project.id === row.projectId)?.name ?? null,
      };
    });
    const last = visible.at(-1);
    return {
      items,
      nextCursor:
        rows.length > PAGE_SIZE && last !== undefined
          ? encodeAuditCursor(last.createdAt, last.id)
          : null,
    };
  }
}
