import type { TeamTask } from "@construction/domain";
import { describe, expect, it } from "vitest";

import {
  canApplyFinishMakeup,
  canPunchTask,
  primaryTaskId,
  startedAtLabel,
  taskProgress,
} from "../src/pages/my-tasks/task-view";

type Assignment = TeamTask["assignments"][number];
const me = (overrides: Partial<Assignment> = {}): Assignment => ({
  memberId: "member-1",
  name: "张建国",
  source: "INVITED",
  taskAttendanceOnly: true,
  startedAt: null,
  finishedAt: null,
  exitConfirmedAt: null,
  ...overrides,
});
const task = (
  id: string,
  startsAt: string,
  assignment: Partial<Assignment> = {},
  status: TeamTask["status"] = "OPEN",
): Pick<TeamTask, "id" | "status" | "startsAt" | "assignments"> => ({
  id,
  status,
  startsAt,
  assignments: [me(assignment)],
});
const started = "2026-11-18T00:05:00.000Z"; // 北京时间 08:05

describe("我的任务：进度和能做的操作", () => {
  it("进度分待开工、作业中、已完工", () => {
    expect(taskProgress(me())).toEqual({ kind: "warn", text: "待开工" });
    expect(taskProgress(me({ startedAt: started }))).toEqual({
      kind: "warn",
      text: "作业中",
    });
    expect(
      taskProgress(me({ startedAt: started, finishedAt: started })),
    ).toEqual({ kind: "ok", text: "已完工" });
  });

  it("只有当天、任务开着、没完工也没退场时能打卡", () => {
    const open = { status: "OPEN" } as const;
    expect(canPunchTask(open, me(), true)).toBe(true);
    expect(canPunchTask(open, me(), false)).toBe(false);
    expect(canPunchTask({ status: "COMPLETED" }, me(), true)).toBe(false);
    expect(canPunchTask(open, me({ finishedAt: started }), true)).toBe(false);
    expect(canPunchTask(open, me({ exitConfirmedAt: started }), true)).toBe(
      false,
    );
  });

  it("开了工还没完工才能申请完工补卡", () => {
    const open = { status: "OPEN" } as const;
    expect(canApplyFinishMakeup(open, me(), true)).toBe(false);
    expect(canApplyFinishMakeup(open, me({ startedAt: started }), true)).toBe(
      true,
    );
    expect(
      canApplyFinishMakeup(
        open,
        me({ startedAt: started, finishedAt: started }),
        true,
      ),
    ).toBe(false);
    expect(canApplyFinishMakeup(open, me({ startedAt: started }), false)).toBe(
      false,
    );
  });

  it("开工时间：当天只写几点，隔天带日期", () => {
    expect(startedAtLabel(started, "2026-11-18")).toBe("08:05");
    expect(startedAtLabel(started, "2026-11-19")).toBe("11月18日 08:05");
  });
});

describe("我的任务：哪项任务用黑按钮", () => {
  const late = task("late", "2026-11-18T06:00:00.000Z");
  const early = task("early", "2026-11-18T00:00:00.000Z");

  it("正在做的那项优先", () => {
    const working = task("working", "2026-11-18T08:00:00.000Z", {
      startedAt: started,
    });
    expect(primaryTaskId([early, working, late], true)).toBe("working");
  });

  it("都没开工时给计划最早开始的那项", () => {
    expect(primaryTaskId([late, early], true)).toBe("early");
  });

  it("不能打卡的任务不算", () => {
    const done = task("done", "2026-11-17T00:00:00.000Z", {
      startedAt: started,
      finishedAt: started,
    });
    const cancelled = task(
      "cancelled",
      "2026-11-17T00:00:00.000Z",
      {},
      "CANCELLED",
    );
    const regular = task("regular", "2026-11-17T00:00:00.000Z", {
      taskAttendanceOnly: false,
    });
    expect(primaryTaskId([done, cancelled, regular, late], true)).toBe("late");
    expect(primaryTaskId([done, cancelled, regular], true)).toBeNull();
    // 看的不是今天：都不能打卡
    expect(primaryTaskId([late, early], false)).toBeNull();
  });
});
