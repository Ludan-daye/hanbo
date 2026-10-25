import { describe, expect, test } from "vitest";

import { totalsStatItems } from "../src/pages/reports/view-model";

describe("totalsStatItems", () => {
  test("maps daily totals to labelled cards", () => {
    const items = totalsStatItems({
      abnormalRecordCount: 1,
      absenceCount: 2,
      actualAttendedDays: 3,
      approvedMakeupCount: 4,
      earlyLeaveCount: 5,
      lateCount: 6,
      missingPunchCount: 7,
      participantCount: 8,
      scheduledDays: 9,
      workedMinutes: 600,
    });
    expect(items).toContainEqual({ label: "统计人数", value: "8" });
    expect(items).toContainEqual({ label: "迟到", value: "6" });
    expect(items).toContainEqual({ label: "缺勤", value: "2" });
    expect(items).toContainEqual({ label: "工时", value: "10.0h" });
  });
});
