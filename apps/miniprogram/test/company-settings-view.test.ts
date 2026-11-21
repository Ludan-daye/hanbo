import { defaultAttendancePoints, defaultWorktimeRule } from "@construction/domain";
import { describe, expect, test } from "vitest";

import {
  createProjectDefaultsText,
  defaultsProblem,
  defaultsSaveBody,
  defaultsSummary,
  withCheckpoint,
  workdaysText,
} from "../src/pages/company-settings/settings-view";

const values = { name: "每日两次", points: defaultAttendancePoints, workdays: [1, 2, 3, 4, 5, 6], worktime: defaultWorktimeRule };

describe("company settings texts", () => {
  test("save body carries only the writable fields, not the version metadata read back", () => {
    const current = { ...values, createdAt: "2026-11-21T00:00:00.000Z", createdByName: "王总", version: 3 };
    const body = defaultsSaveBody(current, 3);
    expect(Object.keys(body).sort()).toEqual(["expectedVersion", "name", "points", "workdays", "worktime"]);
    expect(body.expectedVersion).toBe(3);
    expect(body.points).toEqual(defaultAttendancePoints);
    expect(body.worktime).toEqual(defaultWorktimeRule);
  });

  test("workdays read as a range or a list", () => {
    expect(workdaysText([1, 2, 3, 4, 5, 6, 7])).toBe("每天");
    expect(workdaysText([6, 1, 2, 3, 4, 5])).toBe("周一到周六");
    expect(workdaysText([1, 3, 5])).toBe("周一、三、五");
  });

  test("one line says what a new project gets", () => {
    expect(defaultsSummary(values)).toBe("每日两次，每天 2 张卡，08:00 上班，周一到周六，加班 18:00 起");
    expect(createProjectDefaultsText(null)).toBe("正在读取公司默认…");
    expect(createProjectDefaultsText({ companyId: "c", current: null, fallback: { ...values, workdays: [1, 2, 3, 4, 5, 6, 7] }, latestVersion: 0 })).toContain("公司还没设默认");
    expect(
      createProjectDefaultsText({ companyId: "c", current: { ...values, createdAt: "", createdByName: null, version: 2 }, fallback: values, latestVersion: 2 }),
    ).toContain("建好当天起用");
  });

  test("checks with the shared domain rules and adds a checkpoint in the last gap", () => {
    expect(defaultsProblem(values)).toBeNull();
    expect(defaultsProblem({ ...values, workdays: [] })).toBe("至少选一个工作日。");
    expect(defaultsProblem({ ...values, worktime: { ...defaultWorktimeRule, lunchStart: "12:00", lunchEnd: null } })).not.toBeNull();
    const added = withCheckpoint(defaultAttendancePoints, "P")!;
    expect(added.map((point) => [point.kind, point.time])).toEqual([
      ["START", "08:00"],
      ["CHECKPOINT", "12:45"],
      ["END", "17:30"],
    ]);
  });
});
