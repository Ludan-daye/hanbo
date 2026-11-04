export const ATTENDANCE_SAFETY_VERSION = "attendance-safety-v1";
export const ATTENDANCE_SAFETY_TEXT =
  "进入作业区请正确佩戴安全帽和岗位要求的防护用品，遵守现场安全交底；遇到未排除的危险或身体不适，请停止作业并报告班组长。特种作业应由具备相应资格的人员操作。";

export type AttendanceSafetyNotice = {
  readonly projectId: string;
  readonly teamId: string | null;
  readonly attendanceDate: string;
  readonly pointCode: string;
  readonly baselineVersion: string;
  readonly baselineText: string;
  readonly briefings: readonly {
    readonly id: string;
    readonly title: string;
    readonly content: string;
    readonly publishedAt: string;
  }[];
};
export type ConfirmAttendanceSafety = {
  readonly pointCode: string;
  readonly baselineVersion: string;
  readonly briefingIds: readonly string[];
};
export type AttendanceSafetyReceipt = {
  readonly id: string;
  readonly confirmedAt: string;
  readonly expiresAt: string;
};
