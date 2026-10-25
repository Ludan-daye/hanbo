export type AttendancePointCode = "SEGMENT_1_START" | "SEGMENT_1_END" | "SEGMENT_2_START" | "SEGMENT_2_END";
export type ParticipantType = "WORKER" | "MANAGER";
export type AttendanceRecordStatus = "VALID" | "INVALID";
export type MakeupStatus = "PENDING" | "APPROVED" | "REJECTED";

export type AttendanceRecord = {
  readonly id: string;
  readonly projectId: string;
  readonly participantType: ParticipantType;
  readonly participantId: string;
  readonly attendanceDate: string;
  readonly pointCode: AttendancePointCode;
  readonly occurredAt: string;
  readonly status: AttendanceRecordStatus;
  readonly facePassed: boolean;
  readonly faceScore: string | null;
  readonly geofenceDistanceM: string | null;
  readonly locationAccuracyM: string | null;
  readonly abnormalReason: string | null;
  readonly latitude: string;
  readonly longitude: string;
  readonly selfieObjectKey: string;
  readonly selfieHash: string;
  readonly sitePhotoObjectKey: string;
  readonly sitePhotoHash: string;
};

export type Makeup = {
  readonly id: string;
  readonly projectId: string;
  readonly participantId: string;
  readonly participantType: ParticipantType;
  readonly attendanceDate: string;
  readonly pointCode: AttendancePointCode;
  readonly reason: string;
  readonly requestedOccurredAt: string;
  readonly requesterUserId: string;
  readonly status: MakeupStatus;
  readonly approvalReason: string | null;
  readonly approvedAt: string | null;
  readonly approverUserId: string | null;
};

export type MyProjectMembership = {
  readonly projectId: string;
  readonly projectName: string;
  readonly projectRoleLabel: string;
  readonly teamId: string | null;
  readonly teamName: string | null;
};

export type SubmitMakeupBody = {
  readonly attendanceDate: string;
  readonly pointCode: AttendancePointCode;
  readonly reason: string;
  readonly requestedOccurredAt: string;
};

export type AttendanceTodayPointRecord = {
  readonly abnormalReason: string | null;
  readonly occurredAt: string;
  readonly status: AttendanceRecordStatus;
};

export type AttendanceTodayPoint = {
  readonly graceMins: number;
  readonly pointCode: AttendancePointCode;
  readonly record: AttendanceTodayPointRecord | null;
  readonly scheduledTime: string;
};

export type AttendanceTodayGeofence = {
  readonly centerLatitude: string;
  readonly centerLongitude: string;
  readonly radiusM: number;
};

export type AttendanceResultSummary = {
  readonly attendanceDate: string;
  readonly isAbsent: boolean;
  readonly isEarlyLeave: boolean;
  readonly isLate: boolean;
  readonly isMissingPunch: boolean;
  readonly participantId: string;
  readonly participantType: ParticipantType;
  readonly projectId: string;
  readonly workedMinutes: number;
};

export type AttendanceToday = {
  readonly attendanceDate: string;
  readonly configured: boolean;
  readonly geofence: AttendanceTodayGeofence;
  readonly isWorkday: boolean;
  readonly points: ReadonlyArray<AttendanceTodayPoint>;
  readonly result: AttendanceResultSummary | null;
  readonly shiftName: string | null;
};

export type SubmitAttendanceRecordBody = {
  readonly faceVerificationSessionId?: string;
  readonly attendanceDate: string;
  readonly latitude: string;
  readonly locationAccuracyM: string | null;
  readonly longitude: string;
  readonly occurredAt: string;
  readonly pointCode: AttendancePointCode;
  readonly selfieHash?: string;
  readonly selfieObjectKey?: string;
  readonly sitePhotoHash: string;
  readonly sitePhotoObjectKey: string;
};

export type SubmitAttendanceRecordResult = {
  readonly record: AttendanceRecord;
  readonly result: AttendanceResultSummary;
};
