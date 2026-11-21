import { dailyHeadcount } from "../reports/daily-headcount.js";
import type { DailyAttendanceReportParticipant } from "../reports/reports.types.js";

/**
 * Home sign numbers from the daily report rows. They reconcile:
 * expected = present + missing (未到: a card is due, no valid punch) + waiting (first card
 * not due yet). Someone who arrived but missed a later card counts as present.
 */
export const overviewAttendance = (
  participants: readonly Pick<
    DailyAttendanceReportParticipant,
    "isMissingPunch" | "isPresent" | "isScheduled"
  >[],
): {
  readonly expected: number;
  readonly missing: number;
  readonly present: number;
  readonly waiting: number;
} => {
  const counts = dailyHeadcount(participants);
  return {
    expected: counts.expected,
    missing: counts.notArrived,
    present: counts.present,
    waiting: counts.waiting,
  };
};
