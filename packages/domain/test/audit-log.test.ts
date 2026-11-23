import { describe, expect, it } from "vitest";

import {
  AUDIT_CATEGORIES,
  auditCategoriesFor,
  PLATFORM_CATEGORY,
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
    expect(auditCategoryOf("project.create")).toBe("COMPANY");
    expect(auditActionsIn("PROJECT")).not.toContain("project.create");
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
      "王经理 收回了 陈工 在 2 个项目的管理职务",
    );
    expect(auditSentence({ action: "project.member.update", metadata: { via: "OFFBOARD" } }, "王经理", "陈工")).toBe(
      "王经理 为离岗调整了 陈工 在本项目的身份",
    );
    expect(auditSentence({ action: "project.member.update", metadata: {} }, "王经理", "陈工")).toBe("王经理 修改了 陈工 的人员资料");
    expect(auditSentence({ action: "PERSONNEL_OFFBOARDED", metadata: { mode: "EXIT_ALL", projectIds: ["a"] } }, "王经理", "陈工")).toBe(
      "王经理 让 陈工 在 1 个项目办了退场",
    );
    expect(auditSentence({ action: "WORKER_REGISTRATION_VIEWED", metadata: { memberId: "m" } }, "李工", "张建国")).toBe("李工 查看了 张建国 的用工资料");
    expect(auditSentence({ action: "COMPANY_DEFAULTS_SAVED", metadata: {} }, "王经理", null)).toBe("王经理 保存了公司默认的打卡安排和工时规则");
  });
});

describe("platform actions on a company (system admin phase 1)", () => {
  it("files company creation, edits and admin appointments under 公司", () => {
    for (const action of ["COMPANY_CREATED", "COMPANY_UPDATED", "COMPANY_ADMIN_APPOINTED", "COMPANY_ADMIN_REVOKED", "COMPANY_ADMIN_INVITATION_ISSUED"])
      expect(auditCategoryOf(action)).toBe("COMPANY");
  });

  it("points appointments at the manager profile", () => {
    expect(
      auditTargetRef({ action: "COMPANY_ADMIN_APPOINTED", entityType: "company_manager_member", entityId: "m1", metadata: { managerProfileId: "p1" } }),
    ).toEqual({ kind: "profile", participantType: "MANAGER", id: "p1" });
    expect(
      auditTargetRef({ action: "COMPANY_ADMIN_REVOKED", entityType: "company_manager_member", entityId: "m1", metadata: {} }),
    ).toBeNull();
  });

  it("says what was done", () => {
    expect(auditSentence({ action: "COMPANY_CREATED", metadata: { name: "瀚渤建设" } }, "平台", null)).toBe("平台 创建了公司“瀚渤建设”");
    expect(auditSentence({ action: "COMPANY_CREATED", metadata: {} }, "平台", null)).toBe("平台 创建了公司");
    expect(auditSentence({ action: "COMPANY_UPDATED", metadata: { changed: ["name", "creditCode"] } }, "平台", null)).toBe("平台 修改了公司的名称、信用代码");
    expect(auditSentence({ action: "COMPANY_UPDATED", metadata: { changed: [] } }, "平台", null)).toBe("平台 修改了公司资料");
    expect(auditSentence({ action: "COMPANY_ADMIN_APPOINTED", metadata: {} }, "平台", "李四")).toBe("平台 任命 李四 为公司管理员");
    expect(auditSentence({ action: "COMPANY_ADMIN_APPOINTED", metadata: { invited: true } }, "平台", "李四")).toBe(
      "平台 任命 李四 为公司管理员，并生成了邀请码",
    );
    expect(auditSentence({ action: "COMPANY_ADMIN_REVOKED", metadata: {} }, "平台", "李四")).toBe("平台 撤销了 李四 的公司管理员身份");
    expect(auditSentence({ action: "COMPANY_ADMIN_INVITATION_ISSUED", metadata: {} }, "平台", "李四")).toBe("平台 重新给 李四 生成了公司管理员邀请码");
  });
});

describe("suspending and resuming a company (system admin phase 3)", () => {
  it("files both under 公司", () => {
    expect(auditCategoryOf("COMPANY_SUSPENDED")).toBe("COMPANY");
    expect(auditCategoryOf("COMPANY_RESUMED")).toBe("COMPANY");
  });

  it("says what was done, with the company name when it was recorded", () => {
    expect(auditSentence({ action: "COMPANY_SUSPENDED", metadata: { name: "瀚渤建设" } }, "平台", null)).toBe("平台 暂停了公司“瀚渤建设”");
    expect(auditSentence({ action: "COMPANY_SUSPENDED", metadata: {} }, "平台", null)).toBe("平台 暂停了公司");
    expect(auditSentence({ action: "COMPANY_RESUMED", metadata: { name: "瀚渤建设" } }, "平台", null)).toBe("平台 恢复了公司“瀚渤建设”");
  });
});

describe("platform actions on accounts and super admins (system admin phase 2)", () => {
  it("files them under 平台, which the project and company filters do not offer", () => {
    for (const action of ["ACCOUNT_DISABLED", "ACCOUNT_ENABLED", "SYSTEM_ADMIN_GRANTED", "SYSTEM_ADMIN_REVOKED"])
      expect(auditCategoryOf(action)).toBe("PLATFORM");
    expect(auditActionsIn("PLATFORM")).toContain("ACCOUNT_DISABLED");
    expect(PLATFORM_CATEGORY).toEqual({ value: "PLATFORM", label: "平台" });
    expect(AUDIT_CATEGORIES.map((item) => item.value)).not.toContain("PLATFORM");
  });

  it("points at the account's profile", () => {
    expect(
      auditTargetRef({ action: "ACCOUNT_DISABLED", entityType: "user", entityId: "u1", metadata: { participantType: "WORKER", profileId: "w1" } }),
    ).toEqual({ kind: "profile", participantType: "WORKER", id: "w1" });
    expect(
      auditTargetRef({ action: "SYSTEM_ADMIN_GRANTED", entityType: "user", entityId: "u1", metadata: { managerProfileId: "p1", source: "cli" } }),
    ).toEqual({ kind: "profile", participantType: "MANAGER", id: "p1" });
    expect(auditTargetRef({ action: "ACCOUNT_ENABLED", entityType: "user", entityId: "u1", metadata: {} })).toBeNull();
  });

  it("says what was done", () => {
    expect(auditSentence({ action: "ACCOUNT_DISABLED", metadata: {} }, "平台", "张三")).toBe("平台 停用了 张三 的账号");
    expect(auditSentence({ action: "ACCOUNT_ENABLED", metadata: {} }, "平台", "张三")).toBe("平台 恢复了 张三 的账号");
    expect(auditSentence({ action: "SYSTEM_ADMIN_GRANTED", metadata: { source: "cli" } }, null, "张三")).toBe(
      "系统 在服务器上把 张三 设为超级管理员",
    );
    expect(auditSentence({ action: "SYSTEM_ADMIN_REVOKED", metadata: { source: "cli" } }, null, "张三")).toBe(
      "系统 在服务器上撤销了 张三 的超级管理员身份",
    );
  });
});

describe("platform operation log (system admin phase 4)", () => {
  const platformCompanyActions = [
    "COMPANY_CREATED",
    "COMPANY_UPDATED",
    "COMPANY_ADMIN_APPOINTED",
    "COMPANY_ADMIN_REVOKED",
    "COMPANY_ADMIN_INVITATION_ISSUED",
    "COMPANY_SUSPENDED",
    "COMPANY_RESUMED",
  ];

  it("offers 平台 only in the platform log", () => {
    expect(auditCategoriesFor("PROJECT").map((item) => item.value)).toEqual(["PEOPLE", "TEAM", "ATTENDANCE", "SAFETY", "PROJECT"]);
    expect(auditCategoriesFor("COMPANY").map((item) => item.value)).toEqual(AUDIT_CATEGORIES.map((item) => item.value));
    expect(auditCategoriesFor("PLATFORM").at(-1)).toEqual(PLATFORM_CATEGORY);
    expect(auditCategoriesFor("PLATFORM")).toHaveLength(AUDIT_CATEGORIES.length + 1);
  });

  it("files what the platform did on a company under 平台 there, and under 公司 in the company's own log", () => {
    for (const action of platformCompanyActions) {
      expect(auditCategoryOf(action)).toBe("COMPANY");
      expect(auditCategoryOf(action, "COMPANY")).toBe("COMPANY");
      expect(auditCategoryOf(action, "PLATFORM")).toBe("PLATFORM");
      expect(auditActionsIn("PLATFORM", "PLATFORM")).toContain(action);
      expect(auditActionsIn("COMPANY", "PLATFORM")).not.toContain(action);
      expect(auditActionsIn("COMPANY")).toContain(action);
    }
    // The company's own actions stay under 公司 in the platform log too.
    expect(auditCategoryOf("project.create", "PLATFORM")).toBe("COMPANY");
    expect(auditActionsIn("COMPANY", "PLATFORM")).toContain("project.create");
    expect(auditActionsIn("PLATFORM", "PLATFORM")).toEqual(
      expect.arrayContaining(["ACCOUNT_DISABLED", "SYSTEM_ADMIN_GRANTED", "SAFETY_POLICY_PUBLISHED"]),
    );
  });

  it("keeps an entry's category equal to the filter that finds it, in every log", () => {
    // Exports are the one known exception: filed under 考勤, also found by 公司.
    for (const kind of ["PROJECT", "COMPANY", "PLATFORM"] as const)
      for (const category of auditCategoriesFor(kind))
        for (const action of auditActionsIn(category.value, kind))
          if (!action.startsWith("report.export"))
            expect([action, auditCategoryOf(action, kind)]).toEqual([action, category.value]);
  });

  it("files a published safety credit policy under 平台 and says which version and from when", () => {
    expect(auditCategoryOf("SAFETY_POLICY_PUBLISHED")).toBe("PLATFORM");
    expect(
      auditSentence({ action: "SAFETY_POLICY_PUBLISHED", metadata: { startsOn: "2026-12-01", version: 3 } }, "平台", null),
    ).toBe("平台 发布了第 3 版安全信用规则，2026年12月1日起执行");
    expect(auditSentence({ action: "SAFETY_POLICY_PUBLISHED", metadata: {} }, "平台", null)).toBe("平台 发布了新的安全信用规则");
  });

  it("files a platform settings change under 平台 and names what changed", () => {
    expect(auditCategoryOf("PLATFORM_SETTINGS_UPDATED")).toBe("PLATFORM");
    expect(auditActionsIn("PLATFORM", "PLATFORM")).toContain("PLATFORM_SETTINGS_UPDATED");
    expect(
      auditSentence({ action: "PLATFORM_SETTINGS_UPDATED", metadata: { changed: ["announcement", "supportPhone"] } }, "平台", null),
    ).toBe("平台 修改了首页公告、平台联系电话");
    expect(auditSentence({ action: "PLATFORM_SETTINGS_UPDATED", metadata: { changed: ["supportPhone"] } }, "平台", null)).toBe(
      "平台 修改了平台联系电话",
    );
    expect(auditSentence({ action: "PLATFORM_SETTINGS_UPDATED", metadata: {} }, "平台", null)).toBe("平台 保存了平台设置");
  });

  it("says what the account-level actions without a company did", () => {
    expect(auditSentence({ action: "auth.bind.worker", metadata: {} }, "张三", null)).toBe("张三 用邀请码绑定了微信");
    expect(auditSentence({ action: "auth.bind.manager", metadata: {} }, "李四", null)).toBe("李四 用邀请码绑定了微信");
    expect(auditSentence({ action: "worker.registration.submit", metadata: {} }, "张三", null)).toBe("张三 提交了用工资料");
    expect(auditSentence({ action: "TEST_ACCOUNT_LOGIN", metadata: {} }, "张三", null)).toBe("张三 用测试账号直接登录");
  });
});
