import type {
  DailyReport,
  DailyReportParticipant,
  ProjectParticipant,
  RangeReport,
  ReportTotals,
} from "../management.types";
import type { AttendanceResultSummary } from "../me.types";
import type { DemoState } from "./state";
import { effectiveDemoConfiguration } from "./configuration";
import { chinaToday } from "../time";
import { DEMO_POINT_CODES } from "./state";

export const demoDaySummary = (
  state: DemoState,
  person: ProjectParticipant,
  date: string,
): AttendanceResultSummary => {
  const records = state.records.filter(
    (row) =>
      row.projectId === person.projectId &&
      row.participantId === person.profileId &&
      row.attendanceDate === date &&
      row.status === "VALID",
  );
  const times: readonly (number | null)[] = DEMO_POINT_CODES.map((code) => {
    const record = records.find((row) => row.pointCode === code);
    const makeup = state.makeups.find(
      (row) =>
        row.projectId === person.projectId &&
        row.participantId === person.profileId &&
        row.attendanceDate === date &&
        row.pointCode === code &&
        row.status === "APPROVED",
    );
    return record
      ? Date.parse(record.occurredAt)
      : makeup
        ? Date.parse(makeup.requestedOccurredAt)
        : null;
  });
  const segmentMinutes = (start: number | null, end: number | null): number =>
    start !== null && end !== null ? Math.max(0, (end - start) / 60000) : 0;
  const config = effectiveDemoConfiguration(state, person, date);
  const shift = config?.shift;
  const hasAny = times.some((time) => time !== null);
  return {
    projectId: person.projectId,
    participantId: person.profileId,
    participantType: person.participantType,
    attendanceDate: date,
    isAbsent: !hasAny,
    isMissingPunch: times.some((time) => time === null),
    isLate:
      times[0] !== null &&
      shift !== undefined &&
      shift !== null &&
      times[0] >
        Date.parse(`${date}T${shift.segments[0].startTime}:00+08:00`) +
          shift.segments[0].lateGraceMins * 60000,
    isEarlyLeave:
      times[3] !== null &&
      shift !== undefined &&
      shift !== null &&
      times[3] <
        Date.parse(`${date}T${shift.segments[1].endTime}:00+08:00`) -
          shift.segments[1].earlyGraceMins * 60000,
    workedMinutes:
      segmentMinutes(times[0], times[1]) + segmentMinutes(times[2], times[3]),
  };
};
const scheduled = (
  state: DemoState,
  person: ProjectParticipant,
  date: string,
): boolean => {
  const schedule = effectiveDemoConfiguration(state, person, date)?.schedule;
  if (
    date > chinaToday() ||
    !person.requiresAttendance ||
    person.status !== "ACTIVE" ||
    !schedule
  )
    return false;
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
  return (
    date >= schedule.startsOn &&
    (schedule.endsOn === null || date <= schedule.endsOn) &&
    schedule.workdays.some((day) => day === weekday)
  );
};
const dailyPerson = (
  state: DemoState,
  person: ProjectParticipant,
  date: string,
): DailyReportParticipant => {
  const result = demoDaySummary(state, person, date);
  const isScheduled = scheduled(state, person, date);
  return {
    displayName: person.displayName,
    memberId: person.memberId,
    memberStatus: person.status,
    participantId: person.profileId,
    participantType: person.participantType,
    phone: person.phone,
    projectRoleLabel: person.projectRoleLabel,
    requiresAttendance: person.requiresAttendance,
    teamId: person.teamId,
    teamName: person.teamName,
    workType:
      person.participantType === "WORKER" ? person.projectRoleLabel : null,
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
  const participants = people.map((person) => {
    const days = dates.map((date) => dailyPerson(state, person, date));
    return {
      ...days[0],
      scheduledDays: dates.filter((date) => scheduled(state, person, date))
        .length,
      actualAttendedDays: dates.filter(
        (date) =>
          scheduled(state, person, date) &&
          !demoDaySummary(state, person, date).isAbsent,
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
  });
  const totals: ReportTotals = participants.reduce(
    (sum, row) => ({
      participantCount: sum.participantCount + 1,
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
      participantCount: 0,
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
        participants: people.map((person) => dailyPerson(state, person, start)),
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
