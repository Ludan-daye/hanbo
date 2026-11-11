import { describe, expect, test } from "vitest";
import type { AttendanceTodayPoint } from "../src/services/me.types";
import {
  selectPunchPoint,
  taskPunchBlock,
  type PunchSchedule,
} from "../src/pages/punch/point-selection";

const record = {
  occurredAt: "2026-11-11T08:00:00+08:00",
  status: "VALID" as const,
  abnormalReason: null,
};
const point = (
  pointCode: string,
  kind: "START" | "END",
  scheduledTime: string,
  recorded = false,
): AttendanceTodayPoint => ({
  pointCode,
  kind,
  scheduledTime,
  record: recorded ? record : null,
  label: kind,
  graceMins: 0,
});
const schedule = (started = false, finished = false): PunchSchedule => ({
  attendanceDate: "2026-11-11",
  configured: true,
  isWorkday: true,
  result: null,
  shiftName: "临时任务",
  geofence: {
    centerLatitude: "30",
    centerLongitude: "120",
    radiusM: 100,
    locationAccuracyLimitM: null,
  },
  taskWindow: {
    startsAt: "2026-11-11T08:00:00+08:00",
    endsAt: "2026-11-11T17:30:00+08:00",
  },
  points: [
    point("TASK_demo_START", "START", "08:00", started),
    point("TASK_demo_END", "END", "17:30", finished),
  ],
});

describe("temporary task actions follow actual progress", () => {
  test("an unstarted task still selects start after its planned end", () => {
    expect(selectPunchPoint(schedule(), null, "21:00")).toBe("TASK_demo_START");
  });
  test("a refresh discards a premature end selection", () => {
    expect(selectPunchPoint(schedule(), "TASK_demo_END", "21:00")).toBe(
      "TASK_demo_START",
    );
  });
  test("a started task selects end, and a finished task has no next action", () => {
    expect(selectPunchPoint(schedule(true), "TASK_demo_START", "12:00")).toBe(
      "TASK_demo_END",
    );
    expect(selectPunchPoint(schedule(true, true), null, "21:00")).toBeNull();
  });
  test("task actions do not depend on the array order or clock order", () => {
    const today = schedule();
    expect(
      selectPunchPoint(
        { ...today, points: [...today.points].reverse() },
        null,
        "21:00",
      ),
    ).toBe("TASK_demo_START");
  });
  test("ordinary shifts retain latest-due default and an explicit pending selection", () => {
    const today = {
      ...schedule(),
      taskWindow: undefined,
      points: [
        point("AM_IN", "START", "08:00"),
        point("AM_OUT", "END", "12:00"),
        point("PM_IN", "START", "13:30"),
      ],
    };
    expect(selectPunchPoint(today, null, "12:30")).toBe("AM_OUT");
    expect(selectPunchPoint(today, "AM_IN", "12:30")).toBe("AM_IN");
  });
});

describe("temporary task time restrictions are explained before photos", () => {
  test.each(["07:59:00", "17:30:00", "21:00:00"])(
    "blocks an unstarted task at %s",
    (time) => {
      expect(
        taskPunchBlock(schedule(), Date.parse(`2026-11-11T${time}+08:00`)),
      ).toMatch(/班组长/);
    },
  );
  test("allows starting within the existing planned interval", () => {
    expect(
      taskPunchBlock(schedule(), Date.parse("2026-11-11T08:00:00+08:00")),
    ).toBeNull();
  });
  test("does not prevent an already started task finishing after its planned end", () => {
    expect(
      taskPunchBlock(schedule(true), Date.parse("2026-11-11T21:00:00+08:00")),
    ).toBeNull();
    expect(
      taskPunchBlock(
        schedule(true, true),
        Date.parse("2026-11-12T09:00:00+08:00"),
      ),
    ).toBeNull();
  });
  test("uses full dates for an overnight task, rather than comparing HH:mm", () => {
    const today = {
      ...schedule(),
      taskWindow: {
        startsAt: "2026-11-11T22:00:00+08:00",
        endsAt: "2026-11-12T06:00:00+08:00",
      },
    };
    expect(
      taskPunchBlock(today, Date.parse("2026-11-12T01:00:00+08:00")),
    ).toBeNull();
    expect(
      taskPunchBlock(today, Date.parse("2026-11-12T06:00:00+08:00")),
    ).toMatch(/班组长/);
  });
});
