import { createHash } from "node:crypto";
import type { Prisma, MakeupRequest } from "@prisma/client";
import {
  summarizeScheduledAttendance,
  type AttendanceRecordInput,
  type ScheduledAttendancePoint,
} from "@construction/domain/attendance.js";
import { ROLE_LEVEL } from "@construction/domain/roles.js";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  loadPlanningData,
  resolveAttendancePlan,
  chinaDate,
} from "../attendance/attendance-plans.js";
import {
  memberStateOn,
  isAttendanceMemberOn,
  workerRole,
  type MemberState,
} from "../attendance/member-history.js";
import { API_ENV } from "../config/env.module.js";
import type { ApiEnv } from "../config/env.js";
import { decryptPersonnelName } from "../management/personnel-name.js";
import { PrismaService } from "../infrastructure/database/prisma.service.js";
import { evaluationView } from "./project-evaluations.service.js";
import type {
  ReportPersonDetail,
  AttendanceReportParticipantBase,
  AttendanceReportTotals,
  DailyAttendanceReportParticipant,
  DailyAttendanceReportResponse,
  RangeAttendanceReportParticipant,
  RangeAttendanceReportResponse,
} from "./reports.types.js";

type ReportMember = AttendanceReportParticipantBase &
  MemberState & {
    readonly userId: string | null;
  };

export type AttendanceDayValues = {
  readonly abnormalRecordCount: number;
  readonly approvedMakeupCount: number;
  readonly hasResult: boolean;
  readonly isAbsent: boolean;
  readonly isEarlyLeave: boolean;
  readonly isLate: boolean;
  readonly isMissingPunch: boolean;
  readonly isScheduled: boolean;
  readonly workedMinutes: number;
};

export type ReportDay = {
  readonly date: string;
  readonly planName: string;
  readonly planVersion: string;
  readonly points: readonly ScheduledAttendancePoint[];
  readonly evidence: readonly AttendanceRecordInput[];
  readonly makeups: readonly MakeupRequest[];
  readonly dayValues: AttendanceDayValues;
  readonly participant: AttendanceReportParticipantBase;
};

const millisecondsPerDay = 86_400_000;

const dateOnlyToDate = (value: string): Date =>
  new Date(`${value}T00:00:00.000Z`);

const toDateOnly = (value: Date): string => value.toISOString().slice(0, 10);

const addDays = (value: Date, days: number): Date =>
  new Date(value.getTime() + days * millisecondsPerDay);

const getMonthStartDate = (month: string): Date =>
  new Date(`${month}-01T00:00:00.000Z`);

const getMonthEndDate = (month: string): Date => {
  const startDate = getMonthStartDate(month);
  return new Date(
    Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, 0),
  );
};

const listDatesInclusive = (
  startDate: Date,
  endDate: Date,
): readonly Date[] => {
  const dates: Date[] = [];

  for (
    let currentDate = startDate;
    currentDate.getTime() <= endDate.getTime();
    currentDate = addDays(currentDate, 1)
  ) {
    dates.push(currentDate);
  }

  return dates;
};

const createResultKey = (
  projectId: string,
  participantType: string,
  participantId: string,
  attendanceDate: Date,
): string =>
  JSON.stringify([
    projectId,
    participantType,
    participantId,
    toDateOnly(attendanceDate),
  ]);

const createEmptyTotals = (
  participantCount: number,
): AttendanceReportTotals => ({
  abnormalRecordCount: 0,
  absenceCount: 0,
  actualAttendedDays: 0,
  approvedMakeupCount: 0,
  earlyLeaveCount: 0,
  lateCount: 0,
  missingPunchCount: 0,
  participantCount,
  scheduledDays: 0,
  workedMinutes: 0,
});

const addDayToTotals = (
  totals: AttendanceReportTotals,
  day: AttendanceDayValues,
): AttendanceReportTotals => ({
  abnormalRecordCount: totals.abnormalRecordCount + day.abnormalRecordCount,
  absenceCount: totals.absenceCount + (day.isScheduled && day.isAbsent ? 1 : 0),
  actualAttendedDays:
    totals.actualAttendedDays +
    (day.isScheduled && day.hasResult && !day.isAbsent ? 1 : 0),
  approvedMakeupCount: totals.approvedMakeupCount + day.approvedMakeupCount,
  earlyLeaveCount: totals.earlyLeaveCount + (day.isEarlyLeave ? 1 : 0),
  lateCount: totals.lateCount + (day.isLate ? 1 : 0),
  missingPunchCount:
    totals.missingPunchCount + (day.isScheduled && day.isMissingPunch ? 1 : 0),
  participantCount: totals.participantCount,
  scheduledDays: totals.scheduledDays + (day.isScheduled ? 1 : 0),
  workedMinutes: totals.workedMinutes + day.workedMinutes,
});

const mergeTotals = (
  left: AttendanceReportTotals,
  right: AttendanceReportTotals,
): AttendanceReportTotals => ({
  abnormalRecordCount: left.abnormalRecordCount + right.abnormalRecordCount,
  absenceCount: left.absenceCount + right.absenceCount,
  actualAttendedDays: left.actualAttendedDays + right.actualAttendedDays,
  approvedMakeupCount: left.approvedMakeupCount + right.approvedMakeupCount,
  earlyLeaveCount: left.earlyLeaveCount + right.earlyLeaveCount,
  lateCount: left.lateCount + right.lateCount,
  missingPunchCount: left.missingPunchCount + right.missingPunchCount,
  participantCount: left.participantCount,
  scheduledDays: left.scheduledDays + right.scheduledDays,
  workedMinutes: left.workedMinutes + right.workedMinutes,
});

const createDailyParticipant = (
  participant: AttendanceReportParticipantBase,
  dayValues: AttendanceDayValues,
): DailyAttendanceReportParticipant => ({
  ...participant,
  abnormalRecordCount: dayValues.abnormalRecordCount,
  approvedMakeupCount: dayValues.approvedMakeupCount,
  isAbsent: dayValues.isAbsent,
  isEarlyLeave: dayValues.isEarlyLeave,
  isLate: dayValues.isLate,
  isMissingPunch: dayValues.isMissingPunch,
  workedMinutes: dayValues.workedMinutes,
});

const createRangeParticipant = (
  participant: AttendanceReportParticipantBase,
  totals: AttendanceReportTotals,
): RangeAttendanceReportParticipant => ({
  ...participant,
  abnormalRecordCount: totals.abnormalRecordCount,
  absenceCount: totals.absenceCount,
  actualAttendedDays: totals.actualAttendedDays,
  approvedMakeupCount: totals.approvedMakeupCount,
  earlyLeaveCount: totals.earlyLeaveCount,
  lateCount: totals.lateCount,
  missingPunchCount: totals.missingPunchCount,
  scheduledDays: totals.scheduledDays,
  workedMinutes: totals.workedMinutes,
});

export const summarizeReportDays = (
  rows: readonly ReportDay[],
  reportId: string,
  periodType: "WEEKLY" | "MONTHLY",
  start: Date,
  end: Date,
): RangeAttendanceReportResponse => {
  const groups = new Map<
    string,
    {
      readonly person: AttendanceReportParticipantBase;
      readonly totals: AttendanceReportTotals;
    }
  >();
  for (const row of rows) {
    const key = JSON.stringify([
      row.participant.projectId,
      row.participant.memberId,
      row.participant.teamId,
    ]);
    const previous = groups.get(key);
    groups.set(key, {
      person: row.participant,
      totals: addDayToTotals(
        previous?.totals ?? createEmptyTotals(1),
        row.dayValues,
      ),
    });
  }
  const participantCount = new Set(
    rows.map((row) =>
      JSON.stringify([row.participant.projectId, row.participant.memberId]),
    ),
  ).size;
  const participants = [...groups.values()].map((row) =>
    createRangeParticipant(row.person, row.totals),
  );
  const totals = [...groups.values()].reduce(
    (total, row) => mergeTotals(total, row.totals),
    createEmptyTotals(participantCount),
  );
  return {
    periodType,
    projectId: reportId,
    startDate: toDateOnly(start),
    endDate: toDateOnly(end),
    participants,
    totals,
  };
};

@Injectable()
export class ReportsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  async getDailyReport(
    projectId: string,
    date: string,
  ): Promise<DailyAttendanceReportResponse> {
    await this.requireProject(projectId);
    return this.daily(projectId, [projectId], null, null, date);
  }
  async getWeeklyReport(
    projectId: string,
    date: string,
  ): Promise<RangeAttendanceReportResponse> {
    await this.requireProject(projectId);
    return this.range(
      projectId,
      [projectId],
      null,
      "WEEKLY",
      dateOnlyToDate(date),
      addDays(dateOnlyToDate(date), 6),
    );
  }
  async getMonthlyReport(
    projectId: string,
    month: string,
  ): Promise<RangeAttendanceReportResponse> {
    await this.requireProject(projectId);
    return this.range(
      projectId,
      [projectId],
      null,
      "MONTHLY",
      getMonthStartDate(month),
      getMonthEndDate(month),
    );
  }
  async getTeamDailyReport(
    teamId: string,
    date: string,
  ): Promise<DailyAttendanceReportResponse> {
    const projectId = await this.teamProject(teamId);
    return this.daily(projectId, [projectId], teamId, null, date);
  }
  async getTeamWeeklyReport(
    teamId: string,
    date: string,
  ): Promise<RangeAttendanceReportResponse> {
    const projectId = await this.teamProject(teamId);
    return this.range(
      projectId,
      [projectId],
      teamId,
      "WEEKLY",
      dateOnlyToDate(date),
      addDays(dateOnlyToDate(date), 6),
    );
  }
  async getTeamMonthlyReport(
    teamId: string,
    month: string,
  ): Promise<RangeAttendanceReportResponse> {
    const projectId = await this.teamProject(teamId);
    return this.range(
      projectId,
      [projectId],
      teamId,
      "MONTHLY",
      getMonthStartDate(month),
      getMonthEndDate(month),
    );
  }
  async getCompanyDailyReport(
    companyId: string,
    date: string,
  ): Promise<DailyAttendanceReportResponse> {
    return this.daily(
      companyId,
      await this.companyProjects(companyId),
      null,
      null,
      date,
    );
  }
  async getCompanyWeeklyReport(
    companyId: string,
    date: string,
  ): Promise<RangeAttendanceReportResponse> {
    return this.range(
      companyId,
      await this.companyProjects(companyId),
      null,
      "WEEKLY",
      dateOnlyToDate(date),
      addDays(dateOnlyToDate(date), 6),
    );
  }
  async getCompanyMonthlyReport(
    companyId: string,
    month: string,
  ): Promise<RangeAttendanceReportResponse> {
    return this.range(
      companyId,
      await this.companyProjects(companyId),
      null,
      "MONTHLY",
      getMonthStartDate(month),
      getMonthEndDate(month),
    );
  }
  async personalDays(
    userId: string,
    from: string,
    to: string,
  ): Promise<
    readonly (DailyAttendanceReportParticipant & {
      readonly attendanceDate: string;
    })[]
  > {
    const rows = await this.days(
      this.prisma,
      [],
      null,
      userId,
      dateOnlyToDate(from),
      dateOnlyToDate(to),
      new Date(),
      null,
    );
    return rows.map((row) => ({
      ...createDailyParticipant(row.participant, row.dayValues),
      attendanceDate: row.date,
    }));
  }
  async personDetail(
    projectId: string,
    memberId: string,
    teamId: string | null,
    from: string,
    to: string,
  ): Promise<Omit<ReportPersonDetail, "canEvaluate">> {
    return this.prisma.$transaction(
      async (database) => {
        const rows = await this.days(
          database,
          [projectId],
          teamId,
          null,
          dateOnlyToDate(from),
          dateOnlyToDate(to),
          new Date(),
          memberId,
        );
        const first = rows[0];
        if (first === undefined)
          throw new NotFoundException({
            message: "该人员在所选范围内没有可查看的明细。",
            projectId,
            memberId,
            from,
            to,
          });
        const approvers = await database.user.findMany({
          where: {
            id: {
              in: [
                ...new Set(
                  rows.flatMap((row) =>
                    row.makeups.flatMap((m) =>
                      m.approverUserId === null ? [] : [m.approverUserId],
                    ),
                  ),
                ),
              ],
            },
          },
          select: { id: true, encryptedRealName: true },
        });
        const names = new Map(
          approvers.map((user) => [
            user.id,
            user.encryptedRealName === null
              ? "未填写实名"
              : decryptPersonnelName(
                  user.encryptedRealName,
                  this.env.PERSONNEL_ENCRYPTION_KEY,
                ),
          ]),
        );
        return {
          person: first.participant,
          startDate: from,
          endDate: to,
          days: rows.map((row) => ({
            date: row.date,
            teamName: row.participant.teamName,
            planName: row.planName,
            isScheduled: row.dayValues.isScheduled,
            workedMinutes: row.dayValues.workedMinutes,
            flags: [
              row.dayValues.isAbsent ? "缺勤" : "",
              row.dayValues.isMissingPunch ? "缺卡" : "",
              row.dayValues.isLate ? "迟到" : "",
              row.dayValues.isEarlyLeave ? "早退" : "",
              row.dayValues.abnormalRecordCount > 0
                ? `核验未通过 ${row.dayValues.abnormalRecordCount} 次`
                : "",
            ].filter(Boolean),
            points: row.points,
            records: [...row.evidence]
              .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
              .map((record) => ({
                ...record,
                occurredAt: record.occurredAt.toISOString(),
              })),
            makeups: row.makeups.map((m) => ({
              id: m.id,
              pointLabel: m.pointLabel ?? m.pointCode,
              requestedOccurredAt: m.requestedOccurredAt.toISOString(),
              status: m.status,
              reason: m.reason,
              approvalReason: m.approvalReason,
              approverName:
                m.approverUserId === null ? null : names.get(m.approverUserId)!,
              approvedAt: m.approvedAt?.toISOString() ?? null,
            })),
          })),
        };
      },
      { isolationLevel: "RepeatableRead", timeout: 30000 },
    );
  }
  private async requireProject(projectId: string): Promise<void> {
    if (
      (await this.prisma.project.findUnique({ where: { id: projectId } })) ===
      null
    )
      throw new NotFoundException({
        message: "REPORT_PROJECT_NOT_FOUND",
        projectId,
      });
  }
  private async teamProject(teamId: string): Promise<string> {
    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (team === null)
      throw new NotFoundException({ message: "REPORT_TEAM_NOT_FOUND", teamId });
    return team.projectId;
  }
  private async companyProjects(companyId: string): Promise<readonly string[]> {
    if (
      (await this.prisma.company.findUnique({ where: { id: companyId } })) ===
      null
    )
      throw new NotFoundException({
        message: "REPORT_COMPANY_NOT_FOUND",
        companyId,
      });
    return (
      await this.prisma.project.findMany({
        where: { companyId },
        select: { id: true },
      })
    ).map((row) => row.id);
  }
  private async daily(
    reportId: string,
    projects: readonly string[],
    teamId: string | null,
    userId: string | null,
    date: string,
  ): Promise<DailyAttendanceReportResponse> {
    const rows = await this.days(
      this.prisma,
      projects,
      teamId,
      userId,
      dateOnlyToDate(date),
      dateOnlyToDate(date),
      new Date(),
      null,
    );
    return {
      periodType: "DAILY",
      projectId: reportId,
      startDate: date,
      endDate: date,
      participants: rows.map((row) =>
        createDailyParticipant(row.participant, row.dayValues),
      ),
      totals: rows.reduce(
        (totals, row) => addDayToTotals(totals, row.dayValues),
        createEmptyTotals(rows.length),
      ),
    };
  }
  private async range(
    reportId: string,
    projects: readonly string[],
    teamId: string | null,
    periodType: "WEEKLY" | "MONTHLY",
    start: Date,
    end: Date,
  ): Promise<RangeAttendanceReportResponse> {
    const rows = await this.days(
      this.prisma,
      projects,
      teamId,
      null,
      start,
      end,
      new Date(),
      null,
    );
    return summarizeReportDays(rows, reportId, periodType, start, end);
  }
  async monthlySnapshot(
    projectIds: readonly string[],
    teamId: string | null,
    reportId: string,
    month: string,
  ): Promise<{
    readonly rows: readonly ReportDay[];
    readonly report: RangeAttendanceReportResponse;
    readonly projectNames: ReadonlyMap<string, string>;
    readonly approverNames: ReadonlyMap<string, string>;
    readonly cutoff: Date;
  }> {
    return this.prisma.$transaction(
      async (transaction) => {
        const cutoff = new Date();
        const start = getMonthStartDate(month);
        const end = getMonthEndDate(month);
        const rows = await this.days(
          transaction,
          projectIds,
          teamId,
          null,
          start,
          end,
          cutoff,
          null,
        );
        const projects = await transaction.project.findMany({
          where: { id: { in: [...projectIds] } },
          select: { id: true, name: true },
        });
        const approverIds = [
          ...new Set(
            rows.flatMap((row) =>
              row.makeups.flatMap((m) =>
                m.approverUserId === null ? [] : [m.approverUserId],
              ),
            ),
          ),
        ];
        const approvers = await transaction.user.findMany({
          where: { id: { in: approverIds } },
          select: { id: true, encryptedRealName: true },
        });
        return {
          rows,
          report: summarizeReportDays(rows, reportId, "MONTHLY", start, end),
          cutoff,
          projectNames: new Map(projects.map((p) => [p.id, p.name])),
          approverNames: new Map(
            approvers.map((u) => [
              u.id,
              u.encryptedRealName === null
                ? "未填写实名"
                : decryptPersonnelName(
                    u.encryptedRealName,
                    this.env.PERSONNEL_ENCRYPTION_KEY,
                  ),
            ]),
          ),
        };
      },
      { isolationLevel: "RepeatableRead", timeout: 120000 },
    );
  }
  private async members(
    database: Prisma.TransactionClient,
    projectIds: readonly string[],
    userId: string | null,
    teamId: string | null,
    memberId: string | null,
  ): Promise<readonly ReportMember[]> {
    const where = {
      ...(userId === null ? { projectId: { in: [...projectIds] } } : {}),
      ...(memberId === null ? {} : { id: memberId }),
    };
    const [workers, managers] = await Promise.all([
      database.projectWorkerMember.findMany({
        where: {
          ...where,
          ...(userId === null ? {} : { worker: { userId } }),
          ...(teamId === null
            ? {}
            : { OR: [{ teamId }, { history: { some: { teamId } } }] }),
        },
        include: {
          worker: true,
          team: true,
          project: { select: { name: true } },
          evaluation: {
            include: { reviewer: { select: { encryptedRealName: true } } },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
      database.projectManagerMember.findMany({
        where: {
          ...where,
          ...(userId === null ? {} : { manager: { userId } }),
          ...(teamId === null
            ? {}
            : {
                OR: [
                  { teamScopeId: teamId },
                  { history: { some: { teamId } } },
                ],
              }),
        },
        include: {
          manager: true,
          teamScope: true,
          project: { select: { name: true } },
          evaluation: {
            include: { reviewer: { select: { encryptedRealName: true } } },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    return [
      ...workers.map(
        (m): ReportMember => ({
          projectId: m.projectId,
          projectName: m.project.name,
          evaluation: evaluationView(
            m.evaluation,
            this.env.PERSONNEL_ENCRYPTION_KEY,
          ),
          memberId: m.id,
          participantId: m.workerId,
          participantType: "WORKER",
          displayName: m.worker.encryptedName.startsWith("name-v1:")
            ? decryptPersonnelName(
                m.worker.encryptedName,
                this.env.PERSONNEL_ENCRYPTION_KEY,
              )
            : null,
          userId: m.worker.userId,
          phone: m.worker.phone,
          workType: m.worker.workType,
          projectRoleLabel: m.projectRoleLabel,
          roleCode: workerRole(m.projectRoleLabel),
          teamId: m.teamId,
          teamName: m.team?.name ?? null,
          memberStatus: m.status,
          status: m.status,
          enteredAt: m.enteredAt,
          exitedAt: m.exitedAt,
          requiresAttendance: m.requiresAttendance,
        }),
      ),
      ...managers.map(
        (m): ReportMember => ({
          projectId: m.projectId,
          projectName: m.project.name,
          evaluation: evaluationView(
            m.evaluation,
            this.env.PERSONNEL_ENCRYPTION_KEY,
          ),
          memberId: m.id,
          participantId: m.managerId,
          participantType: "MANAGER",
          displayName: m.manager.name,
          userId: m.manager.userId,
          phone: m.manager.phone,
          workType: m.manager.workType,
          projectRoleLabel: m.roleCode,
          roleCode: m.roleCode,
          teamId: m.teamScopeId,
          teamName: m.teamScope?.name ?? null,
          memberStatus: m.status,
          status: m.status,
          enteredAt: m.enteredAt,
          exitedAt: m.exitedAt,
          requiresAttendance: m.requiresAttendance,
        }),
      ),
    ];
  }
  private async days(
    database: Prisma.TransactionClient,
    projectIds: readonly string[],
    teamId: string | null,
    userId: string | null,
    start: Date,
    end: Date,
    now: Date,
    memberId: string | null,
  ): Promise<readonly ReportDay[]> {
    const members = await this.members(
      database,
      projectIds,
      userId,
      teamId,
      memberId,
    );
    if (members.length === 0) return [];
    const ids = [...new Set(members.map((m) => m.projectId))];
    const owners = members.map((m) => ({
      projectId: m.projectId,
      participantType: m.participantType,
      participantId: m.participantId,
    }));
    const where = { attendanceDate: { gte: start, lte: end }, OR: owners };
    const [planning, records, makeups, storedResults, teams] =
      await Promise.all([
        loadPlanningData(database, ids),
        database.attendanceRecord.findMany({ where }),
        database.makeupRequest.findMany({
          where,
        }),
        database.attendanceResult.findMany({ where }),
        database.team.findMany({
          where: { projectId: { in: ids } },
          select: { id: true, name: true },
        }),
      ]);
    const names = new Map(teams.map((t) => [t.id, t.name]));
    const inputs = new Map<string, readonly AttendanceRecordInput[]>();
    for (const record of records) {
      const key = createResultKey(
        record.projectId,
        record.participantType,
        record.participantId,
        record.attendanceDate,
      );
      inputs.set(key, [
        ...(inputs.get(key) ?? []),
        {
          id: record.id,
          pointCode: record.pointCode,
          occurredAt: record.occurredAt,
          isValid: record.status === "VALID",
          source: record.source,
        },
      ]);
    }
    const makeupsByDay = new Map<string, readonly MakeupRequest[]>();
    for (const row of makeups) {
      const key = createResultKey(
        row.projectId,
        row.participantType,
        row.participantId,
        row.attendanceDate,
      );
      makeupsByDay.set(key, [...(makeupsByDay.get(key) ?? []), row]);
      if (row.status !== "APPROVED") continue;
      inputs.set(key, [
        ...(inputs.get(key) ?? []),
        {
          id: row.id,
          pointCode: row.pointCode,
          occurredAt: row.requestedOccurredAt,
          isValid: true,
          source: "MAKEUP",
        },
      ]);
    }
    const stored = new Map(
      storedResults.map((r) => [
        createResultKey(
          r.projectId,
          r.participantType,
          r.participantId,
          r.attendanceDate,
        ),
        r,
      ]),
    );
    const today = chinaDate(now);
    const dates = listDatesInclusive(start, end).filter(
      (d) => toDateOnly(d) <= today,
    );
    const output: ReportDay[] = [];
    const historiesByMember = new Map<string, typeof planning.histories>();
    for (const row of planning.histories) {
      const id = row.workerMemberId ?? row.managerMemberId!;
      historiesByMember.set(id, [...(historiesByMember.get(id) ?? []), row]);
    }
    const plansByProject = new Map(
      ids.map((id) => [
        id,
        {
          rules: planning.rules.filter((r) => r.projectId === id),
          schedules: planning.schedules.filter((r) => r.ownerId === id),
          shifts: planning.shifts.filter((r) => r.projectId === id),
        },
      ]),
    );
    for (const member of members) {
      const data = {
        ...plansByProject.get(member.projectId)!,
        histories: historiesByMember.get(member.memberId) ?? [],
      };
      for (const date of dates) {
        const text = toDateOnly(date);
        const state = memberStateOn(member, data.histories, text);
        if (teamId !== null && state.teamId !== teamId) continue;
        const key = createResultKey(
          member.projectId,
          member.participantType,
          member.participantId,
          date,
        );
        const evidence = inputs.get(key) ?? [];
        const legacy = stored.get(key);
        const eligible = isAttendanceMemberOn(state, text);
        if (
          !eligible &&
          evidence.length === 0 &&
          legacy === undefined &&
          !makeupsByDay.has(key)
        )
          continue;
        const plan = resolveAttendancePlan(
          data,
          member.projectId,
          {
            ...member,
            roleLevel: ROLE_LEVEL[state.roleCode],
            teamId: state.teamId,
          },
          text,
        );
        const isScheduled = eligible && plan.isWorkday;
        const summary = summarizeScheduledAttendance(
          plan.points,
          text,
          evidence,
          now,
        );
        // Preserve imported legacy summaries only when no raw evidence exists for that past day.
        const imported =
          text < today &&
          evidence.length === 0 &&
          legacy !== undefined &&
          !data.rules.some((r) => r.startsOn <= date)
            ? legacy
            : null;
        const day = imported ?? summary;
        const hasResult =
          evidence.some((r) => r.isValid) ||
          (imported !== null && !imported.isAbsent);
        const participant: AttendanceReportParticipantBase = {
          projectId: member.projectId,
          projectName: member.projectName,
          evaluation: member.evaluation,
          participantId: member.participantId,
          participantType: member.participantType,
          memberId: member.memberId,
          displayName: member.displayName,
          phone: member.phone,
          workType: member.workType,
          teamId: state.teamId,
          teamName:
            state.teamId === null ? null : (names.get(state.teamId) ?? null),
          memberStatus: state.status,
          requiresAttendance: state.requiresAttendance,
          projectRoleLabel: state.projectRoleLabel,
        };
        output.push({
          date: text,
          participant,
          planName: plan.name,
          planVersion: createHash("sha256")
            .update(JSON.stringify(plan))
            .digest("hex")
            .slice(0, 12),
          points: plan.points,
          evidence,
          makeups: makeupsByDay.get(key) ?? [],
          dayValues: {
            isScheduled,
            hasResult,
            workedMinutes: day.workedMinutes,
            isAbsent: isScheduled && day.isAbsent,
            isMissingPunch: isScheduled && day.isMissingPunch,
            isLate: isScheduled && day.isLate,
            isEarlyLeave: isScheduled && day.isEarlyLeave,
            abnormalRecordCount:
              imported?.abnormalRecordCount ??
              evidence.filter((r) => !r.isValid).length,
            approvedMakeupCount:
              imported?.approvedMakeupCount ??
              evidence.filter((r) => r.source === "MAKEUP").length,
          },
        });
      }
    }
    return output;
  }
}
