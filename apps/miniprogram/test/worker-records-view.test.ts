import { describe, expect, test } from "vitest";

import {
  dayHasIssue,
  dayLabel,
  dayMakeupUrl,
  dayNotes,
  dayPoints,
  dayRowStatus,
  monthDayLabel,
  pointName,
  rangeHeading,
  rangeSign,
} from "../src/components/worker-records/day-view";
import type {
  AttendanceRecord,
  Makeup,
  MyAttendanceDay,
} from "../src/services/me.types";
import { groupAttendanceDays } from "../src/services/worker-records";

const DATE = "2026-11-17";
const record = (
  id: string,
  time: string,
  fields: Partial<AttendanceRecord> = {},
): AttendanceRecord =>
  ({
    id,
    attendanceDate: DATE,
    projectId: "p 1",
    status: "VALID",
    occurredAt: `${DATE}T${time}:00+08:00`,
    pointCode: "SEGMENT_1_START",
    pointLabel: "上班",
    abnormalReason: null,
    ...fields,
  }) as AttendanceRecord;
const makeup = (id: string, time: string): Makeup =>
  ({
    id,
    attendanceDate: DATE,
    projectId: "p 1",
    status: "APPROVED",
    requestedOccurredAt: `${DATE}T${time}:00+08:00`,
    pointCode: "SEGMENT_2_END",
    pointLabel: "下班",
  }) as Makeup;
const day = (fields: Partial<MyAttendanceDay> = {}): MyAttendanceDay =>
  ({
    attendanceDate: DATE,
    projectId: "p 1",
    workedMinutes: 510,
    normalMinutes: 480,
    overtimeMinutes: 30,
    unclassifiedMinutes: 0,
    approvedMakeupCount: 0,
    isMissingPunch: false,
    isAbsent: false,
    isLate: false,
    isEarlyLeave: false,
    teamName: "钢筋一班",
    ...fields,
  }) as MyAttendanceDay;
const group = (
  days: MyAttendanceDay[],
  records: AttendanceRecord[] = [],
  makeups: Makeup[] = [],
) => groupAttendanceDays(days, records, makeups)[0];

describe("我的考勤：日期和结论怎么写", () => {
  test("日期带星期，不带年份；跨年的范围才写年份", () => {
    expect(dayLabel("2026-11-18")).toBe("11月18日 周三");
    expect(monthDayLabel("2026-01-05")).toBe("1月5日");
    expect(rangeHeading("2026-11-18", "2026-11-18")).toBe("11月18日 周三");
    expect(rangeHeading("2026-11-01", "2026-11-18")).toBe(
      "11月1日 到 11月18日",
    );
    expect(rangeHeading("2025-12-20", "2026-01-15")).toBe(
      "2025年12月20日 到 2026年1月15日",
    );
  });
  test("小标牌说出勤天数、工时和缺卡", () => {
    expect(
      rangeSign("MONTH", {
        attendedDays: 18,
        workedMinutes: 8550,
        missingDays: 1,
      }),
    ).toEqual({ title: "本月出勤 18 天", sub: "记工 142.5 小时，缺卡 1 天" });
    expect(
      rangeSign("WEEK", {
        attendedDays: 5,
        workedMinutes: 2400,
        missingDays: 0,
      }),
    ).toEqual({ title: "近 7 天出勤 5 天", sub: "记工 40.0 小时，没有缺卡" });
  });
  test("只看今天时不说“出勤 1 天”", () => {
    expect(
      rangeSign("TODAY", {
        attendedDays: 1,
        workedMinutes: 240,
        missingDays: 0,
      }),
    ).toEqual({ title: "今天已出勤", sub: "记工 4.0 小时" });
    expect(
      rangeSign("TODAY", { attendedDays: 0, workedMinutes: 0, missingDays: 1 }),
    ).toEqual({ title: "今天还没有出勤", sub: "记工 0.0 小时，有缺卡" });
  });
});

describe("我的考勤：一天的状态", () => {
  test("没问题的日子显示工时；今天还没过完，不带绿方块", () => {
    const normal = group([day()], [record("r1", "07:55")]);
    expect(dayHasIssue(normal)).toBe(false);
    expect(dayRowStatus(normal, "2026-11-18")).toEqual({
      kind: "ok",
      text: "8.5 小时",
    });
    expect(dayRowStatus(normal, DATE)).toEqual({
      kind: "idle",
      text: "8.5 小时",
    });
  });
  test("有问题的日子说问题，几个问题用顿号连起来", () => {
    const late = group([day({ isLate: true, isMissingPunch: true })]);
    expect(dayHasIssue(late)).toBe(true);
    expect(dayRowStatus(late, "2026-11-18")).toEqual({
      kind: "bad",
      text: "迟到、缺卡",
    });
  });
  test("有一次打卡没通过核验也算有问题；还没汇总的日子不猜结果", () => {
    const invalid = group(
      [day()],
      [record("r1", "07:55", { status: "INVALID" })],
    );
    expect(dayRowStatus(invalid, "2026-11-18")).toEqual({
      kind: "bad",
      text: "核验异常",
    });
    const pending = group([], [record("r1", "07:55")]);
    expect(dayHasIssue(pending)).toBe(false);
    expect(dayRowStatus(pending, "2026-11-18")).toEqual({
      kind: "idle",
      text: "待汇总",
    });
  });
});

describe("我的考勤：展开一天", () => {
  test("打卡和已批准的补卡合在一起，按时间先后排", () => {
    const points = dayPoints(
      group(
        [day()],
        [
          record("r2", "12:01", {
            status: "INVALID",
            abnormalReason: "OUTSIDE_GEOFENCE",
            pointLabel: "午间签到",
          }),
          record("r1", "07:55"),
        ],
        [makeup("m1", "17:35")],
      ),
    );
    expect(points).toEqual([
      {
        key: "record:r1",
        name: "上班",
        time: "07:55",
        kind: "valid",
        note: null,
      },
      {
        key: "record:r2",
        name: "午间签到",
        time: "12:01",
        kind: "invalid",
        note: "超出考勤范围",
      },
      {
        key: "makeup:m1",
        name: "下班",
        time: "17:35",
        kind: "makeup",
        note: "补卡已生效",
      },
    ]);
  });
  test("时点没有名字时按固定时点翻译，认不出的不显示英文代码", () => {
    expect(pointName({ pointCode: "SEGMENT_2_END" })).toBe("下午下班");
    expect(pointName({ pointCode: "CUSTOM_CHECK", pointLabel: null })).toBe(
      "打卡",
    );
  });
  test("说明里写工时怎么分的、哪个班组、补过几次卡", () => {
    expect(dayNotes(group([day({ approvedMakeupCount: 2 })]))).toEqual([
      "记工 8.5 小时：正常 8.0，加班 0.5，未分类 0.0",
      "钢筋一班，已补卡 2 次",
    ]);
    expect(dayNotes(group([day({ teamName: null })]))[1]).toBe("项目直属");
    expect(dayNotes(group([], [record("r1", "07:55")]))).toEqual([
      "这一天还没有汇总，先以打卡记录为准。",
    ]);
  });
  test("去补卡时带上项目、日期和已经有效打过的卡", () => {
    const url = dayMakeupUrl(
      group(
        [day({ isMissingPunch: true })],
        [
          record("r1", "07:55"),
          record("r2", "12:01", {
            status: "INVALID",
            pointCode: "SEGMENT_1_END",
          }),
        ],
      ),
    );
    expect(url).toBe(
      "/pages/submit-makeup/index?projectId=p%201&date=2026-11-17&recorded=SEGMENT_1_START",
    );
  });
});
