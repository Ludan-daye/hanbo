import { describe, expect, test } from "vitest";

import {
  hasManagementPosts,
  historyLines,
  membershipRoles,
  offboardSummary,
  offboardWords,
  projectAdminLines,
} from "../src/pages/company-admins/admins-view";
import type { CompanyPerson, CompanyPersonMembership } from "../src/services/management.types";

const membership = (overrides: Partial<CompanyPersonMembership>): CompanyPersonMembership => ({
  enteredAt: "2026-10-01T00:00:00.000Z",
  evaluationScore: null,
  exitedAt: null,
  history: [],
  memberId: "m-1",
  projectId: "p-1",
  projectName: "滨江花园",
  projectRoleLabel: "PROJECT_ADMIN",
  projectStatus: "ACTIVE",
  roles: [{ roleCode: "PROJECT_ADMIN", teamId: null, teamName: null }],
  status: "ACTIVE",
  teamId: null,
  teamName: null,
  updatedAt: "2026-10-01T00:00:00.000Z",
  ...overrides,
});

describe("projectAdminLines", () => {
  test("projects without an admin come first and are flagged; completed ones are not", () => {
    const lines = projectAdminLines({
      projects: [
        { projectId: "a", name: "甲", status: "ACTIVE", admins: [{ displayName: "陈工", isBound: false, memberId: "m", participantType: "MANAGER", phone: "1", profileId: "x" }] },
        { projectId: "b", name: "乙", status: "COMPLETED", admins: [] },
        { projectId: "c", name: "丙", status: "PREPARING", admins: [] },
      ],
    });
    expect(lines.map((line) => [line.projectId, line.missing])).toEqual([
      ["c", true],
      ["a", false],
      ["b", false],
    ]);
    expect(lines[1]!.sub).toBe("陈工（未绑定）");
    expect(projectAdminLines(null)).toEqual([]);
  });
});

describe("company person texts", () => {
  test("roles read as Chinese posts, team leaders with their team", () => {
    expect(
      membershipRoles(
        membership({
          projectRoleLabel: "钢筋工",
          roles: [
            { roleCode: "WORKER", teamId: null, teamName: null },
            { roleCode: "TEAM_LEADER", teamId: "t", teamName: "钢筋一班" },
          ],
        }),
      ),
    ).toBe("钢筋工、班组长（钢筋一班）");
    expect(membershipRoles(membership({}))).toBe("项目管理员");
  });

  test("offboarding names the projects it touches and keeps records", () => {
    const person: CompanyPerson = {
      displayName: "陈工",
      isBound: true,
      memberships: [
        membership({}),
        membership({ memberId: "m-2", projectId: "p-2", projectName: "城市更新", projectRoleLabel: "WORKER", roles: [{ roleCode: "WORKER", teamId: null, teamName: null }] }),
        membership({ memberId: "m-3", projectId: "p-3", projectName: "老项目", status: "EXITED" }),
      ],
      participantType: "MANAGER",
      phone: "13800000000",
      profileId: "x",
    };
    expect(offboardSummary(person, "REVOKE_ADMIN").projects).toEqual(["滨江花园"]);
    expect(offboardSummary(person, "EXIT_ALL").projects).toEqual(["滨江花园", "城市更新"]);
    expect(offboardSummary(person, "EXIT_ALL").text).toContain("考勤、补卡记录都保留");
    const plain = { ...person, memberships: [person.memberships[1]!] };
    expect(hasManagementPosts(person)).toBe(true);
    expect(hasManagementPosts(plain)).toBe(false);
    expect(offboardSummary(plain, "REVOKE_ADMIN").text).toContain("不用收回");
    expect(offboardSummary(plain, "REVOKE_ADMIN").text).toContain("所有项目都退场");
  });

  test("the dialog and the button say what the chosen mode does", () => {
    expect(offboardWords("EXIT_ALL")).toEqual({ title: "所有项目都退场", confirm: "确认退场", button: "全部退场" });
    expect(offboardWords("REVOKE_ADMIN")).toEqual({ title: "收回管理职务", confirm: "确认收回", button: "收回管理职务" });
  });

  test("only the newest history row is current; superseded roles read as ended periods", () => {
    const lines = historyLines([
      { projectRoleLabel: "WORKER", recordedAt: "2026-11-21T08:00:00.000Z", status: "EXITED", teamName: null },
      { projectRoleLabel: "WORKER", recordedAt: "2026-11-21T07:00:00.000Z", status: "ACTIVE", teamName: null },
      { projectRoleLabel: "PROJECT_ADMIN", recordedAt: "2026-11-20T02:00:00.000Z", status: "ACTIVE", teamName: null },
    ]);
    expect(lines[0]).toBe("2026-11-21 起 普通工人，已退场");
    expect(lines[1]).toBe("2026-11-21 至 2026-11-21 普通工人");
    expect(lines[2]).toBe("2026-11-20 至 2026-11-21 项目管理员");
    expect(lines.slice(1).join("")).not.toContain("在场");
  });
});
