import { describe, expect, test } from "vitest";

import { attendanceDefaultsError, defaultAttendancePoints } from "../src/attendance.js";
import { worktimeRuleError } from "../src/worktime.js";

describe("company attendance defaults", () => {
  test("accepts ordered points and distinct workdays", () => {
    expect(attendanceDefaultsError({ name: "每日两次", points: defaultAttendancePoints, workdays: [1, 2, 3, 4, 5, 6] })).toBeNull();
  });
  test("rejects duplicate or missing workdays and broken points", () => {
    expect(attendanceDefaultsError({ name: "x", points: defaultAttendancePoints, workdays: [1, 1] })).toBe("工作日不能重复。");
    expect(attendanceDefaultsError({ name: "x", points: defaultAttendancePoints, workdays: [] })).toBe("至少选一个工作日。");
    expect(attendanceDefaultsError({ name: "x", points: [...defaultAttendancePoints].reverse(), workdays: [1] })).not.toBeNull();
    expect(attendanceDefaultsError({ name: " ", points: defaultAttendancePoints, workdays: [1] })).not.toBeNull();
  });
  test("worktime rules need both lunch ends, the end after the start", () => {
    expect(worktimeRuleError({ projectKind: "REGULAR", lunchStart: "12:00", lunchEnd: "13:00", overtimeStart: "18:00" })).toBeNull();
    expect(worktimeRuleError({ projectKind: "REGULAR", lunchStart: "12:00", lunchEnd: null, overtimeStart: null })).not.toBeNull();
    expect(worktimeRuleError({ projectKind: "REPAIR", lunchStart: "13:00", lunchEnd: "12:00", overtimeStart: null })).not.toBeNull();
  });
});
