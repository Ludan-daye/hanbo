import { describe, expect, test } from "vitest";

import { resolveAdminProjectId } from "../src/routing/projectAdmin";

const me = (assignments: ReadonlyArray<{ roleCode: string; scopeType: string; scopeId: string }>) => ({
  user: { id: "u1", isBound: true, status: "ACTIVE" },
  profile: { type: "MANAGER" as const, id: "m1" },
  roles: {
    assignments: assignments.map((a) => ({ roleCode: a.roleCode, scope: { scopeType: a.scopeType, scopeId: a.scopeId } })),
    highestRoleCode: "PROJECT_ADMIN" as const
  }
});

describe("resolveAdminProjectId", () => {
  test("returns the first PROJECT_ADMIN assignment's scopeId", () => {
    expect(
      resolveAdminProjectId(me([
        { roleCode: "PROJECT_ADMIN", scopeType: "PROJECT", scopeId: "p-1" },
        { roleCode: "PROJECT_ADMIN", scopeType: "PROJECT", scopeId: "p-2" }
      ]) as never)
    ).toBe("p-1");
  });

  test("ignores PROJECT_ADMIN assignments whose scope is not PROJECT", () => {
    expect(
      resolveAdminProjectId(me([
        { roleCode: "PROJECT_ADMIN", scopeType: "GLOBAL", scopeId: "GLOBAL" }
      ]) as never)
    ).toBeNull();
  });

  test("returns null when there are no PROJECT_ADMIN assignments", () => {
    expect(resolveAdminProjectId(me([{ roleCode: "WORKER", scopeType: "PROJECT", scopeId: "p-1" }]) as never)).toBeNull();
  });

  test("returns null when me is null", () => {
    expect(resolveAdminProjectId(null)).toBeNull();
  });
});
