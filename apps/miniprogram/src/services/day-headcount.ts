import type { DailyReportParticipant, DayHeadcount } from "./management.types";

/**
 * 日报一天的人数，和服务端 dailyHeadcount 同一条规则：应到 = 到岗 + 未到 + 还没到点。
 * 到了但漏了后面一张卡的人算到岗，不算未到。
 */
export const dayHeadcount = (
  participants: readonly Pick<DailyReportParticipant, "isMissingPunch" | "isPresent" | "isScheduled">[],
): DayHeadcount => {
  const expected = participants.filter((row) => row.isScheduled);
  const present = expected.filter((row) => row.isPresent).length;
  const missing = expected.filter((row) => !row.isPresent && row.isMissingPunch).length;
  return { expected: expected.length, missing, present, waiting: expected.length - present - missing };
};
