import type { ProfileOwnerTypeValue } from "../attendance/attendance.types.js";
import type { MemberStatusValue } from "../management/management.types.js";

export type ReportPeriodType = "DAILY" | "MONTHLY" | "WEEKLY";

export type AttendanceReportTotals = {
  readonly abnormalRecordCount: number;
  readonly absenceCount: number;
  readonly actualAttendedDays: number;
  readonly approvedMakeupCount: number;
  readonly earlyLeaveCount: number;
  readonly lateCount: number;
  readonly missingPunchCount: number;
  readonly participantCount: number;
  readonly scheduledDays: number;
  readonly workedMinutes: number;
};

export type AttendanceReportParticipantBase = {
  readonly displayName: string | null;
  readonly memberId: string;
  readonly memberStatus: MemberStatusValue;
  readonly participantId: string;
  readonly participantType: ProfileOwnerTypeValue;
  readonly phone: string;
  readonly projectRoleLabel: string;
  readonly requiresAttendance: boolean;
  readonly teamId: string | null;
  readonly teamName: string | null;
  readonly workType: string | null;
};

export type DailyAttendanceReportParticipant = AttendanceReportParticipantBase & {
  readonly abnormalRecordCount: number;
  readonly approvedMakeupCount: number;
  readonly isAbsent: boolean;
  readonly isEarlyLeave: boolean;
  readonly isLate: boolean;
  readonly isMissingPunch: boolean;
  readonly workedMinutes: number;
};

export type RangeAttendanceReportParticipant = AttendanceReportParticipantBase &
  Omit<AttendanceReportTotals, "participantCount">;

export type DailyAttendanceReportResponse = {
  readonly endDate: string;
  readonly participants: readonly DailyAttendanceReportParticipant[];
  readonly periodType: "DAILY";
  readonly projectId: string;
  readonly startDate: string;
  readonly totals: AttendanceReportTotals;
};

export type RangeAttendanceReportResponse = {
  readonly endDate: string;
  readonly participants: readonly RangeAttendanceReportParticipant[];
  readonly periodType: "MONTHLY" | "WEEKLY";
  readonly projectId: string;
  readonly startDate: string;
  readonly totals: AttendanceReportTotals;
};
