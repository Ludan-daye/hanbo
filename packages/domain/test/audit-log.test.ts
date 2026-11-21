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

describe("company-level operation log", () => {
  it("keeps one category per action while the company filter finds company actions", () => {
    expect(auditCategoryOf("project.create")).toBe("PROJECT");
    expect(auditCategoryOf("report.export.requested")).toBe("ATTENDANCE");
    expect(auditCategoryOf("PERSONNEL_OFFBOARDED")).toBe("COMPANY");
    expect(auditCategoryOf("WORKER_REGISTRATION_VIEWED")).toBe("PEOPLE");
    expect(auditActionsIn("COMPANY")).toEqual(
      expect.arrayContaining(["project.create", "report.export.requested", "PERSONNEL_OFFBOARDED", "COMPANY_DEFAULTS_SAVED"]),
    );
  });

  it("says who was offboarded and whose registration was viewed", () => {
    expect(
      auditTargetRef({ action: "PERSONNEL_OFFBOARDED", entityType: "manager_profile", entityId: "p1", metadata: { participantType: "MANAGER" } }),
    ).toEqual({ kind: "profile", participantType: "MANAGER", id: "p1" });
    expect(auditSentence({ action: "PERSONNEL_OFFBOARDED", metadata: { mode: "REVOKE_ADMIN", projectIds: ["a", "b"] } }, "王经理", "陈工")).toBe(
      "王经理 收回了 陈工 在2 个项目的管理职务",
    );
    expect(auditSentence({ action: "PERSONNEL_OFFBOARDED", metadata: { mode: "EXIT_ALL", projectIds: ["a"] } }, "王经理", "陈工")).toBe(
      "王经理 让 陈工 在1 个项目办了退场",
    );
    expect(auditSentence({ action: "WORKER_REGISTRATION_VIEWED", metadata: { memberId: "m" } }, "李工", "张建国")).toBe("李工 查看了 张建国 的用工资料");
    expect(auditSentence({ action: "COMPANY_DEFAULTS_SAVED", metadata: {} }, "王经理", null)).toBe("王经理 保存了公司默认的打卡安排和工时规则");
  });
});
