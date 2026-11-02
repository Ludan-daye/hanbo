import { describe, expect, test } from "vitest";
import type {
  AttendanceRecord,
  Makeup,
  MyAttendanceDay,
} from "../src/services/me.types";
import {
  attendanceWindow,
  groupAttendanceDays,
  filterAttendance,
  attendanceRangeError,
  attendanceProjectOptions,
  attendanceRequestKey,
} from "../src/services/worker-records";
import { summarizeWorkerMonth } from "../src/services/worker-home";

const raw = (
  id: string,
  date: string,
  projectId = "p1",
  status = "VALID",
): AttendanceRecord =>
  ({
    id,
    attendanceDate: date,
    projectId,
    status,
    occurredAt: `${date}T08:00:00+08:00`,
    pointCode: "CUSTOM_CHECK",
    pointLabel: "现场签到",
  }) as AttendanceRecord;
const makeup = (
  id: string,
  date: string,
  projectId = "p1",
  status = "APPROVED",
): Makeup =>
  ({
    id,
    attendanceDate: date,
    projectId,
    status,
    requestedOccurredAt: `${date}T08:00:00+08:00`,
    pointCode: "CUSTOM_CHECK",
  }) as Makeup;
const day = (
  date: string,
  projectId = "p1",
  workedMinutes = 480,
): MyAttendanceDay =>
  ({
    attendanceDate: date,
    projectId,
    workedMinutes,
    approvedMakeupCount: 0,
    isMissingPunch: false,
    isAbsent: false,
    isLate: false,
    isEarlyLeave: false,
    teamName: "钢筋班",
  }) as MyAttendanceDay;

describe("worker attendance date windows", () => {
  test("month and today follow China date rollover", () => {
    expect(
      attendanceWindow("MONTH", "2026-11-01", {
        from: "2026-10-01",
        to: "2026-10-31",
      }),
    ).toEqual({ from: "2026-11-01", to: "2026-11-01" });
    expect(
      attendanceWindow("TODAY", "2026-11-02", { from: "", to: "" }),
    ).toEqual({ from: "2026-11-02", to: "2026-11-02" });
  });
  test("last seven days cross year and leap month boundaries", () => {
    expect(
      attendanceWindow("WEEK", "2027-01-02", { from: "", to: "" }).from,
    ).toBe("2026-12-27");
    expect(
      attendanceWindow("WEEK", "2024-03-01", { from: "", to: "" }).from,
    ).toBe("2024-02-24");
  });
  test("custom selection survives rollover", () => {
    expect(
      attendanceWindow("CUSTOM", "2026-11-01", {
        from: "2026-10-10",
        to: "2026-10-20",
      }),
    ).toEqual({ from: "2026-10-10", to: "2026-10-20" });
  });
  test("validates backend 93-day window and inverted dates", () => {
    expect(attendanceRangeError("2026-01-01", "2026-04-03")).toBeNull();
    expect(attendanceRangeError("2026-01-01", "2026-04-04")).not.toBeNull();
    expect(attendanceRangeError("2026-11-02", "2026-11-01")).not.toBeNull();
  });
});

describe("worker attendance layers", () => {
  test("historical project names remain available after membership ends", () => {
    const options = attendanceProjectOptions(
      [],
      {
        days: [{ ...day("2026-10-30"), projectName: "已退场的历史工地" }],
        records: [raw("r", "2026-10-30", "p2")],
        makeups: [],
      },
      "p3",
    );
    expect(options).toEqual([
      { id: "", name: "全部项目" },
      { id: "p1", name: "已退场的历史工地" },
      { id: "p2", name: "项目 p2" },
      { id: "p3", name: "项目 p3" },
    ]);
  });
  test("custom range refetches after midnight even when its dates stay unchanged", () => {
    expect(
      attendanceRequestKey("2026-10-01", "2026-10-31", 0, "2026-10-31"),
    ).not.toBe(
      attendanceRequestKey("2026-10-01", "2026-10-31", 0, "2026-11-01"),
    );
  });
  test("approved makeup without raw punch still has a visible day", () => {
    const groups = groupAttendanceDays([], [], [makeup("m", "2026-10-30")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].summary).toBeNull();
    expect(groups[0].records).toEqual([]);
    expect(groups[0].makeups.map((m) => m.id)).toEqual(["m"]);
  });
  test("groups by both project and date, preserving all three layers", () => {
    const groups = groupAttendanceDays(
      [day("2026-10-30")],
      [raw("r1", "2026-10-30"), raw("r2", "2026-10-30", "p2")],
      [makeup("m", "2026-10-30")],
    );
    expect(groups).toHaveLength(2);
    expect(
      groups.find((g) => g.projectId === "p1")?.summary?.workedMinutes,
    ).toBe(480);
    expect(groups.find((g) => g.projectId === "p1")?.makeups).toHaveLength(1);
    expect(groups.find((g) => g.projectId === "p2")?.summary).toBeNull();
  });
  test("summary-only day and invalid raw records are not removed", () => {
    const groups = groupAttendanceDays(
      [day("2026-10-29")],
      [raw("r", "2026-10-30", "p1", "INVALID")],
      [],
    );
    expect(groups.map((g) => g.date)).toEqual(["2026-10-30", "2026-10-29"]);
    expect(groups[0].records[0].status).toBe("INVALID");
  });
  test("filters dates and project consistently across all data layers", () => {
    const result = filterAttendance(
      {
        days: [day("2026-10-30"), day("2026-10-30", "p2")],
        records: [
          raw("r1", "2026-10-30"),
          raw("old", "2026-09-01"),
          raw("r2", "2026-10-30", "p2"),
        ],
        makeups: [
          makeup("m", "2026-10-30"),
          makeup("pending", "2026-10-30", "p1", "PENDING"),
          makeup("rejected", "2026-10-30", "p1", "REJECTED"),
        ],
      },
      "p1",
      "2026-10-01",
      "2026-10-31",
    );
    expect(result.days).toHaveLength(1);
    expect(result.records.map((r) => r.id)).toEqual(["r1"]);
    expect(result.makeups.map((m) => m.id)).toEqual(["m"]);
  });
  test("existing totals deduplicate natural days, sum minutes, count makeup-only attendance", () => {
    const filtered = filterAttendance(
      {
        days: [day("2026-10-30", "p1", 90), day("2026-10-30", "p2", 45)],
        records: [
          raw("r", "2026-10-30"),
          raw("r2", "2026-10-30", "p2"),
          raw("invalid", "2026-10-29", "p1", "INVALID"),
        ],
        makeups: [makeup("m", "2026-10-28")],
      },
      null,
      "2026-10-01",
      "2026-10-31",
    );
    const totals = summarizeWorkerMonth(
      filtered.days,
      filtered.records,
      filtered.makeups,
      "2026-10-01",
      "2026-10-31",
    );
    expect(totals.attendedDays).toBe(2);
    expect(totals.workedMinutes).toBe(135);
  });
});
