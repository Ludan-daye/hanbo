import { describe, expect, test } from "vitest";
import {
  addWorktimeTotals, classifyWorktime, defaultAttendancePoints, defaultWorktimeRule,
  legacyWorktimeRule, overtimeWorkIntervals, overtimePointCode, resolveWorktimeRule, scheduledWorkIntervals, taskWorkIntervals,
  type WorktimeInterval, type WorktimeRule, type WorktimeRuleVersion,
} from "../src/index.js";

const version = (changes: Partial<WorktimeRule>): WorktimeRuleVersion => ({
  config: { ...defaultWorktimeRule, ...changes }, startsOn: "2026-11-01", version: 1,
});
const at = (time: string): Date => new Date(`2026-11-17T${time}:00+08:00`);
const now: Date = new Date("2026-11-20T12:00:00+08:00");
const interval = (start: string, end: string | null, mode: WorktimeInterval["mode"]): WorktimeInterval => ({
  end: end === null ? null : at(end), mode, start: at(start),
});
const summarize = (rows: readonly WorktimeInterval[], changes: Partial<WorktimeRule>) =>
  classifyWorktime(rows, "2026-11-17", version(changes), now);

describe("classified worktime", () => {
  test("splits continuous work at overtime start, preserving actual minutes", () => {
    expect(summarize([interval("08:00", "20:00", "REGULAR")], {})).toMatchObject({
      normalHours: "10", overtimeHours: "2", overtimeMinutes: 120,
      normalMinutes: 600, workedMinutes: 720,
    });
  });
  test("repair daytime and regular-site tasks count hourly", () => {
    expect(summarize([interval("09:00", "12:00", "HOURLY")], {})).toMatchObject({ normalHours: "3", workedMinutes: 180 });
  });
  test("unions duplicate and overlapping evidence across all three categories", () => {
    expect(summarize([
      interval("08:00", "20:00", "REGULAR"), interval("09:00", "12:00", "HOURLY"),
      interval("18:00", "21:00", "OVERTIME"), interval("18:00", "21:00", "OVERTIME"),
    ], {})).toMatchObject({ overtimeMinutes: 180, normalMinutes: 600, workedMinutes: 780 });
  });
  test("keeps gaps between completed sessions", () => {
    expect(summarize([interval("18:30", "19:00", "OVERTIME"), interval("20:00", "21:00", "OVERTIME")], {})).toMatchObject({ overtimeHours: "1.5", workedMinutes: 90 });
  });
  test("splits overnight actual work by Shanghai date, including month boundary", () => {
    const rows: readonly WorktimeInterval[] = [{ start: new Date("2026-11-30T23:00:00+08:00"), end: new Date("2026-12-01T02:00:00+08:00"), mode: "HOURLY" }];
    const cutoff = new Date("2026-12-02T00:00:00+08:00");
    expect(classifyWorktime(rows, "2026-11-30", version({}), cutoff).overtimeMinutes).toBe(60);
    expect(classifyWorktime(rows, "2026-12-01", version({}), cutoff).overtimeMinutes).toBe(120);
  });
  test("never estimates missing finishes, while retaining other closed intervals", () => {
    expect(summarize([interval("08:00", "12:00", "REGULAR"), interval("18:00", null, "OVERTIME")], {})).toMatchObject({ isPendingVerification: true, overtimeMinutes: 0, workedMinutes: 240 });
  });
  test("lunch deductions affect both total minutes and hours without double deduction", () => {
    const config = { lunchEnd: "13:00", lunchStart: "12:00" };
    expect(summarize([interval("08:00", "17:00", "REGULAR")], config)).toMatchObject({ normalHours: "8", normalMinutes: 480, workedMinutes: 480 });
    expect(summarize([interval("08:00", "12:00", "REGULAR"), interval("13:00", "17:00", "REGULAR")], config)).toMatchObject({ normalHours: "8", normalMinutes: 480, workedMinutes: 480 });
  });
  test("historical work stays unclassified without a rule", () => {
    expect(classifyWorktime([interval("08:00", "20:00", "REGULAR")], "2026-11-17", legacyWorktimeRule, now)).toMatchObject({
      normalMinutes: 0, overtimeMinutes: 0, unclassifiedMinutes: 720, totalHours: "12", workedMinutes: 720,
    });
  });
  test("retains minute precision and sums hours from integer minutes", () => {
    const value = summarize([interval("09:00", "10:29", "HOURLY"), interval("18:00", "22:29", "OVERTIME")], {});
    expect(value).toMatchObject({ normalMinutes: 89, overtimeMinutes: 269, workedMinutes: 358 });
    expect(addWorktimeTotals(value, value).workedMinutes).toBe(716);
  });
  test("future versions never change historical classification", () => {
    const versions = [version({}), { ...version({ overtimeStart: "19:00" }), startsOn: "2026-12-01", version: 2 }];
    expect(resolveWorktimeRule(versions, "2026-10-31")).toEqual(legacyWorktimeRule);
    expect(resolveWorktimeRule(versions, "2026-11-17").version).toBe(1);
    expect(resolveWorktimeRule(versions, "2026-12-01").config.overtimeStart).toBe("19:00");
  });
  test("reuses scheduled selection and ignores invalid/checkpoint evidence", () => {
    const rows = scheduledWorkIntervals(defaultAttendancePoints, "2026-11-17", [
      { id: "a", isValid: true, occurredAt: at("08:00"), pointCode: "START", source: "DEVICE" },
      { id: "b", isValid: false, occurredAt: at("20:00"), pointCode: "END", source: "DEVICE" },
      { id: "c", isValid: true, occurredAt: at("17:00"), pointCode: "END", source: "MAKEUP" },
    ], now, "REGULAR");
    expect(summarize(rows, {}).workedMinutes).toBe(540);
  });
  test("tasks use only actual evidence, cancellation never earns planned time", () => {
    const rows = taskWorkIntervals([{ cancelled: false, endsAt: at("18:00"), finishedAt: at("12:00"), startedAt: at("09:00"), startsAt: at("08:00") }, { cancelled: true, endsAt: at("18:00"), finishedAt: at("18:00"), startedAt: at("13:00"), startsAt: at("13:00") }]);
    expect(summarize(rows, {}).normalHours).toBe("3");
  });
  test("rejects reversed and future evidence", () => {
    expect(() => summarize([interval("10:00", "09:00", "REGULAR")], {})).toThrow("WORKTIME_INTERVAL_INVALID");
    expect(() => classifyWorktime([interval("10:00", "12:00", "REGULAR")], "2026-11-17", version({}), at("11:00"))).toThrow("WORKTIME_INTERVAL_INVALID");
  });
  test("does not mutate evidence and transports summed decimals as strings", () => {
    const rows = Object.freeze([Object.freeze(interval("09:00", "12:00", "HOURLY"))]);
    const value = summarize(rows, {});
    expect(addWorktimeTotals(value, value).normalHours).toBe("6");
    expect(rows[0]?.start).toEqual(at("09:00"));
  });
});

describe("worktime validation", () => {
  test("rejects malformed clock values and invalid dates", () => {
    expect(() => summarize([], { overtimeStart: "25:00" })).toThrow("WORKTIME_RULE_INVALID");
    expect(() => classifyWorktime([], "2026-02-30", version({}), now)).toThrow("WORKTIME_DATE_INVALID");
  });
  test("an unrelated overnight interval does not mark daytime work as overtime", () => {
    const value = summarize([{ start: new Date("2026-11-16T23:00:00+08:00"), end: at("01:00"), mode: "HOURLY" }, interval("09:00", "12:00", "REGULAR")], {});
    expect(value).toMatchObject({ normalMinutes: 180, overtimeMinutes: 60, workedMinutes: 240 });
  });
});

test("overtime evidence pairs by its start date across midnight and ignores invalid ends", () => {
  const rows = overtimeWorkIntervals([
    { id: "start", pointCode: overtimePointCode("2026-11-16", "START"), occurredAt: new Date("2026-11-16T23:00:00+08:00"), isValid: true, source: "DEVICE" },
    { id: "invalid", pointCode: overtimePointCode("2026-11-16", "END"), occurredAt: at("04:00"), isValid: false, source: "DEVICE" },
    { id: "approved", pointCode: overtimePointCode("2026-11-16", "END"), occurredAt: at("02:00"), isValid: true, source: "MAKEUP" },
  ]);
  expect(summarize(rows, {})).toMatchObject({ overtimeMinutes: 120, workedMinutes: 120 });
});
