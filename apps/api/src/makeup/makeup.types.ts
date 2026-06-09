import type { AttendancePointCode } from "@construction/domain/attendance.js";

import type { AttendanceResultResponse, ProfileOwnerTypeValue } from "../attendance/attendance.types.js";

export type MakeupStatusValue = "APPROVED" | "PENDING" | "REJECTED";

export type CreateMakeupRequestBody = {
  readonly attendanceDate: string;
  readonly pointCode: AttendancePointCode;
  readonly reason: string;
  readonly requestedOccurredAt: string;
};

export type ReviewMakeupRequestBody = {
  readonly approvalReason: string;
};

export type MakeupRequestResponse = {
  readonly approvalReason: string | null;
  readonly approvedAt: string | null;
  readonly approverUserId: string | null;
  readonly attendanceDate: string;
  readonly id: string;
  readonly participantId: string;
  readonly participantType: ProfileOwnerTypeValue;
  readonly pointCode: AttendancePointCode;
  readonly projectId: string;
  readonly reason: string;
  readonly requestedOccurredAt: string;
  readonly requesterUserId: string;
  readonly status: MakeupStatusValue;
};

export type ReviewMakeupResponse = {
  readonly request: MakeupRequestResponse;
  readonly result: AttendanceResultResponse | null;
};
