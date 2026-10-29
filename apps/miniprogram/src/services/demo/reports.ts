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
  const summary = summarizeScheduledAttendance(
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
  date <= chinaToday() &&
  demoMemberEligible(demoMemberOn(state, person, date), date) &&
  effectiveDemoPlan(state, person, date).isWorkday;

export const dailyPerson = (
  state: DemoState,
  person: ProjectParticipant,
  date: string,
): DailyReportParticipant => {
  const historical = demoMemberOn(state, person, date);
  const result = demoDaySummary(state, historical, date);
  const isScheduled = scheduled(state, person, date);
  return {
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
    isAbsent: isScheduled && result.isAbsent,
    isMissingPunch: isScheduled && result.isMissingPunch,
    isLate: isScheduled && result.isLate,
    isEarlyLeave: isScheduled && result.isEarlyLeave,
    workedMinutes: isScheduled ? result.workedMinutes : 0,
  };
};
export const demoReport = (
  state: DemoState,
  people: readonly ProjectParticipant[],
  scopeId: string,
  period: string,
  start: string,
  end: string,
  teamId: string | null,
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
      .filter((id) => teamId === null || id === teamId)
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
      const days = datesInTeam.map((date) => dailyPerson(state, person, date));
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
    },
  );
  return period === "daily"
    ? {
        projectId: scopeId,
        periodType: "DAILY",
        startDate: start,
        endDate: end,
        participants: people
          .filter(
            (person) =>
              (teamId === null ||
                demoMemberOn(state, person, start).teamId === teamId) &&
              start <= chinaToday() &&
              demoMemberEligible(demoMemberOn(state, person, start), start),
          )
          .map((person) => dailyPerson(state, person, start)),
        totals,
      }
    : {
        projectId: scopeId,
        periodType: period === "weekly" ? "WEEKLY" : "MONTHLY",
        startDate: start,
        endDate: end,
        participants,
        totals,
      };
};
