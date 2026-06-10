export type ParticipantType = "WORKER" | "MANAGER";
export type MemberStatus = "ACTIVE" | "EXITED" | "SUSPENDED";

export type ProjectParticipant = {
  readonly displayName: string | null;
  readonly memberId: string;
  readonly participantType: ParticipantType;
  readonly phone: string;
  readonly profileId: string;
  readonly projectId: string;
  readonly projectRoleLabel: string;
  readonly requiresAttendance: boolean;
  readonly status: MemberStatus;
  readonly teamId: string | null;
  readonly teamName: string | null;
};

export type ReportTotals = {
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

export type ReportParticipantBase = {
  readonly displayName: string | null;
  readonly memberId: string;
  readonly memberStatus: MemberStatus;
  readonly participantId: string;
  readonly participantType: ParticipantType;
  readonly phone: string;
  readonly projectRoleLabel: string;
  readonly requiresAttendance: boolean;
  readonly teamId: string | null;
  readonly teamName: string | null;
  readonly workType: string | null;
};

export type DailyReportParticipant = ReportParticipantBase & {
  readonly abnormalRecordCount: number;
  readonly approvedMakeupCount: number;
  readonly isAbsent: boolean;
  readonly isEarlyLeave: boolean;
  readonly isLate: boolean;
  readonly isMissingPunch: boolean;
  readonly workedMinutes: number;
};

export type RangeReportParticipant = ReportParticipantBase & Omit<ReportTotals, "participantCount">;

export type DailyReport = {
  readonly endDate: string;
  readonly participants: ReadonlyArray<DailyReportParticipant>;
  readonly periodType: "DAILY";
  readonly projectId: string;
  readonly startDate: string;
  readonly totals: ReportTotals;
};

export type RangeReport = {
  readonly endDate: string;
  readonly participants: ReadonlyArray<RangeReportParticipant>;
  readonly periodType: "WEEKLY" | "MONTHLY";
  readonly projectId: string;
  readonly startDate: string;
  readonly totals: ReportTotals;
};
