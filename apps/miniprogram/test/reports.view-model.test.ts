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
      normalMinutes: 480,
      overtimeMinutes: 90,
      unclassifiedMinutes: 30,
      confirmedViolationCount: 1,
    });
    expect(items).toContainEqual({ label: "统计人数", value: "8" });
    expect(items).toContainEqual({ label: "迟到", value: "6" });
    expect(items).toContainEqual({ label: "缺勤", value: "2" });
    expect(items).toContainEqual({ label: "工时", value: "10.0h" });
    expect(items).toContainEqual({ label: "正常工时", value: "8.0h" });
    expect(items).toContainEqual({ label: "加班工时", value: "1.5h" });
    expect(items).toContainEqual({ label: "未分类工时", value: "0.5h" });
  });
});
