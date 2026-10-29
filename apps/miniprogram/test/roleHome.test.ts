import { describe, expect, test } from "vitest";

import { roleHomePanel } from "../src/routing/roleHome";
import {
  PERMISSION_LEVELS,
  participantPermissionRole,
  permissionLevel,
} from "../src/routing/permissionLevels";
import { ROLE_LEVEL } from "../../../packages/domain/src/roles";

describe("roleHomePanel", () => {
  test("maps each role to its panel key", () => {
    expect(roleHomePanel("WORKER")).toBe("worker");
    expect(roleHomePanel("TEAM_LEADER")).toBe("teamLeader");
    expect(roleHomePanel("PROJECT_ADMIN")).toBe("projectAdmin");
    expect(roleHomePanel("COMPANY_ADMIN")).toBe("companyAdmin");
    expect(roleHomePanel("SYSTEM_ADMIN")).toBe("systemAdmin");
    expect(PERMISSION_LEVELS.map((entry) => entry.level)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    for (const entry of PERMISSION_LEVELS) {
      expect(entry.level).toBe(ROLE_LEVEL[entry.roleCode]);
    }
    const leaderRole = participantPermissionRole({
      participantType: "MANAGER",
      projectRoleLabel: "TEAM_LEADER",
    });
    expect(permissionLevel(leaderRole).category).toBe("WORKER");
    expect(permissionLevel("PROJECT_ADMIN").category).toBe("MANAGEMENT");
  });

  test("maps null (bound, no role) to the none panel", () => {
    expect(roleHomePanel(null)).toBe("none");
  });
});
