import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  defaultAttendancePoints,
  defaultWorktimeRule,
  type ScheduledAttendancePoint,
} from "@construction/domain";
import type { Company, CompanyAttendanceDefault, Prisma } from "@prisma/client";

import { chinaDate } from "../attendance/attendance-plans.js";
import { API_ENV } from "../config/env.module.js";
import type { ApiEnv } from "../config/env.js";
import { PrismaService } from "../infrastructure/database/prisma.service.js";

import type {
  CompanyAttendanceDefaults,
  CompanyAttendanceDefaultsResponse,
  CompanyAttendanceDefaultsWrite,
  CompanyProfileResponse,
  CompanyProfileWrite,
} from "./company-settings.types.js";
import { decryptPersonnelName } from "./personnel-name.js";

const FALLBACK: CompanyAttendanceDefaults = {
  name: "每日两次",
  points: defaultAttendancePoints,
  workdays: [1, 2, 3, 4, 5, 6, 7],
  worktime: defaultWorktimeRule,
};

const values = (row: CompanyAttendanceDefault): CompanyAttendanceDefaults => ({
  name: row.name,
  points: row.points as unknown as readonly ScheduledAttendancePoint[],
  workdays: row.workdays,
  worktime: {
    lunchEnd: row.lunchEnd,
    lunchStart: row.lunchStart,
    overtimeStart: row.overtimeStart,
    projectKind: row.projectKind === "REPAIR" ? "REPAIR" : "REGULAR",
  },
});

const profile = (company: Company): CompanyProfileResponse => ({
  address: company.address,
  contactName: company.contactName,
  contactPhone: company.contactPhone,
  creditCode: company.creditCode,
  id: company.id,
  name: company.name,
  shortName: company.shortName,
  status: company.status,
  updatedAt: company.updatedAt.toISOString(),
});

/**
 * Company settings (2026-11-21 phase 4, Q6, Q12): one default attendance plan and
 * worktime rule applied once to new projects, and the contact fields of the company.
 */
@Injectable()
export class CompanySettingsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  async defaults(companyId: string): Promise<CompanyAttendanceDefaultsResponse> {
    await this.company(companyId);
    const latest = await this.prisma.companyAttendanceDefault.findFirst({
      where: { companyId },
      orderBy: { version: "desc" },
    });
    let createdByName: string | null = null;
    if (latest !== null) {
      const user = await this.prisma.user.findUnique({
        where: { id: latest.createdByUserId },
        select: { encryptedRealName: true, nickname: true },
      });
      createdByName = user?.encryptedRealName?.startsWith("name-v1:")
        ? decryptPersonnelName(user.encryptedRealName, this.env.PERSONNEL_ENCRYPTION_KEY)
        : (user?.nickname ?? null);
    }
    return {
      companyId,
      current:
        latest === null
          ? null
          : { ...values(latest), createdAt: latest.createdAt.toISOString(), createdByName, version: latest.version },
      fallback: FALLBACK,
      latestVersion: latest?.version ?? 0,
    };
  }

  async saveDefaults(
    companyId: string,
    actorUserId: string,
    body: CompanyAttendanceDefaultsWrite,
  ): Promise<CompanyAttendanceDefaultsResponse> {
    await this.company(companyId);
    await this.prisma.$transaction(async (transaction): Promise<void> => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`company-defaults:${companyId}`}, 0))`;
      const latest = await transaction.companyAttendanceDefault.findFirst({
        where: { companyId },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      if ((latest?.version ?? 0) !== body.expectedVersion)
        throw new ConflictException({ message: "COMPANY_DEFAULTS_VERSION_CONFLICT", latestVersion: latest?.version ?? 0 });
      const saved = await transaction.companyAttendanceDefault.create({
        data: {
          companyId,
          createdByUserId: actorUserId,
          lunchEnd: body.worktime.lunchEnd,
          lunchStart: body.worktime.lunchStart,
          name: body.name,
          overtimeStart: body.worktime.overtimeStart,
          points: body.points as unknown as Prisma.InputJsonValue,
          projectKind: body.worktime.projectKind,
          version: body.expectedVersion + 1,
          workdays: [...body.workdays].sort((a, b) => a - b),
        },
      });
      await transaction.auditLog.create({
        data: {
          action: "COMPANY_DEFAULTS_SAVED",
          actorUserId,
          companyId,
          entityId: saved.id,
          entityType: "company_attendance_default",
          metadata: { companyId, name: body.name, pointCount: body.points.length, version: saved.version },
        },
      });
    });
    return this.defaults(companyId);
  }

  /**
   * Inside createProject's transaction: copy the latest company defaults into the new
   * project as its PROJECT plan and first worktime rule, effective from the later of the
   * planned start and today. Returns the version applied, or null without defaults.
   */
  async applyToNewProject(
    transaction: Prisma.TransactionClient,
    input: {
      readonly actorUserId: string;
      readonly authorRoleLevel: number;
      readonly companyId: string;
      readonly plannedStartDate: string;
      readonly projectId: string;
    },
  ): Promise<number | null> {
    const latest = await transaction.companyAttendanceDefault.findFirst({
      where: { companyId: input.companyId },
      orderBy: { version: "desc" },
    });
    if (latest === null) return null;
    const today = chinaDate(new Date());
    const startsOn = new Date(input.plannedStartDate > today ? input.plannedStartDate : today);
    const defaults = values(latest);
    const plan = await transaction.attendancePlan.create({
      data: {
        authorRoleLevel: input.authorRoleLevel,
        authorUserId: input.actorUserId,
        name: defaults.name,
        points: defaults.points as unknown as Prisma.InputJsonValue,
        projectId: input.projectId,
        scopeId: input.projectId,
        scopeType: "PROJECT",
        startsOn,
        workdayMask: defaults.workdays.reduce((mask, day) => mask | (1 << (day - 1)), 0),
      },
    });
    const rule = await transaction.projectWorktimeRule.create({
      data: {
        createdByUserId: input.actorUserId,
        lunchEnd: defaults.worktime.lunchEnd,
        lunchStart: defaults.worktime.lunchStart,
        overtimeStart: defaults.worktime.overtimeStart,
        projectId: input.projectId,
        projectKind: defaults.worktime.projectKind,
        startsOn,
        version: 1,
      },
    });
    await transaction.auditLog.create({
      data: {
        action: "attendance.plan.save",
        actorUserId: input.actorUserId,
        entityId: plan.id,
        entityType: "attendance_plan",
        metadata: { companyDefaultsVersion: latest.version, projectId: input.projectId, scopeId: input.projectId, scopeType: "PROJECT", startsOn: startsOn.toISOString().slice(0, 10) },
        projectId: input.projectId,
      },
    });
    await transaction.auditLog.create({
      data: {
        action: "WORKTIME_RULE_SAVED",
        actorUserId: input.actorUserId,
        entityId: rule.id,
        entityType: "project_worktime_rule",
        metadata: { companyDefaultsVersion: latest.version, startsOn: startsOn.toISOString().slice(0, 10), version: 1 },
        projectId: input.projectId,
      },
    });
    return latest.version;
  }

  async profile(companyId: string): Promise<CompanyProfileResponse> {
    return profile(await this.company(companyId));
  }

  /** Q12: contact name, phone and address only; name and credit code stay with the platform. */
  async updateProfile(
    companyId: string,
    actorUserId: string,
    body: CompanyProfileWrite,
  ): Promise<CompanyProfileResponse> {
    const previous = await this.company(companyId);
    await this.prisma.$transaction(async (transaction): Promise<void> => {
      const result = await transaction.company.updateMany({
        where: { id: companyId, updatedAt: new Date(body.expectedUpdatedAt) },
        data: {
          address: body.address,
          contactName: body.contactName,
          contactPhone: body.contactPhone,
          updatedAt: new Date(Math.max(Date.now(), previous.updatedAt.getTime() + 1)),
        },
      });
      if (result.count !== 1)
        throw new ConflictException({ message: "COMPANY_CHANGED_RELOAD_BEFORE_SAVING" });
      await transaction.auditLog.create({
        data: {
          action: "COMPANY_PROFILE_UPDATED",
          actorUserId,
          companyId,
          entityId: companyId,
          entityType: "company",
          metadata: {
            changed: (["address", "contactName", "contactPhone"] as const).filter((key) => previous[key] !== body[key]),
            companyId,
          },
        },
      });
    });
    return this.profile(companyId);
  }

  private async company(companyId: string): Promise<Company> {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (company === null) throw new NotFoundException({ message: "COMPANY_NOT_FOUND", companyId });
    return company;
  }
}
