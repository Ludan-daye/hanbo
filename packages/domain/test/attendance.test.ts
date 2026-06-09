import { describe, expect, test } from "vitest";

import {
  summarizeDailyAttendance,
  type AttendanceRecordInput,
  type AttendanceRecordSource,
  type ShiftRule
} from "../src/attendance.js";

const at = (clock: string): Date => new Date(`2026-06-02T${clock}:00.000+08:00`);

const shiftRule: ShiftRule = {
  segment1StartAt: at("08:00"),
  segment1EndAt: at("12:00"),
  segment2StartAt: at("13:30"),
  segment2EndAt: at("18:00"),
  lateGraceMinutes: 5,
  earlyLeaveGraceMinutes: 5
};

const record = (
  id: string,
  pointCode: AttendanceRecordInput["pointCode"],
  clock: string,
  isValid: boolean,
  source: AttendanceRecordSource
): AttendanceRecordInput => ({
  id,
  pointCode,
  occurredAt: at(clock),
  isValid,
  source
});

describe("summarizeDailyAttendance", (): void => {
  test("sample complete day yields worked minutes with no statuses", (): void => {
    const records: readonly AttendanceRecordInput[] = [
      record("1", "SEGMENT_1_START", "08:01", true, "DEVICE"),
      record("2", "SEGMENT_1_END", "12:03", true, "DEVICE"),
      record("3", "SEGMENT_2_START", "13:29", true, "DEVICE"),
      record("4", "SEGMENT_2_END", "18:02", true, "DEVICE")
    ];

    const summary = summarizeDailyAttendance(shiftRule, records);

    expect(summary.workedMinutes).toBe(515);
    expect(summary.isLate).toBe(false);
    expect(summary.isEarlyLeave).toBe(false);
    expect(summary.isMissingPunch).toBe(false);
    expect(summary.isAbsent).toBe(false);
  });

  test("late uses first segment start and early leave uses second segment end only", (): void => {
    const records: readonly AttendanceRecordInput[] = [
      record("1", "SEGMENT_1_START", "08:06", true, "DEVICE"),
      record("2", "SEGMENT_1_END", "11:00", true, "DEVICE"),
      record("3", "SEGMENT_2_START", "14:30", true, "DEVICE"),
      record("4", "SEGMENT_2_END", "17:54", true, "DEVICE")
    ];

    const summary = summarizeDailyAttendance(shiftRule, records);

    expect(summary.isLate).toBe(true);
    expect(summary.isEarlyLeave).toBe(true);
    expect(summary.isMissingPunch).toBe(false);
    expect(summary.isAbsent).toBe(false);
  });

  test("middle points do not create late or early leave statuses", (): void => {
    const records: readonly AttendanceRecordInput[] = [
      record("1", "SEGMENT_1_START", "08:00", true, "DEVICE"),
      record("2", "SEGMENT_1_END", "11:00", true, "DEVICE"),
      record("3", "SEGMENT_2_START", "14:30", true, "DEVICE"),
      record("4", "SEGMENT_2_END", "18:00", true, "DEVICE")
    ];

    const summary = summarizeDailyAttendance(shiftRule, records);

    expect(summary.isLate).toBe(false);
    expect(summary.isEarlyLeave).toBe(false);
  });

  test("missing punch can still calculate complete first segment duration", (): void => {
    const records: readonly AttendanceRecordInput[] = [
      record("1", "SEGMENT_1_START", "08:00", true, "DEVICE"),
      record("2", "SEGMENT_1_END", "12:00", true, "DEVICE")
    ];

    const summary = summarizeDailyAttendance(shiftRule, records);

    expect(summary.workedMinutes).toBe(240);
    expect(summary.isMissingPunch).toBe(true);
    expect(summary.isAbsent).toBe(false);
  });

  test("invalid records are ignored when selecting attendance points", (): void => {
    const records: readonly AttendanceRecordInput[] = [
      record("invalid-start", "SEGMENT_1_START", "07:30", false, "DEVICE"),
      record("valid-start", "SEGMENT_1_START", "08:00", true, "DEVICE"),
      record("valid-end", "SEGMENT_1_END", "12:00", true, "DEVICE"),
      record("invalid-end", "SEGMENT_1_END", "12:30", false, "DEVICE")
    ];

    const summary = summarizeDailyAttendance(shiftRule, records);

    expect(summary.selectedRecords.SEGMENT_1_START?.id).toBe("valid-start");
    expect(summary.selectedRecords.SEGMENT_1_END?.id).toBe("valid-end");
    expect(records[0]?.isValid).toBe(false);
  });

  test("reversed segment start and end throws contextual error", (): void => {
    const records: readonly AttendanceRecordInput[] = [
      record("start-after-end", "SEGMENT_1_START", "13:00", true, "DEVICE"),
      record("end-before-start", "SEGMENT_1_END", "12:00", true, "DEVICE")
    ];

    try {
      summarizeDailyAttendance(shiftRule, records);
      throw new Error("Expected summarizeDailyAttendance to throw");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(Error);

      const parsedError: unknown = JSON.parse((error as Error).message);

      expect(parsedError).toStrictEqual({
        message: "Attendance segment start occurred after segment end",
        startPointCode: "SEGMENT_1_START",
        endPointCode: "SEGMENT_1_END",
        startRecordId: "start-after-end",
        endRecordId: "end-before-start",
        startOccurredAt: at("13:00").toISOString(),
        endOccurredAt: at("12:00").toISOString()
      });
    }
  });

  test("mutating original input date does not mutate selected summary record", (): void => {
    const startRecord: AttendanceRecordInput = record("start", "SEGMENT_1_START", "08:00", true, "DEVICE");
    const records: readonly AttendanceRecordInput[] = [
      startRecord,
      record("end", "SEGMENT_1_END", "12:00", true, "DEVICE")
    ];

    const summary = summarizeDailyAttendance(shiftRule, records);

    startRecord.occurredAt.setTime(at("09:30").getTime());

    expect(summary.selectedRecords.SEGMENT_1_START).not.toBe(startRecord);
    expect(summary.selectedRecords.SEGMENT_1_START?.occurredAt).not.toBe(startRecord.occurredAt);
    expect(summary.selectedRecords.SEGMENT_1_START?.occurredAt.toISOString()).toBe(at("08:00").toISOString());
  });
});
