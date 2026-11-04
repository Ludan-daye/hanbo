import type {
  AttendanceSafetyNotice,
  AttendanceSafetyReceipt,
  ConfirmAttendanceSafety,
} from "@construction/domain";
import { apiClient } from "./client";

export const fetchAttendanceSafety = (
  projectId: string,
  pointCode: string,
): Promise<AttendanceSafetyNotice> =>
  apiClient.request(
    `/attendance/projects/${encodeURIComponent(projectId)}/safety?pointCode=${encodeURIComponent(pointCode)}`,
    { method: "GET" },
  );
export const confirmAttendanceSafety = (
  projectId: string,
  data: ConfirmAttendanceSafety,
): Promise<AttendanceSafetyReceipt> =>
  apiClient.request(
    `/attendance/projects/${encodeURIComponent(projectId)}/safety-confirmations`,
    { method: "POST", data },
  );
