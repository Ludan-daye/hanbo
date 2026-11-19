import { describe, expect, it } from "vitest";

import {
  monthDayLabel,
  pointGrace,
  projectNextPoint,
  projectTodayNote,
} from "../src/pages/my-project-detail/today-view";
import type {
  AttendanceToday,
  AttendanceTodayPoint,
} from "../src/services/me.types";

const point = (
  overrides: Partial<AttendanceTodayPoint> = {},
): AttendanceTodayPoint => ({
  pointCode: "START",
  label: "上班",
  scheduledTime: "08:00",
  graceMins: 10,
  kind: "START",
  record: null,
  ...overrides,
});
const end = point({
  pointCode: "END",
  label: "下班",
  kind: "END",
  scheduledTime: "17:30",
  graceMins: 0,
});
const today = (overrides: Partial<AttendanceToday> = {}): AttendanceToday => ({
  attendanceDate: "2026-11-18",
  configured: true,
  isWorkday: true,
  shiftName: "日班",
  result: null,
  geofence: {
    centerLatitude: "30",
    centerLongitude: "120",
    radiusM: 300,
    locationAccuracyLimitM: null,
  },
  points: [point(), end],
  ...overrides,
});
const active = {
  requiresAttendance: true,
  status: "ACTIVE",
  taskAttendanceOnly: false,
} as const;

describe("项目详情：今天这一段", () => {
  it("正常排了班的工作日没有额外说明", () => {
    expect(projectTodayNote(active, today())).toBeNull();
  });

  it("按原来的先后说明为什么没有卡可打", () => {
    const unset = today({ configured: false, isWorkday: false, points: [] });
    expect(
      projectTodayNote({ ...active, requiresAttendance: false }, unset)?.title,
    ).toBe("这个项目不用考勤");
    expect(projectTodayNote({ ...active, status: "SUSPENDED" }, unset)).toEqual(
      { title: "项目现在不开放打卡", sub: "项目已暂停。" },
    );
    expect(
      projectTodayNote({ ...active, taskAttendanceOnly: true }, unset)?.title,
    ).toBe("按任务开工、完工");
    expect(projectTodayNote(active, unset)?.title).toBe("今天还没排班");
    expect(projectTodayNote(active, today({ isWorkday: false }))).toEqual({
      title: "今天不用打卡",
      sub: "日班，今天休息。",
    });
    expect(
      projectTodayNote(active, today({ points: [], shiftName: null }))?.sub,
    ).toBe("今天休息。");
  });

  it("下一张卡和首页用同一个算法", () => {
    // 北京时间 07:46：都没到点，先打第一张
    expect(
      projectNextPoint(today(), "2026-11-18T07:46:00+08:00")?.pointCode,
    ).toBe("START");
    // 上班打过了，剩下班
    const worked = today({
      points: [
        point({
          record: {
            abnormalReason: null,
            occurredAt: "2026-11-18T07:52:00+08:00",
            status: "VALID",
          },
        }),
        end,
      ],
    });
    expect(
      projectNextPoint(worked, "2026-11-18T12:00:00+08:00")?.pointCode,
    ).toBe("END");
    // 手里的安排不是今天的：不指给任何一张卡
    expect(projectNextPoint(today(), "2026-11-19T07:46:00+08:00")).toBeNull();
  });

  it("日期和宽限的写法", () => {
    expect(monthDayLabel("2026-11-08")).toBe("11月8日");
    expect(monthDayLabel("2026-01-18")).toBe("1月18日");
    expect(pointGrace(point())).toBe("迟到宽限 10 分钟");
    expect(pointGrace(end)).toBe("早退宽限 0 分钟");
    expect(pointGrace(point({ kind: "CHECKPOINT", graceMins: 5 }))).toBe(
      "宽限 5 分钟",
    );
  });
});
