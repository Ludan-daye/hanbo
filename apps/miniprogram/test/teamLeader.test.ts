import { describe, expect, test } from "vitest";

import { resolveManagedTeamId, resolveTeamLeaderTeamId } from "../src/routing/teamLeader";

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

describe("resolveManagedTeamId", () => {
  const leader = me([{ roleCode: "TEAM_LEADER", scopeType: "TEAM", scopeId: "t-1" }]) as never;
  const projectAdmin = me([{ roleCode: "PROJECT_ADMIN", scopeType: "PROJECT", scopeId: "p-1" }]) as never;
  test("a team leader opens only their own teams", () => {
    expect(resolveManagedTeamId(leader, "t-1", "p-1")).toBe("t-1");
    expect(resolveManagedTeamId(leader, "t-9", "p-1")).toBe("t-1");
    expect(resolveManagedTeamId(leader, undefined, undefined)).toBe("t-1");
  });
  test("a project admin opens any team of their project (the server checks the team belongs to it)", () => {
    expect(resolveManagedTeamId(projectAdmin, "t-5", "p-1")).toBe("t-5");
    expect(resolveManagedTeamId(projectAdmin, "t-5", "p-2")).toBeNull();
    expect(resolveManagedTeamId(projectAdmin, "t-5", undefined)).toBeNull();
    expect(resolveManagedTeamId(projectAdmin, undefined, "p-1")).toBeNull();
  });
  test("company admins open teams through links", () => {
    const company = me([{ roleCode: "COMPANY_ADMIN", scopeType: "COMPANY", scopeId: "c-1" }]) as never;
    expect(resolveManagedTeamId(company, "t-5", "p-1")).toBe("t-5");
  });
});
