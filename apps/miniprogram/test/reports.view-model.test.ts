import { describe, expect, test } from "vitest";

import {
  reportExportTarget,
  reportLeaderOptions,
  teamFilterLabel,
  totalsStatItems,
} from "../src/pages/reports/view-model";

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

describe("按班组、按组长筛", () => {
  const teams = [
    { teamId: "t1", teamName: "钢筋一班", projectName: "滨江一期", leaderMemberId: "m1", leaderName: "张建国" },
    { teamId: "t2", teamName: "木工班", projectName: "滨江一期", leaderMemberId: "m1", leaderName: "张建国" },
    { teamId: "t3", teamName: "水电班", projectName: "滨江二期", leaderMemberId: null, leaderName: null },
  ];
  test("一个组长一项，写上他带的班组；没有组长的班组不出现", () => {
    expect(reportLeaderOptions(teams)).toEqual([
      { memberId: "m1", label: "张建国（钢筋一班、木工班）" },
    ]);
  });
  test("公司报表的班组带项目名", () => {
    expect(teamFilterLabel(teams[2]!, true)).toBe("水电班（滨江二期）");
    expect(teamFilterLabel(teams[2]!, false)).toBe("水电班");
  });
  test("选了班组导这个班组，按组长筛不导出，没筛导整个范围", () => {
    const none = { teamId: null, leaderMemberId: null };
    expect(reportExportTarget("PROJECT", "p1", none)).toEqual({ scope: "PROJECT", scopeId: "p1" });
    expect(reportExportTarget("PROJECT", "p1", { ...none, teamId: "t1" })).toEqual({ scope: "TEAM", scopeId: "t1" });
    expect(reportExportTarget("COMPANY", "c1", { ...none, leaderMemberId: "m1" })).toBeNull();
  });
});
