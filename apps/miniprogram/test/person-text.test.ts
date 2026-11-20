import { describe, expect, it } from "vitest";

import {
  dateLabel,
  joinText,
  maskPhone,
  personInitial,
  personRoleText,
  roleChoicesFor,
  selectedRoleCodes,
  toggleMemberRole,
} from "../src/components/member-role-editor/person-text";
import { memberRoleFields } from "../src/services/member-roles";

describe("person text", () => {
  it("uses the first character of the name as the avatar", () => {
    expect(personInitial("张建国")).toBe("张");
    expect(personInitial("  王师傅")).toBe("王");
    expect(personInitial(null)).toBe("？");
    expect(personInitial("   ")).toBe("？");
  });

  it("joins the parts that exist with a comma, never an interpunct", () => {
    expect(joinText(["钢筋工", null, "钢筋一班", "", false, undefined])).toBe(
      "钢筋工，钢筋一班",
    );
    expect(joinText([null, ""])).toBe("");
  });

  it("masks the middle of an 11-digit phone only", () => {
    expect(maskPhone("13800000001")).toBe("138****0001");
    expect(maskPhone("021-5555")).toBe("021-5555");
  });

  it("writes a date the way people say it", () => {
    expect(dateLabel("2026-11-08")).toBe("2026年11月8日");
    expect(dateLabel("待定")).toBe("待定");
  });
});

describe("personRoleText", () => {
  const worker = {
    participantType: "WORKER" as const,
    projectRoleLabel: "钢筋工",
    teamId: "team-1",
  };

  it("says nothing for a plain worker", () => {
    expect(personRoleText(worker)).toBe("");
  });

  it("names leaders and admins, highest first, each once", () => {
    expect(personRoleText({ ...worker, projectRoleLabel: "TEAM_LEADER" })).toBe(
      "班组长",
    );
    expect(
      personRoleText({
        participantType: "MANAGER",
        projectRoleLabel: "PROJECT_ADMIN",
        teamId: null,
        additionalRoles: [
          { roleCode: "TEAM_LEADER", teamId: "team-1" },
          { roleCode: "TEAM_LEADER", teamId: "team-2" },
          { roleCode: "WORKER", teamId: null },
        ],
      }),
    ).toBe("管理员、班组长");
  });

  it("stays quiet when the role configuration cannot be read", () => {
    expect(
      personRoleText({
        participantType: "MANAGER",
        projectRoleLabel: "安全管理",
        teamId: null,
      }),
    ).toBe("");
  });
});

describe("toggleMemberRole", () => {
  const worker = { roleCode: "WORKER" as const, teamId: null };

  it("adds a team leader that still needs a team", () => {
    const roles = toggleMemberRole([worker], "TEAM_LEADER");
    expect(roles).toEqual([worker, { roleCode: "TEAM_LEADER", teamId: "" }]);
    expect(selectedRoleCodes(roles)).toEqual(["WORKER", "TEAM_LEADER"]);
    // 没选班组就保存，仍然会被原有的检查拦下。
    expect(() => memberRoleFields(roles, "钢筋工", null)).toThrow(
      "请为班组长选择管理班组。",
    );
  });

  it("drops every led team when team leader is switched off", () => {
    const roles = toggleMemberRole(
      [
        worker,
        { roleCode: "TEAM_LEADER", teamId: "team-1" },
        { roleCode: "TEAM_LEADER", teamId: "team-2" },
      ],
      "TEAM_LEADER",
    );
    expect(roles).toEqual([worker]);
  });

  it("can leave nobody selected, which the save check rejects", () => {
    const roles = toggleMemberRole([worker], "WORKER");
    expect(roles).toEqual([]);
    expect(selectedRoleCodes(roles)).toEqual([]);
    expect(() => memberRoleFields(roles, "钢筋工", null)).toThrow();
  });

  it("adds project admin without a team", () => {
    expect(toggleMemberRole([worker], "PROJECT_ADMIN")).toEqual([
      worker,
      { roleCode: "PROJECT_ADMIN", teamId: null },
    ]);
  });
});

describe("role choices", () => {
  it("hides a role the user may not grant, unless the person already has it", () => {
    const worker = [{ roleCode: "WORKER" as const, teamId: null }];
    expect(roleChoicesFor(worker, ["PROJECT_ADMIN"]).map((c) => c.value)).toEqual([
      "WORKER",
      "TEAM_LEADER",
    ]);
    expect(
      roleChoicesFor(
        [{ roleCode: "PROJECT_ADMIN", teamId: null }],
        ["PROJECT_ADMIN"],
      ).map((c) => c.value),
    ).toEqual(["WORKER", "TEAM_LEADER", "PROJECT_ADMIN"]);
    expect(roleChoicesFor(worker, [])).toHaveLength(3);
  });
});
