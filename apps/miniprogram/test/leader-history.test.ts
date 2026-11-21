import { describe, expect, it } from "vitest";

import { leaderChangeLine } from "../src/pages/team-detail/leader-history";

const at = "2026-11-20T01:30:00.000Z"; // 北京时间 09:30

describe("负责人变更记录", () => {
  it("说清从谁换成谁、什么时候、谁办的", () => {
    expect(
      leaderChangeLine({
        id: "1",
        changedAt: at,
        reason: "TEAM_UPDATED",
        previousLeaderName: "张建国",
        leaderName: "李明",
        changedByName: "王经理",
      }),
    ).toEqual({ title: "张建国 换成 李明", sub: "11月20日 09:30，王经理 办理" });
    expect(
      leaderChangeLine({
        id: "2",
        changedAt: at,
        reason: "TEAM_UPDATED",
        previousLeaderName: null,
        leaderName: "李明",
        changedByName: null,
      }).title,
    ).toBe("指定 李明");
  });
  it("人员变动自动取消的写原因", () => {
    expect(
      leaderChangeLine({
        id: "3",
        changedAt: at,
        reason: "MEMBER_INACTIVE",
        previousLeaderName: "张建国",
        leaderName: null,
        changedByName: "王经理",
      }),
    ).toEqual({
      title: "取消 张建国",
      sub: "11月20日 09:30，负责人暂停或退场，自动取消",
    });
    expect(
      leaderChangeLine({
        id: "4",
        changedAt: at,
        reason: "MEMBER_OFFBOARDED",
        previousLeaderName: "张建国",
        leaderName: null,
        changedByName: "王经理",
      }).sub,
    ).toBe("11月20日 09:30，负责人离岗，收回管理职务，自动取消");
  });
});
