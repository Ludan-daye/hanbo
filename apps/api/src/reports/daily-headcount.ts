import type {
  DailyAttendanceReportParticipant,
  DailyHeadcount,
} from "./reports.types.js";

/** 应到 = 到岗 + 未到 + 还没到打卡时间, from daily participants (see DailyHeadcount). */
export const dailyHeadcount = (
  participants: readonly Pick<
    DailyAttendanceReportParticipant,
    "isMissingPunch" | "isPresent" | "isScheduled"
  >[],
): DailyHeadcount => {
  const expected = participants.filter((row) => row.isScheduled);
  const present = expected.filter((row) => row.isPresent).length;
  const notArrived = expected.filter(
    (row) => !row.isPresent && row.isMissingPunch,
  ).length;
  return {
    expected: expected.length,
    notArrived,
    present,
    waiting: expected.length - present - notArrived,
  };
};
