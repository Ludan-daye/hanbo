import {
  ATTENDANCE_SAFETY_TEXT,
  ATTENDANCE_SAFETY_VERSION,
  type AttendanceSafetyNotice,
  type AttendanceSafetyReceipt,
  type ConfirmAttendanceSafety,
} from "@construction/domain";
import { ApiError } from "../apiClient";
import type { ProjectParticipant } from "../management.types";
import type { SubmitAttendanceRecordBody } from "../me.types";
import { chinaToday } from "../time";
import { demoId, type DemoState } from "./state";

export type DemoSafetyConfirmation = AttendanceSafetyReceipt & {
  readonly userId: string;
  readonly memberId: string;
  readonly notice: AttendanceSafetyNotice;
};
export const demoSafetyNotice = (
  state: DemoState,
  person: ProjectParticipant,
  pointCode: string,
): AttendanceSafetyNotice => ({
  projectId: person.projectId,
  teamId: person.teamId,
  attendanceDate: chinaToday(),
  pointCode,
  baselineVersion: ATTENDANCE_SAFETY_VERSION,
  baselineText: ATTENDANCE_SAFETY_TEXT,
  briefings: (state.teamWork?.briefings ?? [])
    .filter(
      (row) => row.teamId === person.teamId && row.workDate === chinaToday(),
    )
    .map((row) => ({
      id: row.id,
      title: row.title,
      content: row.content,
      publishedAt: `${row.workDate}T00:00:00+08:00`,
    })),
});
const sameIds = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");
export const confirmDemoSafety = (
  state: DemoState,
  userId: string,
  person: ProjectParticipant,
  input: ConfirmAttendanceSafety,
): { state: DemoState; data: AttendanceSafetyReceipt } => {
  const notice = demoSafetyNotice(state, person, input.pointCode);
  if (
    notice.baselineVersion !== input.baselineVersion ||
    !sameIds(
      notice.briefings.map((row) => row.id),
      input.briefingIds,
    )
  )
    throw new ApiError(409, "班组长更新了安全交底，请重新读取并确认。", {
      message: "SAFETY_BRIEFING_CHANGED",
    });
  const receipt: DemoSafetyConfirmation = {
    id: demoId("safety-confirmation"),
    userId,
    memberId: person.memberId,
    notice,
    confirmedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 15 * 60000).toISOString(),
  };
  return {
    state: {
      ...state,
      safetyConfirmations: [...(state.safetyConfirmations ?? []), receipt],
      ...(state.teamWork && person.participantType === "WORKER"
        ? {
            teamWork: {
              ...state.teamWork,
              briefings: state.teamWork.briefings.map((row) =>
                !input.briefingIds.includes(row.id) ||
                row.acknowledgements.some(
                  (ack) => ack.memberId === person.memberId,
                )
                  ? row
                  : {
                      ...row,
                      acknowledgements: [
                        ...row.acknowledgements,
                        {
                          memberId: person.memberId,
                          name: person.displayName ?? "演示工人",
                          acknowledgedAt: receipt.confirmedAt,
                        },
                      ],
                    },
              ),
            },
          }
        : {}),
    },
    data: {
      id: receipt.id,
      confirmedAt: receipt.confirmedAt,
      expiresAt: receipt.expiresAt,
    },
  };
};
export const requireDemoSafety = (
  state: DemoState,
  userId: string,
  person: ProjectParticipant,
  input: SubmitAttendanceRecordBody,
): DemoSafetyConfirmation => {
  const receipt = state.safetyConfirmations?.find(
    (row) =>
      row.id === input.safetyConfirmationId &&
      row.userId === userId &&
      row.memberId === person.memberId &&
      row.notice.projectId === person.projectId &&
      row.notice.teamId === person.teamId &&
      row.notice.pointCode === input.pointCode &&
      row.notice.attendanceDate === input.attendanceDate &&
      Date.parse(row.expiresAt) > Date.now(),
  );
  if (
    !receipt ||
    state.records.some((row) => row.safetyConfirmationId === receipt.id)
  )
    throw new ApiError(403, "请重新阅读并确认本次安全交底。", {
      message: "SAFETY_CONFIRMATION_REQUIRED",
    });
  const notice = demoSafetyNotice(state, person, input.pointCode);
  if (
    notice.baselineVersion !== receipt.notice.baselineVersion ||
    !sameIds(
      notice.briefings.map((row) => row.id),
      receipt.notice.briefings.map((row) => row.id),
    )
  )
    throw new ApiError(409, "交底内容已更新，请重新确认。", {
      message: "SAFETY_BRIEFING_CHANGED",
    });
  return receipt;
};
