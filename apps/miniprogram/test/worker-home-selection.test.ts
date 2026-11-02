import { describe, expect, test } from "vitest";

import type {
  AttendanceToday,
  AttendanceTodayPoint,
} from "../src/services/me.types";
import type {
  ProjectAttendance,
  ReadyProjectAttendance,
} from "../src/services/project-attendance";
import {
  resolveWorkerHomeSelection,
  summarizeOtherWorkerProjects,
  workerHomeNextPoint,
  workerHomeStorageKey,
} from "../src/services/worker-home-selection";

const point = (
  pointCode: string,
  scheduledTime: string,
  record: AttendanceTodayPoint["record"] = null,
): AttendanceTodayPoint => ({
  pointCode,
  scheduledTime,
  record,
  label: pointCode,
  kind: "CHECKPOINT",
  graceMins: 5,
});

const recorded = (
  status: "VALID" | "INVALID",
): AttendanceTodayPoint["record"] => ({
  status,
  occurredAt: "2026-10-31T08:00:00+08:00",
  abnormalReason: status === "INVALID" ? "OUTSIDE_GEOFENCE" : null,
});

const ready = (
  projectId: string,
  points: readonly AttendanceTodayPoint[] = [point("CUSTOM_START", "08:00")],
  overrides: Partial<AttendanceToday> = {},
): ReadyProjectAttendance => ({
  project: {
    projectId,
    projectName: `项目 ${projectId}`,
    projectRoleLabel: "工人",
    teamId: "team-1",
    teamName: "钢筋一班",
  },
  status: "ready",
  today: {
    attendanceDate: "2026-10-31",
    configured: true,
    isWorkday: true,
    points,
    shiftName: "自定义班次",
    result: null,
    geofence: {
      centerLatitude: "30.2",
      centerLongitude: "120.2",
      radiusM: 200,
      locationAccuracyLimitM: 100,
    },
    ...overrides,
  },
});

const failed = (projectId: string): ProjectAttendance => ({
  project: ready(projectId).project,
  status: "error",
  error: "安排读取失败",
});

describe("worker home preference isolation", () => {
  const scope = {
    userId: "worker-a",
    dataMode: "http" as const,
    apiBaseUrl: "https://api.example.test/v1",
  };

  test("keeps account, data mode and API environment preferences separate", () => {
    const keys = [
      workerHomeStorageKey(scope),
      workerHomeStorageKey({ ...scope, userId: "worker-b" }),
      workerHomeStorageKey({ ...scope, dataMode: "demo" }),
      workerHomeStorageKey({
        ...scope,
        apiBaseUrl: "https://other.example.test/v1",
      }),
      workerHomeStorageKey({
        ...scope,
        apiBaseUrl: "https://api.example.test/v2",
      }),
    ];
    expect(new Set(keys).size).toBe(5);
  });

  test("treats a trailing API slash as the same environment", () => {
    expect(
      workerHomeStorageKey({ ...scope, apiBaseUrl: `${scope.apiBaseUrl}/` }),
    ).toBe(workerHomeStorageKey(scope));
  });

  test("does not collide when IDs or API paths contain key separators", () => {
    expect(
      workerHomeStorageKey({
        ...scope,
        userId: "b:c",
        apiBaseUrl: "https://example.test/a",
      }),
    ).not.toBe(
      workerHomeStorageKey({
        ...scope,
        userId: "c",
        apiBaseUrl: "https://example.test/a:b",
      }),
    );
  });
});

describe("worker home current project", () => {
  test("keeps an account with no projects unselected", () => {
    expect(resolveWorkerHomeSelection([], null)).toEqual({
      projectId: null,
      reason: "empty",
      preference: null,
    });
  });

  test("automatically selects a first-time account's only project", () => {
    expect(resolveWorkerHomeSelection([ready("a")], null)).toEqual({
      projectId: "a",
      reason: "single",
      preference: { projectId: "a" },
    });
  });

  test("does not silently pick the first project for a first-time multi-project account", () => {
    expect(resolveWorkerHomeSelection([ready("a"), ready("b")], null)).toEqual({
      projectId: null,
      reason: "choice-required",
      preference: null,
    });
  });

  test("restores a remembered project independently of project ordering", () => {
    expect(
      resolveWorkerHomeSelection([ready("b"), ready("a")], { projectId: "a" }),
    ).toEqual({
      projectId: "a",
      reason: "remembered",
      preference: { projectId: "a" },
    });
  });

  test("a schedule read failure does not invalidate the remembered membership", () => {
    expect(
      resolveWorkerHomeSelection([failed("a"), ready("b")], { projectId: "a" })
        .projectId,
    ).toBe("a");
  });

  test("does not replace an invalid remembered project even when only one remains", () => {
    expect(
      resolveWorkerHomeSelection([ready("b")], { projectId: "removed" }),
    ).toEqual({
      projectId: null,
      reason: "invalid",
      preference: { requireSelection: true },
    });
  });

  test("retains the reselect requirement across refreshes and an empty membership interval", () => {
    const invalid = resolveWorkerHomeSelection([], { projectId: "removed" });
    expect(invalid.preference).toEqual({ requireSelection: true });
    const empty = resolveWorkerHomeSelection([], invalid.preference);
    expect(empty.projectId).toBeNull();
    expect(resolveWorkerHomeSelection([ready("b")], empty.preference)).toEqual({
      projectId: null,
      reason: "choice-required",
      preference: { requireSelection: true },
    });
  });

  test("an explicit new choice resolves the invalid selection", () => {
    expect(
      resolveWorkerHomeSelection([ready("b")], { projectId: "b" }).projectId,
    ).toBe("b");
  });
});

describe("other projects remain visible in the home summary", () => {
  test("counts projects once while separating remaining points, abnormal projects and unknown projects", () => {
    const entries = [
      ready("current", [
        point("one", "08:00"),
        point("two", "18:00", recorded("INVALID")),
      ]),
      ready("open", [point("one", "08:00"), point("two", "18:00")]),
      ready("mixed", [
        point("one", "08:00", recorded("INVALID")),
        point("two", "18:00"),
      ]),
      ready("abnormal", [point("one", "08:00", recorded("INVALID"))]),
      ready("complete", [point("one", "08:00", recorded("VALID"))]),
      failed("unknown"),
    ];
    expect(summarizeOtherWorkerProjects(entries, "current")).toEqual({
      pendingProjects: 3,
      remainingPoints: 3,
      abnormalProjects: 2,
      unknownProjects: 1,
    });
  });

  test.each(["isAbsent", "isEarlyLeave", "isLate", "isMissingPunch"] as const)(
    "preserves server %s even when all raw punches are valid",
    (flag) => {
      const entry = ready("a", [point("one", "08:00", recorded("VALID"))], {
        result: {
          attendanceDate: "2026-10-31",
          projectId: "a",
          participantId: "worker-a",
          participantType: "WORKER",
          workedMinutes: 480,
          isAbsent: false,
          isEarlyLeave: false,
          isLate: false,
          isMissingPunch: false,
          [flag]: true,
        },
      });
      expect(summarizeOtherWorkerProjects([entry], null)).toEqual({
        pendingProjects: 1,
        remainingPoints: 0,
        abnormalProjects: 1,
        unknownProjects: 0,
      });
    },
  );

  test("does not invent pending tasks for unconfigured, non-workday or zero-point schedules", () => {
    const entries = [
      ready("unconfigured", undefined, { configured: false }),
      ready("not-required", undefined, { isWorkday: false }),
      ready("empty", []),
    ];
    expect(summarizeOtherWorkerProjects(entries, null)).toEqual({
      pendingProjects: 0,
      remainingPoints: 0,
      abnormalProjects: 0,
      unknownProjects: 0,
    });
  });

  test("includes all projects when nothing is selected without treating unknown schedules as completed", () => {
    expect(
      summarizeOtherWorkerProjects([ready("a"), failed("b")], null),
    ).toEqual({
      pendingProjects: 1,
      remainingPoints: 1,
      abnormalProjects: 0,
      unknownProjects: 1,
    });
  });

  test("treats every mismatched-date schedule as unknown rather than pending, abnormal or completed", () => {
    const entries = [
      ready("stale-open", undefined, { attendanceDate: "2026-10-30" }),
      ready("stale-complete", [point("one", "08:00", recorded("VALID"))], {
        attendanceDate: "2026-10-30",
      }),
      ready("future-abnormal", [point("one", "08:00", recorded("INVALID"))], {
        attendanceDate: "2026-11-01",
      }),
      ready("fresh"),
    ];
    expect(summarizeOtherWorkerProjects(entries, null, "2026-10-31")).toEqual({
      pendingProjects: 1,
      remainingPoints: 1,
      abnormalProjects: 0,
      unknownProjects: 3,
    });
  });
});

describe("home next punch agrees with the punch page's dynamic point choice", () => {
  const entry = ready("a", [
    point("CUSTOM_START", "08:00"),
    point("CHECK_IN", "10:30"),
    point("CUSTOM_END", "18:00"),
  ]);

  test("before all scheduled points it chooses the first open point", () => {
    expect(
      workerHomeNextPoint(entry, "2026-10-31T07:00:00+08:00")?.pointCode,
    ).toBe("CUSTOM_START");
  });

  test("stops offering the old schedule exactly at China midnight", () => {
    expect(workerHomeNextPoint(entry, "2026-10-31T15:59:59Z")?.pointCode).toBe(
      "CUSTOM_END",
    );
    expect(workerHomeNextPoint(entry, "2026-10-31T16:00:00Z")).toBeNull();
  });

  test("does not offer a future-date schedule before that China calendar date", () => {
    expect(workerHomeNextPoint(entry, "2026-10-30T23:59:59+08:00")).toBeNull();
  });

  test("chooses the latest due open point rather than hardcoding a four-punch schedule", () => {
    expect(workerHomeNextPoint(entry, "2026-10-31T02:30:00Z")?.pointCode).toBe(
      "CHECK_IN",
    );
  });

  test("skips both valid and invalid recorded points just like the punch page", () => {
    const completed = ready("a", [
      point("start", "08:00", recorded("VALID")),
      point("check", "10:30", recorded("INVALID")),
      point("end", "18:00"),
    ]);
    expect(
      workerHomeNextPoint(completed, "2026-10-31T04:00:00Z")?.pointCode,
    ).toBe("end");
  });

  test("returns no punch for completed, unreadable or non-working schedules", () => {
    const entries = [
      ready("done", [point("one", "08:00", recorded("VALID"))]),
      failed("error"),
      ready("unconfigured", undefined, { configured: false }),
      ready("not-required", undefined, { isWorkday: false }),
      ready("empty", []),
    ];
    for (const item of entries)
      expect(workerHomeNextPoint(item, "2026-10-31T04:00:00Z")).toBeNull();
  });
});
