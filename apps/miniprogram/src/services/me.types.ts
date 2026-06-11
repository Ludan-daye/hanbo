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
