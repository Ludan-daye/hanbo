import { describe, expect, test } from "vitest";

import { resolveCompanyAdminCompanyId } from "../src/routing/companyAdmin";

const me = (assignments: ReadonlyArray<{ roleCode: string; scopeType: string; scopeId: string }>) => ({
  user: { id: "u1", isBound: true, status: "ACTIVE" },
  profile: { type: "MANAGER" as const, id: "m1" },
  roles: {
    assignments: assignments.map((a) => ({ roleCode: a.roleCode, scope: { scopeType: a.scopeType, scopeId: a.scopeId } })),
    highestRoleCode: "COMPANY_ADMIN" as const
  }
});

describe("resolveCompanyAdminCompanyId", () => {
  test("returns the first COMPANY_ADMIN@COMPANY assignment's scopeId", () => {
    expect(
      resolveCompanyAdminCompanyId(me([
        { roleCode: "COMPANY_ADMIN", scopeType: "COMPANY", scopeId: "c-1" },
        { roleCode: "COMPANY_ADMIN", scopeType: "COMPANY", scopeId: "c-2" }
      ]) as never)
    ).toBe("c-1");
  });

  test("ignores COMPANY_ADMIN assignments whose scope is not COMPANY", () => {
    expect(
      resolveCompanyAdminCompanyId(me([
        { roleCode: "COMPANY_ADMIN", scopeType: "GLOBAL", scopeId: "GLOBAL" }
      ]) as never)
    ).toBeNull();
  });

  test("returns null when there are no COMPANY_ADMIN assignments", () => {
    expect(resolveCompanyAdminCompanyId(me([{ roleCode: "PROJECT_ADMIN", scopeType: "PROJECT", scopeId: "p-1" }]) as never)).toBeNull();
  });

  test("returns null when me is null", () => {
    expect(resolveCompanyAdminCompanyId(null)).toBeNull();
  });
});
