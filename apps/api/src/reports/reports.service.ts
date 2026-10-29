import {
  summarizeScheduledAttendance,
  type AttendanceRecordInput,
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
import type {
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

type AttendanceDayValues = {
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

type DailyParticipantWithDayValues = {
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
      [],
      null,
      userId,
      dateOnlyToDate(from),
      dateOnlyToDate(to),
    );
    return rows.map((row) => ({
      ...createDailyParticipant(row.participant, row.dayValues),
      attendanceDate: row.date,
    }));
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
      projects,
      teamId,
      userId,
      dateOnlyToDate(date),
      dateOnlyToDate(date),
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
    const rows = await this.days(projects, teamId, null, start, end);
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
  }
  private async members(
    projectIds: readonly string[],
    userId: string | null,
    teamId: string | null,
  ): Promise<readonly ReportMember[]> {
    const where = userId === null ? { projectId: { in: [...projectIds] } } : {};
    const [workers, managers] = await Promise.all([
      this.prisma.projectWorkerMember.findMany({
        where: {
          ...where,
          ...(userId === null ? {} : { worker: { userId } }),
          ...(teamId === null
            ? {}
            : { OR: [{ teamId }, { history: { some: { teamId } } }] }),
        },
        include: { worker: true, team: true },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.projectManagerMember.findMany({
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
        include: { manager: true, teamScope: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    return [
      ...workers.map(
        (m): ReportMember => ({
          projectId: m.projectId,
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
    projectIds: readonly string[],
    teamId: string | null,
    userId: string | null,
    start: Date,
    end: Date,
  ): Promise<
    readonly (DailyParticipantWithDayValues & { readonly date: string })[]
  > {
    const members = await this.members(projectIds, userId, teamId);
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
        loadPlanningData(this.prisma, ids),
        this.prisma.attendanceRecord.findMany({ where }),
        this.prisma.makeupRequest.findMany({
          where: { ...where, status: "APPROVED" },
        }),
        this.prisma.attendanceResult.findMany({ where }),
        this.prisma.team.findMany({
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
    for (const row of makeups) {
      const key = createResultKey(
        row.projectId,
        row.participantType,
        row.participantId,
        row.attendanceDate,
      );
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
    const now = new Date();
    const today = chinaDate(now);
    const dates = listDatesInclusive(start, end).filter(
      (d) => toDateOnly(d) <= today,
    );
    const output: (DailyParticipantWithDayValues & {
      readonly date: string;
    })[] = [];
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
        if (!eligible && evidence.length === 0 && legacy === undefined)
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
