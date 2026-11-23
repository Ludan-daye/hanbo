import type { ProfileOwnerTypeValue } from "../attendance/attendance.types.js";
import type { MemberStatusValue } from "../management/management.types.js";

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
  readonly normalMinutes: number;
  readonly overtimeMinutes: number;
  readonly unclassifiedMinutes: number;
  readonly confirmedViolationCount: number;
};

export type AttendanceReportParticipantBase = {
  readonly projectKind: "REGULAR" | "REPAIR";
  readonly isTemporary: boolean;
  readonly safetyCreditScore: number | null;
  readonly safetyCreditAsOf: string | null;
  readonly projectName: string;
  readonly evaluation: ProjectEvaluation | null;
  readonly projectId: string;
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
  /** Current leader of the person's team on that day's team, when it has one. */
  readonly teamLeaderName: string | null;
  readonly workType: string | null;
};

export type DailyAttendanceReportParticipant =
  AttendanceReportParticipantBase & {
    readonly abnormalRecordCount: number;
    readonly approvedMakeupCount: number;
    readonly isAbsent: boolean;
    readonly isEarlyLeave: boolean;
    readonly isLate: boolean;
    readonly isMissingPunch: boolean;
    /** Counted as 到岗: scheduled (应到) with a valid punch and not absent. */
    readonly isPresent: boolean;
    /** Counted in 应到 for the day. */
    readonly isScheduled: boolean;
    readonly workedMinutes: number;
    readonly normalMinutes: number;
    readonly overtimeMinutes: number;
    readonly unclassifiedMinutes: number;
    readonly confirmedViolationCount: number;
  };

/**
 * One day's headcount that always reconciles: expected = present + notArrived + waiting.
 * notArrived is 应到 people with a card already due and no valid punch (未到); waiting is
 * 应到 people whose first card is not due yet. A present person who missed a later card
 * stays in present (the report's 缺卡 flag still shows it).
 */
export type DailyHeadcount = {
  readonly expected: number;
  readonly notArrived: number;
  readonly present: number;
  readonly waiting: number;
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

export type ProjectEvaluation = {
  readonly id: string;
  readonly score: number;
  readonly comment: string | null;
  readonly reviewerName: string;
  readonly reviewedAt: string;
  readonly updatedAt: string;
};
export type ReportPersonDay = {
  readonly date: string;
  readonly teamName: string | null;
  readonly planName: string;
  readonly worktimeRuleVersion: number;
  readonly isPendingVerification: boolean;
  readonly isScheduled: boolean;
  readonly workedMinutes: number;
  readonly normalMinutes: number;
  readonly overtimeMinutes: number;
  readonly unclassifiedMinutes: number;
  readonly confirmedViolationCount: number;
  readonly flags: readonly string[];
  readonly points: readonly {
    readonly code: string;
    readonly label: string;
    readonly time: string;
    readonly graceMins: number;
  }[];
  readonly records: readonly {
    readonly id: string;
    readonly pointCode: string;
    readonly occurredAt: string;
    readonly isValid: boolean;
    readonly source: string;
    readonly latitude: string | null;
    readonly longitude: string | null;
    readonly locationAccuracyM: string | null;
    readonly geofenceDistanceM: string | null;
  }[];
  readonly makeups: readonly {
    readonly id: string;
    readonly pointLabel: string;
    readonly requestedOccurredAt: string;
    readonly status: string;
    readonly reason: string;
    readonly approvalReason: string | null;
    readonly approverName: string | null;
    readonly approvedAt: string | null;
  }[];
};
export type ReportPersonDetail = {
  readonly person: AttendanceReportParticipantBase;
  readonly canEvaluate: boolean;
  readonly startDate: string;
  readonly endDate: string;
  readonly days: readonly ReportPersonDay[];
};

/** Optional team or 组长 filter on project and company reports (at most one). */
export type ReportTeamFilter = {
  readonly leaderMemberId: string | null;
  readonly teamId: string | null;
};
export const NO_TEAM_FILTER: ReportTeamFilter = {
  leaderMemberId: null,
  teamId: null,
};
export type ReportTeamOption = {
  readonly leaderMemberId: string | null;
  readonly leaderName: string | null;
  readonly projectId: string;
  readonly projectName: string;
  readonly status: string;
  readonly teamId: string;
  readonly teamName: string;
};
