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

export type RangeReportParticipant = ReportParticipantBase &
  Omit<ReportTotals, "participantCount">;

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

export type ProjectStatus = "PREPARING" | "ACTIVE" | "SUSPENDED" | "COMPLETED";

export type CompanyProject = {
  readonly id: string;
  readonly companyId: string;
  readonly name: string;
  readonly status: ProjectStatus;
  readonly address: string;
  readonly centerLatitude: string;
  readonly centerLongitude: string;
  readonly geofenceRadiusM: number;
  readonly plannedStartDate: string;
  readonly plannedEndDate: string | null;
};

export type CompanyParticipant = ProjectParticipant & {
  readonly projectName: string;
};

export type ProjectTeam = {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly status: string;
};

export type BindingInvitationStatus =
  | "PENDING"
  | "ACCEPTED"
  | "EXPIRED"
  | "REVOKED";
export type BindingTargetType = "WORKER" | "MANAGER";

export type ProjectInvitation = {
  readonly id: string;
  readonly targetType: BindingTargetType;
  readonly profileId: string;
  readonly projectId: string;
  readonly status: BindingInvitationStatus;
  readonly expiresAt: string;
  readonly createdAt: string;
  readonly acceptedByUserId: string | null;
};

export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type ShiftSegment = {
  readonly sequence: 1 | 2;
  readonly startTime: string;
  readonly endTime: string;
  readonly lateGraceMins: number;
  readonly earlyGraceMins: number;
};

export type DefaultShiftBody = {
  readonly name: string;
  readonly segments: readonly [ShiftSegment, ShiftSegment];
};

export type DefaultScheduleBody = {
  readonly startsOn: string;
  readonly endsOn: string | null;
  readonly workdays: readonly IsoWeekday[];
};

export type DefaultAttendanceConfiguration = {
  readonly shift: (DefaultShiftBody & { readonly id: string }) | null;
  readonly schedule:
    | (DefaultScheduleBody & { readonly shiftId: string })
    | null;
};

export type CreateProjectBody = {
  readonly name: string;
  readonly address: string;
  readonly centerLatitude: string;
  readonly centerLongitude: string;
  readonly geofenceRadiusM: number;
  readonly status: ProjectStatus;
  readonly plannedStartDate: string;
  readonly plannedEndDate: string | null;
};
