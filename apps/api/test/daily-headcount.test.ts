import { describe, expect, test } from "vitest";

import { dailyHeadcount } from "../src/reports/daily-headcount.js";

const day = (isScheduled: boolean, isPresent: boolean, isMissingPunch: boolean) => ({
  isMissingPunch,
  isPresent,
  isScheduled,
});

describe("daily headcount", () => {
  test("应到 = 到岗 + 未到 + 还没到点; a present person who missed a later card stays present", () => {
    const counts = dailyHeadcount([
      day(true, true, true), // arrived, missed the checkpoint
      day(true, true, false),
      day(true, false, true), // card due, nothing punched
      day(true, false, false), // first card not due yet
      day(false, false, false), // temporary worker without a task: not 应到
    ]);
    expect(counts).toEqual({ expected: 4, notArrived: 1, present: 2, waiting: 1 });
    expect(counts.present + counts.notArrived + counts.waiting).toBe(counts.expected);
  });
});
