import { describe, expect, test } from "vitest";

import type {
  AttendanceToday,
  AttendanceTodayPoint,
} from "../src/services/me.types";
import type { ProjectAttendance } from "../src/services/project-attendance";
import {
  cardDeadline,
  cardName,
  pointStatus,
  workerHomeSign,
} from "../src/services/worker-home-sign";

const NOW = "2026-10-31T07:46:00+08:00";

const point = (
  kind: AttendanceTodayPoint["kind"],
  label: string,
  scheduledTime: string,
  record: AttendanceTodayPoint["record"] = null,
): AttendanceTodayPoint => ({
  pointCode: `${kind}-${scheduledTime}`,
  kind,
  label,
  scheduledTime,
  record,
  graceMins: 10,
});

const at = (
  time: string,
  status: "VALID" | "INVALID" = "VALID",
): AttendanceTodayPoint["record"] => ({
  status,
  occurredAt: `2026-10-31T${time}:00+08:00`,
  abnormalReason: status === "INVALID" ? "OUTSIDE_GEOFENCE" : null,
});

const entry = (
  points: readonly AttendanceTodayPoint[],
  overrides: Partial<AttendanceToday> = {},
  project: Partial<ProjectAttendance["project"]> = {},
): ProjectAttendance => ({
  project: {
    projectId: "p1",
    projectName: "滨江花园一期",
    projectRoleLabel: "钢筋工",
    teamId: "t1",
    teamName: "钢筋一班",
    ...project,
  },
  status: "ready",
  today: {
    attendanceDate: "2026-10-31",
    configured: true,
    isWorkday: true,
    points,
    shiftName: "每日两次",
    result: null,
    geofence: {
      centerLatitude: "30.2",
      centerLongitude: "120.2",
      radiusM: 300,
      locationAccuracyLimitM: null,
    },
    ...overrides,
  },
});

const day = [
  point("START", "上班", "08:00"),
  point("END", "下班", "17:30"),
];
const blocker = {
  id: "face",
  title: "底照正在审核",
  description: "审核通过后可打卡，请等待管理员审核。",
  url: "/pages/face-profile/index",
};

describe("card wording", () => {
  test("names the card after its point", () => {
    expect(cardName({ label: "上班" })).toBe("上班卡");
    expect(cardName({ label: "下午下班" })).toBe("下午下班卡");
    expect(cardName({ label: "加班进场打卡" })).toBe("加班进场打卡");
    expect(cardName({ label: "钢筋绑扎完工确认" })).toBe("钢筋绑扎完工确认");
  });

  test("says which side of the scheduled time counts", () => {
    expect(cardDeadline({ kind: "START", scheduledTime: "08:00" })).toBe(
      "08:00 前打",
    );
    expect(cardDeadline({ kind: "END", scheduledTime: "17:30" })).toBe(
      "17:30 后打",
    );
    expect(cardDeadline({ kind: "CHECKPOINT", scheduledTime: "12:00" })).toBe(
      "12:00 打",
    );
  });
});

describe("workerHomeSign", () => {
  test("shows the card that is due", () => {
    expect(workerHomeSign({ entry: entry(day), blocker: null, now: NOW })).toEqual(
      { kind: "punch", card: "上班卡", before: "08:00 前打", projectId: "p1" },
    );
    expect(
      workerHomeSign({
        entry: entry([point("START", "上班", "08:00", at("07:52")), day[1]]),
        blocker: null,
        now: "2026-10-31T17:31:00+08:00",
      }),
    ).toMatchObject({ kind: "punch", card: "下班卡", before: "17:30 后打" });
  });

  test("says why punching is blocked and where to go", () => {
    expect(workerHomeSign({ entry: entry(day), blocker, now: NOW })).toEqual({
      kind: "text",
      title: "底照正在审核",
      sub: "审核通过后可打卡，请等待管理员审核。",
      action: { label: "查看底照", url: "/pages/face-profile/index" },
    });
  });

  test("turns into a conclusion once every card is punched", () => {
    const done = entry(
      [
        point("START", "上班", "08:00", at("07:52")),
        point("END", "下班", "17:30", at("17:34")),
      ],
      {
        result: {
          attendanceDate: "2026-10-31",
          isAbsent: false,
          isEarlyLeave: false,
          isLate: false,
          isMissingPunch: false,
          participantId: "w1",
          participantType: "WORKER",
          projectId: "p1",
          workedMinutes: 510,
        },
      },
    );
    // 都打完了就不再提底照的事。
    expect(
      workerHomeSign({
        entry: done,
        blocker,
        now: "2026-10-31T17:40:00+08:00",
      }),
    ).toEqual({
      kind: "text",
      title: "今天 2 张卡都打了",
      sub: "上班 07:52，下班 17:34，记工 8.5 小时",
    });
    expect(
      workerHomeSign({
        entry: entry([point("START", "上班", "08:00", at("07:52"))]),
        blocker: null,
        now: NOW,
      }),
    ).toMatchObject({ title: "今天的卡打了", sub: "上班 07:52" });
  });

  test("flags an abnormal record instead of calling the day done", () => {
    const sign = workerHomeSign({
      entry: entry([
        point("START", "上班", "08:00", at("08:40", "INVALID")),
        point("END", "下班", "17:30", at("17:34")),
      ]),
      blocker: null,
      now: "2026-10-31T17:40:00+08:00",
    });
    expect(sign).toMatchObject({
      kind: "text",
      title: "卡打了，有异常要核对",
      action: {
        label: "看今天的记录",
        url: "/pages/my-records/index?projectId=p1&range=TODAY",
      },
    });
  });

  test("explains days without a card", () => {
    expect(
      workerHomeSign({
        entry: entry(day, { isWorkday: false }),
        blocker: null,
        now: NOW,
      }),
    ).toMatchObject({ kind: "text", title: "今天不用打卡" });
    expect(
      workerHomeSign({
        entry: entry([], { configured: false }),
        blocker: null,
        now: NOW,
      }),
    ).toMatchObject({
      title: "今天还没排班",
      action: { label: "项目详情" },
    });
    expect(
      workerHomeSign({
        entry: entry(day, {}, { taskAttendanceOnly: true }),
        blocker: null,
        now: NOW,
      }),
    ).toMatchObject({
      title: "按任务开工、完工",
      action: { label: "我的任务", url: "/pages/my-tasks/index" },
    });
  });

  test("asks to reload when today's schedule is unknown", () => {
    const retry = { label: "重新读取", retry: true };
    expect(
      workerHomeSign({
        entry: { project: entry(day).project, status: "error", error: "网络连接未完成" },
        blocker: null,
        now: NOW,
      }),
    ).toEqual({
      kind: "text",
      title: "今天的安排没读到",
      sub: "网络连接未完成",
      action: retry,
    });
    // 过了零点，手里还是昨天的安排。
    expect(
      workerHomeSign({
        entry: entry(day),
        blocker: null,
        now: "2026-11-01T00:01:00+08:00",
      }),
    ).toMatchObject({ title: "今天的安排没读到", action: retry });
  });

  test("says so when there is no project", () => {
    expect(workerHomeSign({ entry: null, blocker: null, now: NOW })).toMatchObject({
      kind: "text",
      title: "还没有加入项目",
    });
  });
});

describe("pointStatus", () => {
  test("describes each point of the day", () => {
    const next = day[0];
    expect(pointStatus(point("START", "上班", "08:00", at("07:52")), null, false)).toEqual({
      kind: "ok",
      text: "07:52 已打卡",
    });
    expect(
      pointStatus(point("START", "上班", "08:00", at("08:40", "INVALID")), null, false),
    ).toEqual({ kind: "bad", text: "08:40 异常" });
    expect(pointStatus(next, next, false)).toEqual({ kind: "warn", text: "待打卡" });
    expect(pointStatus(next, next, true)).toEqual({ kind: "idle", text: "等底照通过" });
    expect(pointStatus(day[1], next, false)).toEqual({ kind: "idle", text: "到点再打" });
  });
});
