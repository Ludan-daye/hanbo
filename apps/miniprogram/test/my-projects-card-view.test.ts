import { describe, expect, it } from "vitest";

import {
  primaryProjectId,
  projectCardView,
} from "../src/pages/my-projects/worker-card-state";
import type {
  AttendanceToday,
  AttendanceTodayPoint,
  MyProjectMembership,
} from "../src/services/me.types";
import type { ProjectAttendance } from "../src/services/project-attendance";

// 北京时间 2026-11-01 09:00
const now = "2026-11-01T09:00:00+08:00";
const point = (
  overrides: Partial<AttendanceTodayPoint> = {},
): AttendanceTodayPoint => ({
  pointCode: "START",
  label: "上班",
  scheduledTime: "08:00",
  graceMins: 5,
  kind: "START",
  record: null,
  ...overrides,
});
const valid = (time: string): AttendanceTodayPoint["record"] => ({
  abnormalReason: null,
  occurredAt: `2026-11-01T${time}:00+08:00`,
  status: "VALID",
});
const ready = (
  id: string,
  today: Partial<AttendanceToday> = {},
  project: Partial<MyProjectMembership> = {},
): ProjectAttendance => ({
  status: "ready",
  project: {
    projectId: id,
    projectName: `项目${id}`,
    projectRoleLabel: "工人",
    teamId: null,
    teamName: null,
    ...project,
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
    points: [point()],
    ...today,
  },
});

describe("我的项目：卡片显示什么", () => {
  it("有卡要打：显示下一张卡，操作是去打卡", () => {
    const view = projectCardView(ready("a"), now);
    expect(view.status).toEqual({ kind: "warn", text: "待上班" });
    expect(view.next?.scheduledTime).toBe("08:00");
    expect(view.action).toEqual({
      kind: "punch",
      label: "去打卡",
      url: "/pages/punch/index?projectId=a",
    });
  });

  it("上班卡打了、还没到下班：状态是正常的工作中", () => {
    const view = projectCardView(
      ready("a", {
        points: [
          point({ record: valid("07:55") }),
          point({
            pointCode: "END",
            label: "下班",
            kind: "END",
            scheduledTime: "17:30",
          }),
        ],
      }),
      now,
    );
    expect(view.status).toEqual({ kind: "ok", text: "工作中" });
    expect(view.next?.label).toBe("下班");
  });

  it("安排没读到或不是今天的：只给重新读取，不给打卡", () => {
    const failed = projectCardView(
      { status: "error", project: ready("a").project, error: "网络断了" },
      now,
    );
    expect(failed.status).toEqual({ kind: "warn", text: "安排待确认" });
    expect(failed.hint).toBe("网络断了");
    expect(failed.action).toEqual({ kind: "retry", label: "重新读取安排" });

    const stale = projectCardView(
      ready("a", { attendanceDate: "2026-10-31" }),
      now,
    );
    expect(stale.next).toBeNull();
    expect(stale.action.kind).toBe("retry");
  });

  it("按任务记工的项目去我的任务，不在这里打卡", () => {
    const view = projectCardView(
      ready("a", {}, { taskAttendanceOnly: true }),
      now,
    );
    expect(view.status).toEqual({ kind: "idle", text: "按任务打卡" });
    expect(view.next).toBeNull();
    expect(view.action).toEqual({
      kind: "tasks",
      label: "我的任务",
      url: "/pages/my-tasks/index",
    });
  });

  it("今天没卡要打：操作换成本项目考勤", () => {
    const rest = projectCardView(ready("a b", { isWorkday: false }), now);
    expect(rest.status).toEqual({ kind: "idle", text: "今日无需打卡" });
    expect(rest.hint).toBeNull();
    expect(rest.action).toEqual({
      kind: "records",
      label: "本项目考勤",
      url: "/pages/my-records/index?projectId=a%20b",
    });

    const unset = projectCardView(
      ready("a", { configured: false, isWorkday: false, points: [] }),
      now,
    );
    expect(unset.status.text).toBe("待安排");
    expect(unset.hint).toBe("请联系管理员确认打卡安排。");
  });

  it("都打了但有异常：红色状态，提示去本项目考勤核对", () => {
    const view = projectCardView(
      ready("a", {
        points: [
          point({
            record: {
              abnormalReason: "不在范围内",
              occurredAt: "2026-11-01T08:20:00+08:00",
              status: "INVALID",
            },
          }),
        ],
      }),
      now,
    );
    expect(view.status).toEqual({ kind: "bad", text: "考勤有异常" });
    expect(view.hint).toBe("有异常要核对，到本项目考勤里看原因。");
    expect(view.action.kind).toBe("records");
  });
});

describe("我的项目：哪张卡片用黑按钮", () => {
  const afternoon = ready("afternoon", {
    points: [point({ scheduledTime: "13:00" })],
  });
  const morning = ready("morning");

  it("给下一张卡时间最早的那个项目，不看列表顺序", () => {
    expect(primaryProjectId([afternoon, morning], now)).toBe("morning");
  });

  it("时间一样时按列表顺序", () => {
    expect(primaryProjectId([ready("x"), ready("y")], now)).toBe("x");
  });

  it("没读到的、按任务记工的、没卡要打的都不算", () => {
    expect(
      primaryProjectId(
        [
          { status: "error", project: morning.project, error: "x" },
          ready("task", {}, { taskAttendanceOnly: true }),
          ready("rest", { isWorkday: false }),
        ],
        now,
      ),
    ).toBeNull();
    expect(primaryProjectId([], now)).toBeNull();
  });
});
