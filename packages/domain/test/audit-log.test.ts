import { describe, expect, it } from "vitest";

import {
  auditActionsIn,
  auditCategoryOf,
  auditSentence,
  auditTargetRef,
} from "../src/audit-log.js";

describe("operation log", () => {
  it("files each action under one filter", () => {
    expect(auditCategoryOf("MAKEUP_APPROVED")).toBe("ATTENDANCE");
    expect(auditCategoryOf("team.update")).toBe("TEAM");
    expect(auditCategoryOf("unknown.action")).toBeNull();
    expect(auditActionsIn("SAFETY")).toContain("SAFETY_APPEAL_REVIEWED");
  });

  it("finds what an entry is about", () => {
    expect(
      auditTargetRef({
        action: "MAKEUP_APPROVED",
        entityType: "makeup_request",
        entityId: "m1",
        metadata: { participantId: "w1", participantType: "WORKER" },
      }),
    ).toEqual({ kind: "profile", participantType: "WORKER", id: "w1" });
    expect(
      auditTargetRef({
        action: "project.member.update",
        entityType: "project_member",
        entityId: "pm1",
        metadata: {},
      }),
    ).toEqual({ kind: "member", id: "pm1" });
    expect(
      auditTargetRef({
        action: "TEAM_SAFETY_PUBLISHED",
        entityType: "TeamSafetyBriefing",
        entityId: "b1",
        metadata: { teamId: "t1" },
      }),
    ).toEqual({ kind: "team", id: "t1" });
    expect(
      auditTargetRef({
        action: "project.update",
        entityType: "project",
        entityId: "p1",
        metadata: {},
      }),
    ).toBeNull();
  });

  it("reads as a plain sentence", () => {
    expect(
      auditSentence({ action: "MAKEUP_APPROVED", metadata: {} }, "王经理", "张建国"),
    ).toBe("王经理 批准了 张建国 的补卡申请");
    expect(
      auditSentence(
        { action: "TEAM_TASK_CLOSED", metadata: { status: "CANCELLED" } },
        "李组长",
        "清理楼面",
      ),
    ).toBe("李组长 取消了任务“清理楼面”");
    expect(
      auditSentence({ action: "team.leader.cleared", metadata: {} }, null, null),
    ).toBe("系统 取消了一个班组的负责人");
    expect(auditSentence({ action: "x", metadata: null }, "王经理", null)).toBe(
      "王经理 做了一项其他操作",
    );
  });
});
