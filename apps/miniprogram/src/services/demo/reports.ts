import {
  classifyWorktime,
  worktimeChinaDate,
  resolveWorktimeRule,
  scheduledWorkIntervals,
  taskWorkIntervals,
  overtimeWorkIntervals,
  type ClassifiedWorktime,
} from "@construction/domain";
import { demoSafetySummaries, demoSafetyReportEvents } from "./safety-credit";
import { demoMemberOn, demoMemberEligible } from "./member-history";
import {
  summarizeScheduledAttendance,
  type AttendanceRecordInput,
  type FlexibleAttendanceSummary,
} from "@construction/domain/attendance.js";
import { effectiveDemoPlan } from "./plans";
import type {
  DailyReport,
  DailyReportParticipant,
  ProjectParticipant,
  RangeReport,
  ReportTotals,
} from "../management.types";
import type { AttendanceResultSummary } from "../me.types";
import type { DemoState } from "./state";
import { chinaToday } from "../time";
import { demoTaskSummary } from "./task-attendance";

export const demoWorktime = (
  state: DemoState,
  person: ProjectParticipant,
  date: string,
): ClassifiedWorktime => {
  const now = new Date();
  const rule = resolveWorktimeRule(
    (state.worktimeRules ?? []).filter(
      (row) => row.projectId === person.projectId,
    ),
    date,
  );
  const records: readonly AttendanceRecordInput[] = [
    ...state.records
      .filter(
        (row) =>
          row.projectId === person.projectId &&
          row.participantId === person.profileId,
      )
      .map((row) => ({
        id: row.id,
        pointCode: row.pointCode,
        occurredAt: new Date(row.occurredAt),
        isValid: row.status === "VALID",
        source: "DEVICE" as const,
      })),
    ...state.makeups
      .filter(
        (row) =>
          row.projectId === person.projectId &&
          row.participantId === person.profileId &&
          row.status === "APPROVED",
      )
      .map((row) => ({
        id: row.id,
        pointCode: row.pointCode,
        occurredAt: new Date(row.requestedOccurredAt),
        isValid: true,
        source: "MAKEUP" as const,
      })),
  ];
  const historical = demoMemberOn(state, person, date);
  return classifyWorktime(
    [
      ...(historical.taskAttendanceOnly
        ? taskWorkIntervals(
            (state.teamWork?.tasks ?? []).flatMap((task) =>
              task.assignments
                .filter((row) => row.memberId === person.memberId)
                .map((row) => ({
                  startsAt: new Date(task.startsAt),
                  endsAt: new Date(task.endsAt),
                  cancelled: task.status === "CANCELLED",
                  startedAt: row.startedAt ? new Date(row.startedAt) : null,
                  finishedAt: row.finishedAt ? new Date(row.finishedAt) : null,
                })),
            ),
          )
        : scheduledWorkIntervals(
            effectiveDemoPlan(state, person, date).points,
            date,
            records.filter((row) => worktimeChinaDate(row.occurredAt) === date),
            now,
            rule.config.projectKind === "REPAIR" ? "HOURLY" : "REGULAR",
          )),
      ...overtimeWorkIntervals(records),
    ],
    date,
    rule,
    now,
  );
};
export const reportAsOf = (date: string): Date =>
  new Date(Math.min(Date.now(), Date.parse(`${date}T23:59:59.999+08:00`)));

export const demoDaySummary = (
  state: DemoState,
  person: ProjectParticipant,
  date: string,
): AttendanceResultSummary & FlexibleAttendanceSummary => {
  const records = state.records.filter(
    (row) =>
      row.projectId === person.projectId &&
      row.participantId === person.profileId &&
      row.attendanceDate === date &&
      row.status === "VALID",
  );
  const makeups: readonly AttendanceRecordInput[] = state.makeups
    .filter(
      (row) =>
        row.projectId === person.projectId &&
        row.participantId === person.profileId &&
        row.attendanceDate === date &&
        row.status === "APPROVED",
    )
    .map((row) => ({
      id: row.id,
      pointCode: row.pointCode,
      occurredAt: new Date(row.requestedOccurredAt),
      source: "MAKEUP",
      isValid: true,
    }));
  const plan = effectiveDemoPlan(state, person, date);
  const summary = person.taskAttendanceOnly
    ? { ...demoTaskSummary(state, person, date), selectedRecords: {} }
    : summarizeScheduledAttendance(
        plan.points,
        date,
        [
          ...records.map(
            (row): AttendanceRecordInput => ({
              id: row.id,
              pointCode: row.pointCode,
              occurredAt: new Date(row.occurredAt),
              source: "DEVICE",
              isValid: true,
            }),
          ),
          ...makeups,
        ],
        new Date(),
      );
  return {
    ...summary,
    projectId: person.projectId,
    participantId: person.profileId,
    participantType: person.participantType,
    attendanceDate: date,
  };
};
const attended = (
  state: DemoState,
  person: ProjectParticipant,
  date: string,
): boolean => {
  if (person.taskAttendanceOnly)
    return demoTaskSummary(state, person, date).hasResult;
  if (demoWorktime(state, person, date).workedMinutes > 0) return true;
  const points = effectiveDemoPlan(state, person, date).points;
  return (
    state.records.some(
      (row) =>
        row.projectId === person.projectId &&
        row.participantId === person.profileId &&
        row.attendanceDate === date &&
        row.status === "VALID" &&
        points.some((point) => point.code === row.pointCode),
    ) ||
    state.makeups.some(
      (row) =>
        row.projectId === person.projectId &&
        row.participantId === person.profileId &&
        row.attendanceDate === date &&
        row.status === "APPROVED" &&
        points.some((point) => point.code === row.pointCode),
    )
  );
};
export const scheduled = (
  state: DemoState,
  person: ProjectParticipant,
  date: string,
): boolean =>
  person.taskAttendanceOnly
    ? date <= chinaToday() && demoTaskSummary(state, person, date).isScheduled
    : date <= chinaToday() &&
      demoMemberEligible(demoMemberOn(state, person, date), date) &&
      effectiveDemoPlan(state, person, date).isWorkday;

export const dailyPersonAt = (
  state: DemoState,
  person: ProjectParticipant,
  date: string,
  asOf: Date,
): DailyReportParticipant => {
  const historical = demoMemberOn(state, person, date);
  const result = demoDaySummary(state, historical, date);
  const isScheduled = scheduled(state, person, date);
  const worktime = demoWorktime(state, person, date);
  const now = new Date();
  const credit =
    person.participantType === "WORKER"
      ? demoSafetySummaries(state, [person.profileId], asOf, now).get(
          person.profileId,
        )
      : undefined;
  const violations = demoSafetyReportEvents(
    state,
    [person.projectId],
    [person.profileId],
    date,
    date,
    asOf,
    now,
  ).filter(
    (event) =>
      event.memberId === person.memberId && event.teamId === historical.teamId,
  );
  const rule = resolveWorktimeRule(
    (state.worktimeRules ?? []).filter(
      (row) => row.projectId === person.projectId,
    ),
    date,
  );
  return {
    projectId: person.projectId,
    projectKind: rule.config.projectKind,
    isTemporary: historical.taskAttendanceOnly === true,
    safetyCreditScore: credit?.score ?? null,
    safetyCreditAsOf: credit?.asOf ?? null,
    projectName: state.projects.find(
      (project) => project.id === person.projectId,
    )!.name,
    evaluation:
      state.evaluations?.find(
        (e) =>
          e.projectId === person.projectId && e.memberId === person.memberId,
      )?.evaluation ?? null,
    displayName: person.displayName,
    memberId: person.memberId,
    memberStatus: historical.status,
    participantId: person.profileId,
    participantType: person.participantType,
    phone: person.phone,
    projectRoleLabel: person.projectRoleLabel,
    requiresAttendance: person.requiresAttendance,
    teamId: historical.teamId,
    teamName: historical.teamName,
    workType: historical.workType,
    abnormalRecordCount: state.records.filter(
      (r) =>
        r.participantId === person.profileId &&
        r.projectId === person.projectId &&
        r.attendanceDate === date &&
        r.status === "INVALID",
    ).length,
    approvedMakeupCount: state.makeups.filter(
      (r) =>
        r.participantId === person.profileId &&
        r.projectId === person.projectId &&
        r.attendanceDate === date &&
        r.status === "APPROVED",
    ).length,
    isAbsent: isScheduled && result.isAbsent && worktime.workedMinutes === 0,
    isMissingPunch:
      (isScheduled && result.isMissingPunch) ||
      (date < chinaToday() && worktime.isPendingVerification),
    isLate: isScheduled && result.isLate,
    isEarlyLeave: isScheduled && result.isEarlyLeave,
    workedMinutes: worktime.workedMinutes,
    normalMinutes: worktime.normalMinutes,
    overtimeMinutes: worktime.overtimeMinutes,
    unclassifiedMinutes: worktime.unclassifiedMinutes,
    confirmedViolationCount: violations.filter(
      (event) => event.status === "CONFIRMED",
    ).length,
  };
};
export const dailyPerson = (
  state: DemoState,
  person: ProjectParticipant,
  date: string,
): DailyReportParticipant =>
  dailyPersonAt(state, person, date, reportAsOf(date));

export const demoReport = (
  state: DemoState,
  people: readonly ProjectParticipant[],
  scopeId: string,
  period: string,
  start: string,
  end: string,
  teamIds: readonly string[] | null,
): DailyReport | RangeReport => {
  const dates: readonly string[] = Array.from(
    {
      length: Math.max(
        1,
        Math.min(
          31,
          Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1,
        ),
      ),
    },
    (_, index) =>
      new Date(Date.parse(`${start}T00:00:00Z`) + index * 86400000)
        .toISOString()
        .slice(0, 10),
  );
  const scoped = people.flatMap((person) => {
    const teamIds = [
      ...new Set(dates.map((date) => demoMemberOn(state, person, date).teamId)),
    ];
    return teamIds
      .filter((id) => teamIds === null || (id !== null && teamIds.includes(id)))
      .map((id) => ({ person, id }));
  });
  const participants = scoped
    .map(({ person, id }) => {
      const datesInTeam = dates.filter(
        (date) =>
          demoMemberOn(state, person, date).teamId === id &&
          date <= chinaToday() &&
          demoMemberEligible(demoMemberOn(state, person, date), date),
      );
      const days = datesInTeam.map((date) =>
        dailyPersonAt(state, person, date, reportAsOf(end)),
      );
      return {
        ...days[0],
        scheduledDays: datesInTeam.filter((date) =>
          scheduled(state, person, date),
        ).length,
        actualAttendedDays: datesInTeam.filter(
          (date) =>
            scheduled(state, person, date) && attended(state, person, date),
        ).length,
        absenceCount: days.filter((day) => day.isAbsent).length,
        missingPunchCount: days.filter((day) => day.isMissingPunch).length,
        lateCount: days.filter((day) => day.isLate).length,
        earlyLeaveCount: days.filter((day) => day.isEarlyLeave).length,
        abnormalRecordCount: days.reduce(
          (sum, day) => sum + day.abnormalRecordCount,
          0,
        ),
        approvedMakeupCount: days.reduce(
          (sum, day) => sum + day.approvedMakeupCount,
          0,
        ),
        workedMinutes: days.reduce((sum, day) => sum + day.workedMinutes, 0),
        normalMinutes: days.reduce((sum, day) => sum + day.normalMinutes, 0),
        overtimeMinutes: days.reduce(
          (sum, day) => sum + day.overtimeMinutes,
          0,
        ),
        unclassifiedMinutes: days.reduce(
          (sum, day) => sum + day.unclassifiedMinutes,
          0,
        ),
        confirmedViolationCount: days.reduce(
          (sum, day) => sum + day.confirmedViolationCount,
          0,
        ),
      };
    })
    .filter((row) => row.memberId !== undefined);
  const totals: ReportTotals = participants.reduce(
    (sum, row) => ({
      participantCount: sum.participantCount,
      scheduledDays: sum.scheduledDays + row.scheduledDays,
      actualAttendedDays: sum.actualAttendedDays + row.actualAttendedDays,
      absenceCount: sum.absenceCount + row.absenceCount,
      missingPunchCount: sum.missingPunchCount + row.missingPunchCount,
      lateCount: sum.lateCount + row.lateCount,
      earlyLeaveCount: sum.earlyLeaveCount + row.earlyLeaveCount,
      approvedMakeupCount: sum.approvedMakeupCount + row.approvedMakeupCount,
      abnormalRecordCount: sum.abnormalRecordCount + row.abnormalRecordCount,
      workedMinutes: sum.workedMinutes + row.workedMinutes,
      normalMinutes: sum.normalMinutes + row.normalMinutes,
      overtimeMinutes: sum.overtimeMinutes + row.overtimeMinutes,
      unclassifiedMinutes: sum.unclassifiedMinutes + row.unclassifiedMinutes,
      confirmedViolationCount:
        sum.confirmedViolationCount + row.confirmedViolationCount,
    }),
    {
      participantCount: new Set(participants.map((row) => row.memberId)).size,
      scheduledDays: 0,
      actualAttendedDays: 0,
      absenceCount: 0,
      missingPunchCount: 0,
      lateCount: 0,
      earlyLeaveCount: 0,
      approvedMakeupCount: 0,
      abnormalRecordCount: 0,
      workedMinutes: 0,
      normalMinutes: 0,
      overtimeMinutes: 0,
      unclassifiedMinutes: 0,
      confirmedViolationCount: 0,
    },
  );
  return period.toLowerCase() === "daily"
    ? {
        projectId: scopeId,
        periodType: "DAILY",
        startDate: start,
        endDate: end,
        participants: people
          .filter(
            (person) =>
              (teamIds === null ||
                teamIds.includes(demoMemberOn(state, person, start).teamId ?? "")) &&
              start <= chinaToday() &&
              demoMemberEligible(demoMemberOn(state, person, start), start),
          )
          .map((person) =>
            dailyPersonAt(state, person, start, reportAsOf(end)),
          ),
        totals,
      }
    : {
        projectId: scopeId,
        periodType: period.toLowerCase() === "weekly" ? "WEEKLY" : "MONTHLY",
        startDate: start,
        endDate: end,
        participants,
        totals,
      };
};
