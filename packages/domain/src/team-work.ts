import type { ScheduledAttendancePoint } from "./attendance.js";

export type TeamTaskWorker = {
  readonly memberId: string;
  readonly name: string;
  readonly workType: string;
  readonly phoneMasked: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly teamId: string;
  readonly teamName: string;
};

export type TeamTaskInput = {
  readonly title: string;
  readonly description: string;
  readonly workType: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly memberIds: readonly string[];
};
export type TeamTaskDetails = Omit<TeamTaskInput, "memberIds">;
export type TeamTaskDefaults = {
  readonly workType: string;
  readonly name: string;
  readonly isWorkday: boolean;
  readonly points: readonly ScheduledAttendancePoint[];
};
export type TeamTaskTemplate = TeamTaskDetails & {
  readonly id: string;
  readonly memberIds: readonly string[];
  readonly previousMemberCount: number;
};
export type TeamTaskTemplatePage = {
  readonly items: readonly TeamTaskTemplate[];
  readonly nextCursor: string | null;
};
export type SavedTeamDailySummary = {
  readonly snapshot: TeamDailySummary | null;
};
export type SafetyIssuePage = {
  readonly items: readonly SafetyIssue[];
  readonly nextCursor: string | null;
};
export type TeamTask = Omit<TeamTaskInput, "memberIds"> & {
  readonly id: string;
  readonly teamId: string;
  readonly teamName: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly supervisorName: string;
  readonly status: "OPEN" | "COMPLETED" | "CANCELLED";
  readonly assignments: readonly {
    readonly memberId: string;
    readonly name: string;
    readonly source: string;
    readonly taskAttendanceOnly?: boolean | undefined;
    readonly startedAt?: string | null | undefined;
    readonly finishedAt?: string | null | undefined;
    readonly workedMinutes?: number | undefined;
    readonly exitConfirmedAt?: string | null | undefined;
  }[];
};
export type TaskInvitationInput = {
  readonly realName: string;
  readonly phone: string;
};
export type TaskInvitation = {
  readonly id: string;
  readonly taskId: string;
  readonly name: string;
  readonly phoneMasked: string;
  readonly expiresAt: string;
  readonly status: "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";
};
export type NewTaskInvitation = TaskInvitation & { readonly code: string };
export type TaskJoinResult = {
  readonly taskId: string;
  readonly projectId: string;
  readonly memberId: string;
};
export type SafetyBriefingInput = {
  readonly workDate: string;
  readonly title: string;
  readonly content: string;
};
export type SafetyBriefing = SafetyBriefingInput & {
  readonly id: string;
  readonly teamId: string;
  readonly teamName: string;
  readonly projectName: string;
  readonly acknowledged: boolean;
  readonly acknowledgements: readonly {
    readonly memberId: string;
    readonly name: string;
    readonly acknowledgedAt: string;
  }[];
};
export type SafetyIssueInput = {
  readonly workDate: string;
  readonly memberId: string | null;
  readonly description: string;
  readonly severity: "GENERAL" | "SERIOUS";
};
export type SafetyIssue = SafetyIssueInput & {
  readonly id: string;
  readonly memberName: string | null;
  readonly resolution: string | null;
  readonly resolvedAt: string | null;
};
export type TeamDailySummary = {
  readonly teamId: string;
  readonly teamName: string;
  readonly projectName: string;
  readonly workDate: string;
  readonly generatedAt: string;
  readonly taskCount: number;
  readonly completedTaskCount: number;
  readonly cancelledTaskCount: number;
  readonly temporaryWorkerCount: number;
  readonly briefingCount: number;
  readonly acknowledgementCount: number;
  readonly openIssueCount: number;
  readonly resolvedIssueCount: number;
  readonly actualAttendedDays: number;
  readonly workedMinutes: number;
  readonly missingPunchCount: number;
  readonly tasks: readonly TeamTask[];
  readonly people: readonly {
    readonly name: string;
    readonly workedMinutes: number;
    readonly flags: readonly string[];
  }[];
};
