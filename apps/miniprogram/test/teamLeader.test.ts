import { describe, expect, test } from "vitest";

import { resolveTeamLeaderTeamId } from "../src/routing/teamLeader";

const me = (assignments: ReadonlyArray<{ roleCode: string; scopeType: string; scopeId: string }>) => ({
  user: { id: "u1", isBound: true, status: "ACTIVE" },
  profile: { type: "MANAGER" as const, id: "m1" },
  roles: {
    assignments: assignments.map((a) => ({ roleCode: a.roleCode, scope: { scopeType: a.scopeType, scopeId: a.scopeId } })),
    highestRoleCode: "TEAM_LEADER" as const
  }
});

describe("resolveTeamLeaderTeamId", () => {
  test("returns the first TEAM_LEADER@TEAM assignment's scopeId", () => {
    expect(
      resolveTeamLeaderTeamId(me([
        { roleCode: "TEAM_LEADER", scopeType: "TEAM", scopeId: "t-1" },
        { roleCode: "TEAM_LEADER", scopeType: "TEAM", scopeId: "t-2" }
      ]) as never)
    ).toBe("t-1");
  });

  test("ignores TEAM_LEADER assignments whose scope is not TEAM", () => {
    expect(
      resolveTeamLeaderTeamId(me([
        { roleCode: "TEAM_LEADER", scopeType: "PROJECT", scopeId: "p-1" }
      ]) as never)
    ).toBeNull();
  });

  test("returns null when there are no TEAM_LEADER assignments", () => {
    expect(resolveTeamLeaderTeamId(me([{ roleCode: "WORKER", scopeType: "PROJECT", scopeId: "p-1" }]) as never)).toBeNull();
  });

  test("returns null when me is null", () => {
    expect(resolveTeamLeaderTeamId(null)).toBeNull();
  });
});
