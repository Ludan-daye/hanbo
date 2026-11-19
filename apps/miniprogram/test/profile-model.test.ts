import { describe, expect, test } from "vitest";

import {
  assignmentLine,
  levelScopeLine,
  levelTitle,
  roleShortName,
} from "../src/pages/permission-levels/levels-model";
import {
  badgeContactLine,
  badgeName,
  badgeRoleLine,
  faceRowStatus,
  recordEntries,
} from "../src/pages/profile/profile-model";
import { permissionLevel } from "../src/routing/permissionLevels";
import type { AccountProfile } from "../src/services/account";
import type { MyFace } from "../src/services/face";
import type { MyProjectMembership } from "../src/services/me.types";

const account = (overrides: Partial<AccountProfile>): AccountProfile => ({
  workerRegistration: "NOT_APPLICABLE",
  realName: "王师傅",
  phone: "13800000003",
  nickname: "老王",
  avatarDataUrl: null,
  isBound: true,
  phoneMasked: "138****0003",
  ...overrides,
});

const membership = (
  overrides: Partial<MyProjectMembership>,
): MyProjectMembership => ({
  projectId: "p-1",
  projectName: "滨江花园一期",
  projectRoleLabel: "TEAM_LEADER",
  teamId: "t-1",
  teamName: "钢筋一班",
  ...overrides,
});

const face = (status: string | null): MyFace => ({
  mode: "VIDEO_ACTION",
  consentText: "",
  consentVersion: "v1",
  profile:
    status === null
      ? null
      : {
          id: "f-1",
          ownerType: "WORKER",
          ownerId: "w-1",
          status,
          version: 1,
          reviewReason: null,
          createdAt: "2026-11-18T00:00:00.000Z",
          reviewedAt: null,
        },
});

describe("the badge", () => {
  test("shows the real name, then the nickname, and says so when neither is filled in", () => {
    expect(badgeName(null)).toBeNull();
    expect(badgeName(account({}))).toBe("王师傅");
    expect(badgeName(account({ realName: null }))).toBe("老王");
    expect(badgeName(account({ realName: null, nickname: null }))).toBe(
      "还没有填姓名",
    );
  });

  test("second line is the role, followed by the team, the project, or how many projects", () => {
    expect(badgeRoleLine("teamLeader", null)).toBe("班组长");
    expect(badgeRoleLine("teamLeader", [])).toBe("班组长");
    expect(badgeRoleLine("teamLeader", [membership({})])).toBe(
      "班组长，钢筋一班",
    );
    expect(
      badgeRoleLine("projectAdmin", [membership({ teamName: null })]),
    ).toBe("项目管理员，滨江花园一期");
    expect(
      badgeRoleLine("worker", [
        membership({}),
        membership({ projectId: "p-2" }),
      ]),
    ).toBe("普通工人，2 个项目");
  });

  test("third line is the masked phone and how the account signs in", () => {
    expect(badgeContactLine(account({}), false)).toBe(
      "138****0003，微信已关联",
    );
    expect(badgeContactLine(account({ phoneMasked: null }), true)).toBe(
      "还没有填手机号，演示账号",
    );
  });
});

describe("faceRowStatus", () => {
  test("says nothing until the profile is read, then names each review state", () => {
    expect(faceRowStatus(null)).toBeUndefined();
    expect(faceRowStatus(face(null))).toEqual({ kind: "warn", text: "待录入" });
    expect(faceRowStatus(face("APPROVED"))).toEqual({
      kind: "ok",
      text: "已通过",
    });
    expect(faceRowStatus(face("PENDING"))).toEqual({
      kind: "warn",
      text: "审核中",
    });
    expect(faceRowStatus(face("REJECTED"))).toEqual({
      kind: "bad",
      text: "未通过",
    });
    expect(faceRowStatus(face("REPLACED"))).toBeUndefined();
  });
});

describe("recordEntries", () => {
  test("a worker sees attendance, makeups and safety credit", () => {
    expect(
      recordEntries({ panel: "worker", workerProfile: true, projectCount: 2 }),
    ).toEqual([
      { title: "我的考勤", url: "/pages/my-records/index?range=MONTH" },
      { title: "补卡记录", url: "/pages/my-makeups/index" },
      { title: "安全信用", url: "/pages/my-safety-credit/index" },
    ]);
  });

  test("a manager gets the four personal entries that left the workspace", () => {
    const entries = recordEntries({
      panel: "teamLeader",
      workerProfile: false,
      projectCount: 2,
    });
    expect(entries.map((entry) => entry.title)).toEqual([
      "我的项目",
      "我的任务",
      "我的考勤",
      "补卡申请",
    ]);
    expect(entries[0]?.value).toBe("2 个项目");
    expect(entries[2]?.url).toBe("/pages/my-records/index");
  });

  test("the project count waits for the read; a worker-type manager also gets safety credit", () => {
    const entries = recordEntries({
      panel: "projectAdmin",
      workerProfile: true,
      projectCount: null,
    });
    expect(entries[0]?.value).toBeUndefined();
    expect(entries[entries.length - 1]?.title).toBe("安全信用");
  });
});

describe("permission levels", () => {
  const leaderOfTeam = {
    roleCode: "TEAM_LEADER",
    scope: { scopeType: "TEAM", scopeId: "t-1" },
  } as const;
  const workerInProject = {
    roleCode: "WORKER",
    scope: { scopeType: "PROJECT", scopeId: "p-1" },
  } as const;

  test("titles use the short role names and Chinese numerals", () => {
    expect(roleShortName("PROJECT_ADMIN")).toBe("项目管理员");
    expect(levelTitle(permissionLevel("WORKER"))).toBe("一级 普通工人");
    expect(levelTitle(permissionLevel("TEAM_LEADER"))).toBe("二级 班组长");
    expect(levelTitle(permissionLevel("SYSTEM_ADMIN"))).toBe("五级 超级管理员");
  });

  test("an assignment names its project and team when the memberships are known", () => {
    const projects = [membership({})];
    expect(assignmentLine(leaderOfTeam, projects)).toBe(
      "所属班组，滨江花园一期，钢筋一班",
    );
    expect(assignmentLine(workerInProject, projects)).toBe(
      "所属项目，滨江花园一期",
    );
    expect(assignmentLine(leaderOfTeam, null)).toBe("所属班组");
    expect(
      assignmentLine(
        {
          roleCode: "SYSTEM_ADMIN",
          scope: { scopeType: "GLOBAL", scopeId: "GLOBAL" },
        },
        projects,
      ),
    ).toBe("整个平台");
  });

  test("the sign names the place only for a single assignment", () => {
    const level = permissionLevel("WORKER");
    const projects = [membership({})];
    expect(levelScopeLine(level, [workerInProject], projects)).toBe(
      "范围：本人。滨江花园一期",
    );
    expect(levelScopeLine(level, [workerInProject], null)).toBe("范围：本人");
    expect(
      levelScopeLine(level, [workerInProject, leaderOfTeam], projects),
    ).toBe("范围：本人");
    expect(levelScopeLine(level, [], projects)).toBe("范围：本人");
  });
});
