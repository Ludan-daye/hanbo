import { describe, expect, test } from "vitest";

import {
  dayLabel,
  groupReportPeople,
  groupReportProjects,
  monthLabel,
  personNumbers,
  personOutcome,
  personSummary,
  rangeLabel,
  reportNumbers,
  reportSummary,
  shiftDate,
  shiftMonth,
  totalsStatItems,
} from "../src/pages/reports/view-model";
import type {
  DailyReportParticipant,
  RangeReportParticipant,
  ReportTotals,
} from "../src/services/management.types";

const totals: ReportTotals = {
  abnormalRecordCount: 1,
  absenceCount: 3,
  actualAttendedDays: 103,
  approvedMakeupCount: 2,
  earlyLeaveCount: 0,
  lateCount: 3,
  missingPunchCount: 4,
  participantCount: 5,
  scheduledDays: 110,
  workedMinutes: 51000,
  normalMinutes: 49890,
  overtimeMinutes: 1110,
  unclassifiedMinutes: 0,
  confirmedViolationCount: 1,
};
const base = {
  projectKind: "REGULAR",
  isTemporary: false,
  safetyCreditScore: 100,
  safetyCreditAsOf: null,
  projectId: "p1",
  projectName: "滨江花园",
  evaluation: null,
  displayName: "张建国",
  memberId: "m1",
  memberStatus: "ACTIVE",
  participantId: "u1",
  participantType: "WORKER",
  phone: "13800000001",
  projectRoleLabel: "WORKER",
  requiresAttendance: true,
  teamId: "t1",
  teamName: "钢筋一班",
  workType: "钢筋工",
} as const;
const daily = (
  patch: Partial<DailyReportParticipant>,
): DailyReportParticipant => ({
  ...base,
  abnormalRecordCount: 0,
  approvedMakeupCount: 0,
  isAbsent: false,
  isEarlyLeave: false,
  isLate: false,
  isMissingPunch: false,
  workedMinutes: 510,
  normalMinutes: 480,
  overtimeMinutes: 30,
  unclassifiedMinutes: 0,
  confirmedViolationCount: 0,
  ...patch,
});
const range = (
  patch: Partial<RangeReportParticipant>,
): RangeReportParticipant => ({
  ...base,
  abnormalRecordCount: 0,
  absenceCount: 0,
  actualAttendedDays: 18,
  approvedMakeupCount: 0,
  earlyLeaveCount: 0,
  lateCount: 0,
  missingPunchCount: 0,
  scheduledDays: 20,
  workedMinutes: 8550,
  normalMinutes: 8000,
  overtimeMinutes: 550,
  unclassifiedMinutes: 0,
  confirmedViolationCount: 0,
  ...patch,
});

describe("reportNumbers", () => {
  test("keeps all fourteen statistics: three on top, eleven behind 全部统计", () => {
    for (const period of ["DAILY", "WEEKLY", "MONTHLY"] as const) {
      const { top, rest } = reportNumbers(totals, period);
      expect(top).toHaveLength(3);
      expect(rest).toHaveLength(11);
      expect([...top, ...rest].map((item) => item.label).sort()).toEqual(
        totalsStatItems(totals)
          .map((item) => item.label)
          .sort(),
      );
    }
  });
  test("daily shows late, early leave and overtime; hours drop the unit", () => {
    expect(reportNumbers(totals, "DAILY").top).toEqual([
      { label: "迟到", value: "3", tone: undefined },
      { label: "早退", value: "0", tone: undefined },
      { label: "加班工时", value: "18.5", tone: undefined },
    ]);
  });
  test("range shows missing punches and absences in red when there are any", () => {
    expect(reportNumbers(totals, "MONTHLY").top).toEqual([
      { label: "缺卡", value: "4", tone: "bad" },
      { label: "缺勤", value: "3", tone: "bad" },
      { label: "加班工时", value: "18.5", tone: undefined },
    ]);
    expect(
      reportNumbers({ ...totals, missingPunchCount: 0 }, "WEEKLY").top[0],
    ).toEqual({ label: "缺卡", value: "0", tone: undefined });
  });
});

describe("reportSummary", () => {
  test("daily says who arrived and who is missing a punch", () => {
    expect(
      reportSummary(
        {
          ...totals,
          actualAttendedDays: 4,
          scheduledDays: 5,
          missingPunchCount: 1,
          workedMinutes: 1890,
        },
        "DAILY",
        null,
      ),
    ).toEqual({
      title: "4 人到岗，1 人缺卡",
      sub: "应到 5 人，已记工 31.5 小时",
    });
  });
  test("daily falls back to absences, then to a plain count", () => {
    const day = { ...totals, actualAttendedDays: 4, scheduledDays: 5 };
    expect(
      reportSummary({ ...day, missingPunchCount: 0 }, "DAILY", null).title,
    ).toBe("4 人到岗，3 人缺勤");
    expect(
      reportSummary(
        { ...day, missingPunchCount: 0, absenceCount: 0 },
        "DAILY",
        null,
      ).title,
    ).toBe("4 人到岗");
    expect(
      reportSummary(
        { ...day, actualAttendedDays: 0, scheduledDays: 0 },
        "DAILY",
        null,
      ).title,
    ).toBe("这一天没有排班");
  });
  test("range gives the attendance rate", () => {
    expect(reportSummary(totals, "MONTHLY", null)).toEqual({
      title: "出勤率 94%",
      sub: "应出勤 110 天，实出勤 103 天",
    });
    expect(reportSummary(totals, "MONTHLY", 2).sub).toBe(
      "2 个项目，5 人，记工 850.0 小时",
    );
    expect(
      reportSummary({ ...totals, scheduledDays: 0 }, "WEEKLY", null).title,
    ).toBe("这段时间没有排班");
  });
});

describe("dates", () => {
  test("shift across month and year ends", () => {
    expect(shiftDate("2026-11-30", 1)).toBe("2026-12-01");
    expect(shiftDate("2026-11-16", -7)).toBe("2026-11-09");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
  test("labels", () => {
    expect(monthLabel("2026-11")).toBe("2026年11月");
    expect(dayLabel("2026-11-18")).toBe("11月18日 周三");
    expect(rangeLabel("2026-11-16", "2026-11-22")).toBe("11月16日 到 22日");
    expect(rangeLabel("2026-11-30", "2026-12-06")).toBe("11月30日 到 12月6日");
    expect(rangeLabel("2026-11-18", "2026-11-18")).toBe("11月18日");
  });
});

describe("people", () => {
  test("a daily row shows its problem, otherwise its hours", () => {
    expect(personOutcome([daily({})])).toEqual({
      bad: null,
      hours: "8.5",
      exempt: false,
    });
    expect(personOutcome([daily({ isMissingPunch: true })]).bad).toBe("缺卡");
    expect(
      personOutcome([daily({ isMissingPunch: true, isLate: true })]).bad,
    ).toBe("缺卡、迟到");
    expect(
      personOutcome([
        daily({ isMissingPunch: true, isLate: true, isEarlyLeave: true }),
      ]).bad,
    ).toBe("缺卡等 3 项");
  });
  test("a range row names the most serious problem with its days", () => {
    expect(
      personOutcome([range({ missingPunchCount: 2, lateCount: 1 })]).bad,
    ).toBe("缺卡 2 天");
    expect(personOutcome([range({})]).bad).toBeNull();
  });
  test("exempt members are never flagged", () => {
    expect(
      personOutcome([
        daily({
          requiresAttendance: false,
          isAbsent: true,
          workedMinutes: 0,
        }),
      ]),
    ).toEqual({ bad: null, hours: "0.0", exempt: true });
  });
  test("groups rows by person and puts the ones with problems first", () => {
    const people = groupReportPeople([
      daily({ memberId: "ok" }),
      daily({ memberId: "two", teamId: "t1" }),
      daily({ memberId: "bad", isAbsent: true, workedMinutes: 0 }),
      daily({ memberId: "two", teamId: "t2", workedMinutes: 90 }),
    ]);
    expect(people.map((person) => person.memberId)).toEqual([
      "bad",
      "ok",
      "two",
    ]);
    expect(people[2].rows).toHaveLength(2);
    expect(people[2].outcome.hours).toBe("10.0");
  });
  test("groups rows by project with head count, hours and rate", () => {
    expect(
      groupReportProjects([
        range({ projectId: "p2", projectName: "城市更新", memberId: "a" }),
        range({ memberId: "b", missingPunchCount: 1 }),
        range({ memberId: "c", scheduledDays: 20, actualAttendedDays: 20 }),
      ]),
    ).toEqual([
      {
        projectId: "p1",
        projectName: "滨江花园",
        people: 2,
        hours: "285.0",
        rate: 95,
        troubled: 1,
      },
      {
        projectId: "p2",
        projectName: "城市更新",
        people: 1,
        hours: "142.5",
        rate: 90,
        troubled: 0,
      },
    ]);
    expect(groupReportProjects([daily({ isLate: true })])[0]).toMatchObject({
      rate: null,
      troubled: 1,
    });
  });
});

describe("person detail", () => {
  test("monthly summary", () => {
    expect(
      personSummary([range({ missingPunchCount: 1 })], "MONTHLY", "2026-11-01"),
    ).toEqual({
      title: "11月出勤 18 天",
      sub: "应出勤 20 天，记工 142.5 小时，缺卡 1 天",
    });
  });
  test("daily summary", () => {
    expect(personSummary([daily({})], "DAILY", "2026-11-18")).toEqual({
      title: "记工 8.5 小时",
      sub: "11月18日 周三",
    });
    expect(
      personSummary(
        [daily({ isMissingPunch: true, workedMinutes: 0 })],
        "DAILY",
        "2026-11-18",
      ),
    ).toEqual({ title: "缺卡", sub: "11月18日 周三，记工 0.0 小时" });
  });
  test("numbers keep every count of the row", () => {
    const month = personNumbers([range({ absenceCount: 1 })]);
    expect(month.top.map((item) => item.label)).toEqual([
      "正常工时",
      "加班工时",
      "未分类工时",
    ]);
    expect(month.rest.map((item) => item.label)).toEqual([
      "应出勤",
      "实出勤",
      "缺勤",
      "缺卡",
      "迟到",
      "早退",
      "补卡通过",
      "异常记录",
      "已确认违规",
    ]);
    expect(month.rest[2]).toEqual({ label: "缺勤", value: "1", tone: "bad" });
    expect(personNumbers([daily({})]).rest.map((item) => item.label)).toEqual([
      "补卡通过",
      "异常记录",
      "已确认违规",
    ]);
  });
});
