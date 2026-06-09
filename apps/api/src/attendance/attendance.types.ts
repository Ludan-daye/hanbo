import type { AttendancePointCode } from "@construction/domain/attendance.js";

export type ProfileOwnerTypeValue = "MANAGER" | "WORKER";
export type AttendanceRecordStatusValue = "INVALID" | "VALID";
export type ScheduleOwnerTypeValue = "PROJECT";
export type IsoWeekdayValue = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type ShiftSegmentRequest = {
  readonly earlyGraceMins: number;
  readonly endTime: string;
  readonly lateGraceMins: number;
  readonly sequence: 1 | 2;
  readonly startTime: string;
};

export type ConfigureDefaultShiftRequest = {
  readonly name: string;
  readonly segments: readonly [ShiftSegmentRequest, ShiftSegmentRequest];
};

export type ShiftSegmentResponse = ShiftSegmentRequest & {
  readonly id: string;
  readonly shiftId: string;
};

export type DefaultShiftResponse = {
  readonly id: string;
  readonly isDefault: boolean;
  readonly name: string;
  readonly projectId: string;
  readonly segments: readonly [ShiftSegmentResponse, ShiftSegmentResponse];
};

export type ConfigureDefaultScheduleRequest = {
  readonly endsOn: string | null;
  readonly startsOn: string;
  readonly workdays: readonly IsoWeekdayValue[];
};

export type DefaultScheduleResponse = {
  readonly endsOn: string | null;
  readonly id: string;
  readonly ownerId: string;
  readonly ownerType: ScheduleOwnerTypeValue;
  readonly shiftId: string;
  readonly startsOn: string;
  readonly workdays: readonly IsoWeekdayValue[];
};

export type SubmitAttendanceRecordRequest = {
  readonly attendanceDate: string;
  readonly latitude: string;
  readonly locationAccuracyM: string | null;
  readonly longitude: string;
  readonly occurredAt: string;
  readonly pointCode: AttendancePointCode;
  readonly selfieHash: string;
  readonly selfieObjectKey: string;
  readonly sitePhotoHash: string;
  readonly sitePhotoObjectKey: string;
};

export type AttendanceRecordResponse = {
  readonly abnormalReason: string | null;
  readonly attendanceDate: string;
  readonly facePassed: boolean;
  readonly faceScore: string | null;
  readonly geofenceDistanceM: string | null;
  readonly id: string;
  readonly latitude: string;
  readonly locationAccuracyM: string | null;
  readonly longitude: string;
  readonly occurredAt: string;
  readonly participantId: string;
  readonly participantType: ProfileOwnerTypeValue;
  readonly pointCode: AttendancePointCode;
  readonly projectId: string;
  readonly selfieHash: string;
  readonly selfieObjectKey: string;
  readonly sitePhotoHash: string;
  readonly sitePhotoObjectKey: string;
  readonly status: AttendanceRecordStatusValue;
};

export type AttendanceResultResponse = {
  readonly attendanceDate: string;
  readonly isAbsent: boolean;
  readonly isEarlyLeave: boolean;
  readonly isLate: boolean;
  readonly isMissingPunch: boolean;
  readonly participantId: string;
  readonly participantType: ProfileOwnerTypeValue;
  readonly projectId: string;
  readonly workedMinutes: number;
};

export type SubmitAttendanceRecordResponse = {
  readonly record: AttendanceRecordResponse;
  readonly result: AttendanceResultResponse;
};
