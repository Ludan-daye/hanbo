import { describe, expect, it } from "vitest";
import { workerProjectCardStatus } from "../src/pages/my-projects/worker-card-state";
import type { AttendanceToday } from "../src/services/me.types";
import type { ReadyProjectAttendance } from "../src/services/project-attendance";

const now = "2026-11-01T09:00:00+08:00";
const ready = (
  overrides: Partial<AttendanceToday> = {},
): ReadyProjectAttendance => ({
  status: "ready",
  project: {
    projectId: "project-a",
    projectName: "项目A",
    projectRoleLabel: "工人",
    teamId: null,
    teamName: null,
  },
  today: {
    attendanceDate: "2026-11-01",
    configured: true,
    isWorkday: true,
    shiftName: "日班",
    result: null,
    geofence: {
      centerLatitude: "30",
      centerLongitude: "120",
      radiusM: 100,
      locationAccuracyLimitM: null,
    },
    points: [
      {
        pointCode: "START_CUSTOM",
        label: "上班",
        scheduledTime: "08:00",
        graceMins: 5,
        kind: "START",
        record: null,
      },
    ],
    ...overrides,
  },
});

describe("worker project card status", () => {
  it("keeps an unconfigured empty schedule pending rather than claiming no punch is needed", () => {
    expect(
      workerProjectCardStatus(
        ready({ configured: false, points: [], isWorkday: false }),
        now,
      ),
    ).toBe("待安排");
  });
  it("uses neutral wording for a configured non-workday or no-point day", () => {
    expect(workerProjectCardStatus(ready({ isWorkday: false }), now)).toBe(
      "今日无需打卡",
    );
    expect(workerProjectCardStatus(ready({ points: [] }), now)).toBe(
      "今日无需打卡",
    );
  });
  it("does not treat yesterday's schedule or a failed read as confirmed", () => {
    expect(
      workerProjectCardStatus(ready({ attendanceDate: "2026-10-31" }), now),
    ).toBe("安排待确认");
    expect(
      workerProjectCardStatus(
        { status: "error", project: ready().project, error: "offline" },
        now,
      ),
    ).toBe("安排待确认");
  });
  it("preserves the current task state of a configured workday", () => {
    expect(workerProjectCardStatus(ready(), now)).toBe("待上班");
  });
});
