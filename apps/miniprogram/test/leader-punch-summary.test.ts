import { describe, expect, test } from "vitest";

import type {
  AttendanceToday,
  AttendanceTodayPoint,
  MyProjectMembership,
} from "../src/services/me.types";
import type { ProjectAttendance } from "../src/services/project-attendance";
import { leaderPunchSummary } from "../src/services/worker-home-selection";

const now = "2026-10-31T09:00:00+08:00";

const point = (
  pointCode: string,
  scheduledTime: string,
  status: "VALID" | "INVALID" | null = null,
): AttendanceTodayPoint => ({
  pointCode,
  scheduledTime,
  record:
    status === null
      ? null
      : {
          status,
          occurredAt: "2026-10-31T08:00:00+08:00",
          abnormalReason: status === "INVALID" ? "OUTSIDE_GEOFENCE" : null,
        },
  label: pointCode === "START" ? "上班" : "下班",
  kind: "CHECKPOINT",
  graceMins: 5,
});

const ready = (
  projectId: string,
  points: readonly AttendanceTodayPoint[],
  today: Partial<AttendanceToday> = {},
  project: Partial<MyProjectMembership> = {},
): ProjectAttendance => ({
  project: {
    projectId,
    projectName: `项目 ${projectId}`,
    projectRoleLabel: "班组长",
    teamId: "team-1",
    teamName: "钢筋一班",
    ...project,
  },
  status: "ready",
  today: {
    attendanceDate: "2026-10-31",
    configured: true,
    isWorkday: true,
    points,
    shiftName: "白班",
    result: null,
    geofence: {
      centerLatitude: "30.2",
      centerLongitude: "120.2",
      radiusM: 200,
      locationAccuracyLimitM: 100,
    },
    ...today,
  },
});

const failed = (projectId: string): ProjectAttendance => ({
  project: {
    projectId,
    projectName: `项目 ${projectId}`,
    projectRoleLabel: "班组长",
    teamId: "team-1",
    teamName: "钢筋一班",
  },
  status: "error",
  error: "安排读取失败",
});

describe("leader punch summary", () => {
  test("hides the card when no project needs a punch today", () => {
    expect(
      leaderPunchSummary([ready("a", [], { isWorkday: false })], now),
    ).toEqual({ kind: "none" });
  });

  test("shows the next open point with today's progress", () => {
    expect(
      leaderPunchSummary(
        [ready("a", [point("START", "08:00", "VALID"), point("END", "17:00")])],
        now,
      ),
    ).toEqual({
      kind: "pending",
      projectId: "a",
      projectName: "项目 a",
      pointLabel: "下班",
      scheduledTime: "17:00",
      completed: 1,
      total: 2,
      otherProjects: 0,
    });
  });

  test("counts other projects that still need a punch", () => {
    const summary = leaderPunchSummary(
      [ready("a", [point("START", "08:00")]), ready("b", [point("START", "08:00")])],
      now,
    );
    expect(summary).toMatchObject({
      kind: "pending",
      projectId: "a",
      otherProjects: 1,
    });
  });

  test("reports completion when every point is recorded", () => {
    expect(
      leaderPunchSummary([ready("a", [point("START", "08:00", "VALID")])], now),
    ).toEqual({ kind: "done", completed: 1, total: 1, abnormal: false });
  });

  test("flags a completed day that has an invalid record", () => {
    expect(
      leaderPunchSummary([ready("a", [point("START", "08:00", "INVALID")])], now),
    ).toEqual({ kind: "done", completed: 1, total: 1, abnormal: true });
  });

  test("does not claim completion when a project failed to load", () => {
    expect(
      leaderPunchSummary(
        [ready("a", [point("START", "08:00", "VALID")]), failed("b")],
        now,
      ),
    ).toEqual({ kind: "unknown" });
  });

  test("does not claim completion for a schedule from another day", () => {
    expect(
      leaderPunchSummary(
        [
          ready("a", [point("START", "08:00")], {
            attendanceDate: "2026-10-30",
          }),
        ],
        now,
      ),
    ).toEqual({ kind: "unknown" });
  });

  test("skips task-only projects, which punch from the task list", () => {
    expect(
      leaderPunchSummary(
        [
          ready("a", [point("START", "08:00")], {}, {
            taskAttendanceOnly: true,
          }),
        ],
        now,
      ),
    ).toEqual({ kind: "none" });
  });
});
