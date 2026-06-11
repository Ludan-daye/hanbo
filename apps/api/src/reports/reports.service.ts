import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type {
  AttendanceResult,
  ManagerProfile,
  ProjectManagerMember,
  ProjectWorkerMember,
  Schedule,
  Team,
  WorkerProfile
} from "@prisma/client";

import { PrismaService } from "../infrastructure/database/prisma.service.js";
import type { MemberStatusValue } from "../management/management.types.js";

import type {
  AttendanceReportParticipantBase,
  AttendanceReportTotals,
  DailyAttendanceReportParticipant,
  DailyAttendanceReportResponse,
  RangeAttendanceReportParticipant,
  RangeAttendanceReportResponse
} from "./reports.types.js";

type WorkerMemberWithProfileAndTeam = ProjectWorkerMember & {
  readonly team: Team | null;
  readonly worker: WorkerProfile;
};

type ManagerMemberWithProfileAndTeam = ProjectManagerMember & {
  readonly manager: ManagerProfile;
  readonly teamScope: Team | null;
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
const projectScheduleOwnerType = "PROJECT";

const dateOnlyToDate = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

const toDateOnly = (value: Date): string => value.toISOString().slice(0, 10);

const addDays = (value: Date, days: number): Date => new Date(value.getTime() + days * millisecondsPerDay);

const getIsoWeekday = (value: Date): number => {
  const utcDay = value.getUTCDay();

  if (utcDay === 0) {
    return 7;
  }

  return utcDay;
};

const getMonthStartDate = (month: string): Date => new Date(`${month}-01T00:00:00.000Z`);

const getMonthEndDate = (month: string): Date => {
  const startDate = getMonthStartDate(month);
  return new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, 0));
};

const listDatesInclusive = (startDate: Date, endDate: Date): readonly Date[] => {
  const dates: Date[] = [];

  for (let currentDate = startDate; currentDate.getTime() <= endDate.getTime(); currentDate = addDays(currentDate, 1)) {
    dates.push(currentDate);
  }

  return dates;
};

const createResultKey = (participantType: string, participantId: string, attendanceDate: Date): string =>
  `${participantType}:${participantId}:${toDateOnly(attendanceDate)}`;

const isDateInScheduleRange = (schedule: Schedule, reportDate: Date): boolean =>
  schedule.startsOn.getTime() <= reportDate.getTime() &&
  (schedule.endsOn === null || schedule.endsOn.getTime() >= reportDate.getTime());

const isDateEnabledBySchedule = (schedule: Schedule, reportDate: Date): boolean => {
  const weekday = getIsoWeekday(reportDate);

  return (schedule.workdayMask & (1 << (weekday - 1))) !== 0;
};

const isScheduledReportDate = (schedules: readonly Schedule[], reportDate: Date): boolean => {
  if (schedules.length === 0) {
    return true;
  }

  return schedules.some(
    (schedule: Schedule): boolean => isDateInScheduleRange(schedule, reportDate) && isDateEnabledBySchedule(schedule, reportDate)
  );
};

const createAbsentDayValues = (): AttendanceDayValues => ({
  abnormalRecordCount: 0,
  approvedMakeupCount: 0,
  hasResult: false,
  isAbsent: true,
  isEarlyLeave: false,
  isLate: false,
  isMissingPunch: true,
  isScheduled: true,
  workedMinutes: 0
});

const createRestDayValues = (): AttendanceDayValues => ({
  abnormalRecordCount: 0,
  approvedMakeupCount: 0,
  hasResult: false,
  isAbsent: false,
  isEarlyLeave: false,
  isLate: false,
  isMissingPunch: false,
  isScheduled: false,
  workedMinutes: 0
});

const createDayValues = (result: AttendanceResult | undefined, isScheduled: boolean): AttendanceDayValues => {
  if (result === undefined) {
    return isScheduled ? createAbsentDayValues() : createRestDayValues();
  }

  return {
    abnormalRecordCount: result.abnormalRecordCount,
    approvedMakeupCount: result.approvedMakeupCount,
    hasResult: true,
    isAbsent: result.isAbsent,
    isEarlyLeave: result.isEarlyLeave,
    isLate: result.isLate,
    isMissingPunch: result.isMissingPunch,
    isScheduled,
    workedMinutes: result.workedMinutes
  };
};

const createEmptyTotals = (participantCount: number): AttendanceReportTotals => ({
  abnormalRecordCount: 0,
  absenceCount: 0,
  actualAttendedDays: 0,
  approvedMakeupCount: 0,
  earlyLeaveCount: 0,
  lateCount: 0,
  missingPunchCount: 0,
  participantCount,
  scheduledDays: 0,
  workedMinutes: 0
});

const addDayToTotals = (totals: AttendanceReportTotals, day: AttendanceDayValues): AttendanceReportTotals => ({
  abnormalRecordCount: totals.abnormalRecordCount + day.abnormalRecordCount,
  absenceCount: totals.absenceCount + (day.isScheduled && day.isAbsent ? 1 : 0),
  actualAttendedDays: totals.actualAttendedDays + (day.hasResult && !day.isAbsent ? 1 : 0),
  approvedMakeupCount: totals.approvedMakeupCount + day.approvedMakeupCount,
  earlyLeaveCount: totals.earlyLeaveCount + (day.isEarlyLeave ? 1 : 0),
  lateCount: totals.lateCount + (day.isLate ? 1 : 0),
  missingPunchCount: totals.missingPunchCount + (day.isScheduled && day.isMissingPunch ? 1 : 0),
  participantCount: totals.participantCount,
  scheduledDays: totals.scheduledDays + (day.isScheduled ? 1 : 0),
  workedMinutes: totals.workedMinutes + day.workedMinutes
});

const mergeTotals = (left: AttendanceReportTotals, right: AttendanceReportTotals): AttendanceReportTotals => ({
  abnormalRecordCount: left.abnormalRecordCount + right.abnormalRecordCount,
  absenceCount: left.absenceCount + right.absenceCount,
  actualAttendedDays: left.actualAttendedDays + right.actualAttendedDays,
  approvedMakeupCount: left.approvedMakeupCount + right.approvedMakeupCount,
  earlyLeaveCount: left.earlyLeaveCount + right.earlyLeaveCount,
  lateCount: left.lateCount + right.lateCount,
  missingPunchCount: left.missingPunchCount + right.missingPunchCount,
  participantCount: left.participantCount,
  scheduledDays: left.scheduledDays + right.scheduledDays,
  workedMinutes: left.workedMinutes + right.workedMinutes
});

const createWorkerParticipantBase = (member: WorkerMemberWithProfileAndTeam): AttendanceReportParticipantBase => ({
  displayName: null,
  memberId: member.id,
  memberStatus: member.status as MemberStatusValue,
  participantId: member.worker.id,
  participantType: "WORKER",
  phone: member.worker.phone,
  projectRoleLabel: member.projectRoleLabel,
  requiresAttendance: member.requiresAttendance,
  teamId: member.teamId,
  teamName: member.team?.name ?? null,
  workType: member.worker.workType
});

const createManagerParticipantBase = (member: ManagerMemberWithProfileAndTeam): AttendanceReportParticipantBase => ({
  displayName: member.manager.name,
  memberId: member.id,
  memberStatus: member.status as MemberStatusValue,
  participantId: member.manager.id,
  participantType: "MANAGER",
  phone: member.manager.phone,
  projectRoleLabel: member.roleCode,
  requiresAttendance: member.requiresAttendance,
  teamId: member.teamScopeId,
  teamName: member.teamScope?.name ?? null,
  workType: null
});

const createDailyParticipant = (
  participant: AttendanceReportParticipantBase,
  dayValues: AttendanceDayValues
): DailyAttendanceReportParticipant => ({
  ...participant,
  abnormalRecordCount: dayValues.abnormalRecordCount,
  approvedMakeupCount: dayValues.approvedMakeupCount,
  isAbsent: dayValues.isAbsent,
  isEarlyLeave: dayValues.isEarlyLeave,
  isLate: dayValues.isLate,
  isMissingPunch: dayValues.isMissingPunch,
  workedMinutes: dayValues.workedMinutes
});

const createRangeParticipant = (
  participant: AttendanceReportParticipantBase,
  totals: AttendanceReportTotals
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
  workedMinutes: totals.workedMinutes
});

@Injectable()
export class ReportsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getDailyReport(projectId: string, date: string): Promise<DailyAttendanceReportResponse> {
    const participants = await this.loadParticipants(projectId);

    return this.computeDailyReport(projectId, [projectId], participants, date);
  }

  async getWeeklyReport(projectId: string, weekStartDate: string): Promise<RangeAttendanceReportResponse> {
    const participants = await this.loadParticipants(projectId);
    const startDate = dateOnlyToDate(weekStartDate);
    const endDate = addDays(startDate, 6);

    return this.computeRangeReport(projectId, [projectId], participants, "WEEKLY", startDate, endDate);
  }

  async getMonthlyReport(projectId: string, month: string): Promise<RangeAttendanceReportResponse> {
    const participants = await this.loadParticipants(projectId);
    const startDate = getMonthStartDate(month);
    const endDate = getMonthEndDate(month);

    return this.computeRangeReport(projectId, [projectId], participants, "MONTHLY", startDate, endDate);
  }

  async getTeamDailyReport(teamId: string, date: string): Promise<DailyAttendanceReportResponse> {
    const { participants, projectId } = await this.loadTeamParticipantBases(teamId);

    return this.computeDailyReport(projectId, [projectId], participants, date);
  }

  async getTeamWeeklyReport(teamId: string, weekStartDate: string): Promise<RangeAttendanceReportResponse> {
    const { participants, projectId } = await this.loadTeamParticipantBases(teamId);
    const startDate = dateOnlyToDate(weekStartDate);
    const endDate = addDays(startDate, 6);

    return this.computeRangeReport(projectId, [projectId], participants, "WEEKLY", startDate, endDate);
  }

  async getTeamMonthlyReport(teamId: string, month: string): Promise<RangeAttendanceReportResponse> {
    const { participants, projectId } = await this.loadTeamParticipantBases(teamId);
    const startDate = getMonthStartDate(month);
    const endDate = getMonthEndDate(month);

    return this.computeRangeReport(projectId, [projectId], participants, "MONTHLY", startDate, endDate);
  }

  async getCompanyDailyReport(companyId: string, date: string): Promise<DailyAttendanceReportResponse> {
    const { participants, projectId, projectIds } = await this.loadCompanyParticipantBases(companyId);

    return this.computeDailyReport(projectId, projectIds, participants, date);
  }

  async getCompanyWeeklyReport(companyId: string, weekStartDate: string): Promise<RangeAttendanceReportResponse> {
    const { participants, projectId, projectIds } = await this.loadCompanyParticipantBases(companyId);
    const startDate = dateOnlyToDate(weekStartDate);
    const endDate = addDays(startDate, 6);

    return this.computeRangeReport(projectId, projectIds, participants, "WEEKLY", startDate, endDate);
  }

  async getCompanyMonthlyReport(companyId: string, month: string): Promise<RangeAttendanceReportResponse> {
    const { participants, projectId, projectIds } = await this.loadCompanyParticipantBases(companyId);
    const startDate = getMonthStartDate(month);
    const endDate = getMonthEndDate(month);

    return this.computeRangeReport(projectId, projectIds, participants, "MONTHLY", startDate, endDate);
  }

  private async computeDailyReport(
    reportProjectId: string,
    projectIds: readonly string[],
    participants: readonly AttendanceReportParticipantBase[],
    date: string
  ): Promise<DailyAttendanceReportResponse> {
    const reportDate = dateOnlyToDate(date);
    const [resultsByKey, schedules] = await Promise.all([
      this.loadResultsByKey(projectIds, reportDate, reportDate),
      this.loadProjectSchedules(projectIds)
    ]);
    const participantsWithDayValues = participants.map(
      (participant: AttendanceReportParticipantBase): DailyParticipantWithDayValues => ({
        dayValues: createDayValues(
          resultsByKey.get(createResultKey(participant.participantType, participant.participantId, reportDate)),
          isScheduledReportDate(schedules, reportDate)
        ),
        participant
      })
    );
    const reportParticipants = participantsWithDayValues.map(
      (participantWithDayValues: DailyParticipantWithDayValues): DailyAttendanceReportParticipant =>
        createDailyParticipant(participantWithDayValues.participant, participantWithDayValues.dayValues)
    );
    const totals = participantsWithDayValues.reduce(
      (currentTotals: AttendanceReportTotals, participantWithDayValues: DailyParticipantWithDayValues): AttendanceReportTotals =>
        addDayToTotals(currentTotals, participantWithDayValues.dayValues),
      createEmptyTotals(participants.length)
    );

    return {
      endDate: date,
      participants: reportParticipants,
      periodType: "DAILY",
      projectId: reportProjectId,
      startDate: date,
      totals
    };
  }

  private async computeRangeReport(
    reportProjectId: string,
    projectIds: readonly string[],
    participants: readonly AttendanceReportParticipantBase[],
    periodType: "MONTHLY" | "WEEKLY",
    startDate: Date,
    endDate: Date
  ): Promise<RangeAttendanceReportResponse> {
    const dates = listDatesInclusive(startDate, endDate);
    const [resultsByKey, schedules] = await Promise.all([
      this.loadResultsByKey(projectIds, startDate, endDate),
      this.loadProjectSchedules(projectIds)
    ]);
    const reportParticipants = participants.map((participant: AttendanceReportParticipantBase): RangeAttendanceReportParticipant => {
      const participantTotals = dates.reduce(
        (currentTotals: AttendanceReportTotals, reportDate: Date): AttendanceReportTotals =>
          addDayToTotals(
            currentTotals,
            createDayValues(
              resultsByKey.get(createResultKey(participant.participantType, participant.participantId, reportDate)),
              isScheduledReportDate(schedules, reportDate)
            )
          ),
        createEmptyTotals(1)
      );

      return createRangeParticipant(participant, participantTotals);
    });
    const totals = reportParticipants.reduce(
      (currentTotals: AttendanceReportTotals, participant: RangeAttendanceReportParticipant): AttendanceReportTotals =>
        mergeTotals(currentTotals, {
          abnormalRecordCount: participant.abnormalRecordCount,
          absenceCount: participant.absenceCount,
          actualAttendedDays: participant.actualAttendedDays,
          approvedMakeupCount: participant.approvedMakeupCount,
          earlyLeaveCount: participant.earlyLeaveCount,
          lateCount: participant.lateCount,
          missingPunchCount: participant.missingPunchCount,
          participantCount: currentTotals.participantCount,
          scheduledDays: participant.scheduledDays,
          workedMinutes: participant.workedMinutes
        }),
      createEmptyTotals(participants.length)
    );

    return {
      endDate: toDateOnly(endDate),
      participants: reportParticipants,
      periodType,
      projectId: reportProjectId,
      startDate: toDateOnly(startDate),
      totals
    };
  }

  private async loadParticipants(projectId: string): Promise<readonly AttendanceReportParticipantBase[]> {
    const project = await this.prisma.project.findUnique({
      where: {
        id: projectId
      }
    });

    if (project === null) {
      throw new NotFoundException({
        message: "REPORT_PROJECT_NOT_FOUND",
        projectId
      });
    }

    const [workerMembers, managerMembers] = await Promise.all([
      this.prisma.projectWorkerMember.findMany({
        include: {
          team: true,
          worker: true
        },
        orderBy: {
          createdAt: "asc"
        },
        where: {
          projectId,
          requiresAttendance: true,
          status: "ACTIVE"
        }
      }),
      this.prisma.projectManagerMember.findMany({
        include: {
          manager: true,
          teamScope: true
        },
        orderBy: {
          createdAt: "asc"
        },
        where: {
          projectId,
          requiresAttendance: true,
          status: "ACTIVE"
        }
      })
    ]);

    return [
      ...workerMembers.map(createWorkerParticipantBase),
      ...managerMembers.map(createManagerParticipantBase)
    ];
  }

  private async loadTeamParticipantBases(
    teamId: string
  ): Promise<{ readonly participants: readonly AttendanceReportParticipantBase[]; readonly projectId: string }> {
    const team = await this.prisma.team.findUnique({
      where: {
        id: teamId
      }
    });

    if (team === null) {
      throw new NotFoundException({ message: "REPORT_TEAM_NOT_FOUND", teamId });
    }

    const { projectId } = team;

    const [workerMembers, managerMembers] = await Promise.all([
      this.prisma.projectWorkerMember.findMany({
        include: {
          team: true,
          worker: true
        },
        orderBy: {
          createdAt: "asc"
        },
        where: {
          projectId,
          requiresAttendance: true,
          status: "ACTIVE",
          teamId
        }
      }),
      this.prisma.projectManagerMember.findMany({
        include: {
          manager: true,
          teamScope: true
        },
        orderBy: {
          createdAt: "asc"
        },
        where: {
          projectId,
          requiresAttendance: true,
          status: "ACTIVE",
          teamScopeId: teamId
        }
      })
    ]);

    return {
      participants: [
        ...workerMembers.map(createWorkerParticipantBase),
        ...managerMembers.map(createManagerParticipantBase)
      ],
      projectId
    };
  }

  private async loadCompanyParticipantBases(
    companyId: string
  ): Promise<{ readonly participants: readonly AttendanceReportParticipantBase[]; readonly projectId: string; readonly projectIds: readonly string[] }> {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });

    if (company === null) {
      throw new NotFoundException({ companyId, message: "REPORT_COMPANY_NOT_FOUND" });
    }

    const projects = await this.prisma.project.findMany({ select: { id: true }, where: { companyId } });

    if (projects.length === 0) {
      return { participants: [], projectId: companyId, projectIds: [] };
    }

    const projectIds = projects.map((p): string => p.id);

    const [workerMembers, managerMembers] = await Promise.all([
      this.prisma.projectWorkerMember.findMany({
        include: {
          team: true,
          worker: true
        },
        orderBy: {
          createdAt: "asc"
        },
        where: {
          projectId: { in: projectIds },
          requiresAttendance: true,
          status: "ACTIVE"
        }
      }),
      this.prisma.projectManagerMember.findMany({
        include: {
          manager: true,
          teamScope: true
        },
        orderBy: {
          createdAt: "asc"
        },
        where: {
          projectId: { in: projectIds },
          requiresAttendance: true,
          status: "ACTIVE"
        }
      })
    ]);

    return {
      participants: [
        ...workerMembers.map(createWorkerParticipantBase),
        ...managerMembers.map(createManagerParticipantBase)
      ],
      projectId: companyId,
      projectIds
    };
  }

  private async loadResultsByKey(projectIds: readonly string[], startDate: Date, endDate: Date): Promise<ReadonlyMap<string, AttendanceResult>> {
    const results = await this.prisma.attendanceResult.findMany({
      where: {
        attendanceDate: {
          gte: startDate,
          lte: endDate
        },
        projectId: { in: projectIds as string[] }
      }
    });
    const resultsByKey = new Map<string, AttendanceResult>();

    for (const result of results) {
      resultsByKey.set(createResultKey(result.participantType, result.participantId, result.attendanceDate), result);
    }

    return resultsByKey;
  }

  private async loadProjectSchedules(projectIds: readonly string[]): Promise<readonly Schedule[]> {
    return this.prisma.schedule.findMany({
      orderBy: {
        startsOn: "desc"
      },
      where: {
        ownerId: { in: projectIds as string[] },
        ownerType: projectScheduleOwnerType
      }
    });
  }
}
