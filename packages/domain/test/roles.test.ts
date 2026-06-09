import { describe, expect, test } from "vitest";

import {
  authorizePermission,
  canApproveMakeupRequest,
  canApproveScopedMakeupRequest,
  getEffectivePermissionCodes,
  getHighestRoleCode,
  getInheritedRoleCodes,
  hasRoleAtLeast,
  roleIncludes,
  scopeIncludesTarget,
  type PermissionsByRoleCode,
  type RoleAssignment,
  type ScopedRoleAssignment
} from "../src/roles.js";

const permissionsByRoleCode: PermissionsByRoleCode = {
  COMPANY_ADMIN: ["project.create"],
  PROJECT_ADMIN: ["project.manage"],
  SYSTEM_ADMIN: ["system.manage"],
  TEAM_LEADER: ["makeup.approve"],
  WORKER: ["attendance.submit"]
};

describe("role hierarchy", (): void => {
  test("higher role includes lower role", (): void => {
    expect(roleIncludes("SYSTEM_ADMIN", "WORKER")).toBe(true);
  });

  test("lower role does not include higher role", (): void => {
    expect(roleIncludes("WORKER", "SYSTEM_ADMIN")).toBe(false);
  });

  test("company admin has at least worker role", (): void => {
    const assignments: readonly RoleAssignment[] = [{ roleCode: "COMPANY_ADMIN" }];

    expect(hasRoleAtLeast(assignments, "WORKER")).toBe(true);
  });

  test("self approval is blocked", (): void => {
    const assignments: readonly RoleAssignment[] = [{ roleCode: "SYSTEM_ADMIN" }];

    expect(canApproveMakeupRequest(assignments, "user-1", "user-1")).toBe(false);
  });

  test("non-self team leader can approve makeup request", (): void => {
    const assignments: readonly RoleAssignment[] = [{ roleCode: "TEAM_LEADER" }];

    expect(canApproveMakeupRequest(assignments, "leader-1", "worker-1")).toBe(true);
  });

  test("worker cannot approve makeup request", (): void => {
    const assignments: readonly RoleAssignment[] = [{ roleCode: "WORKER" }];

    expect(canApproveMakeupRequest(assignments, "worker-1", "worker-2")).toBe(false);
  });

  test("system administrator inherits worker permissions", (): void => {
    expect(getInheritedRoleCodes("SYSTEM_ADMIN")).toEqual([
      "SYSTEM_ADMIN",
      "COMPANY_ADMIN",
      "PROJECT_ADMIN",
      "TEAM_LEADER",
      "WORKER"
    ]);

    expect(getEffectivePermissionCodes("SYSTEM_ADMIN", permissionsByRoleCode)).toContain("attendance.submit");
  });

  test("company scope covers projects in the same company", (): void => {
    expect(
      scopeIncludesTarget(
        { scopeId: "company-1", scopeType: "COMPANY" },
        { companyId: "company-1", projectId: "project-1", scopeId: "project-1", scopeType: "PROJECT" }
      )
    ).toBe(true);
  });

  test("project scope does not cover sibling projects", (): void => {
    expect(
      scopeIncludesTarget(
        { scopeId: "project-1", scopeType: "PROJECT" },
        { companyId: "company-1", projectId: "project-2", scopeId: "project-2", scopeType: "PROJECT" }
      )
    ).toBe(false);
  });

  test("permission and scope must come from the same assignment", (): void => {
    const assignments: readonly ScopedRoleAssignment[] = [
      { roleCode: "PROJECT_ADMIN", scope: { scopeId: "project-1", scopeType: "PROJECT" } },
      { roleCode: "WORKER", scope: { scopeId: "project-2", scopeType: "PROJECT" } }
    ];

    expect(
      authorizePermission({
        assignments,
        permissionsByRoleCode,
        requiredPermissionCode: "project.manage",
        targetScope: { companyId: "company-1", projectId: "project-2", scopeId: "project-2", scopeType: "PROJECT" }
      })
    ).toEqual({ isAuthorized: false, reason: "SCOPE_MISMATCH" });
  });

  test("scoped makeup approval blocks self approval", (): void => {
    const assignments: readonly ScopedRoleAssignment[] = [
      { roleCode: "SYSTEM_ADMIN", scope: { scopeId: "GLOBAL", scopeType: "GLOBAL" } }
    ];

    expect(
      canApproveScopedMakeupRequest({
        approverUserId: "user-1",
        assignments,
        permissionsByRoleCode,
        requesterUserId: "user-1",
        targetScope: { companyId: "company-1", projectId: "project-1", scopeId: "project-1", scopeType: "PROJECT" }
      })
    ).toEqual({ isAuthorized: false, reason: "SELF_APPROVAL_BLOCKED" });
  });

  test("team leader can approve makeup requests only inside matching team scope", (): void => {
    const assignments: readonly ScopedRoleAssignment[] = [
      { roleCode: "TEAM_LEADER", scope: { scopeId: "team-1", scopeType: "TEAM" } }
    ];

    expect(
      canApproveScopedMakeupRequest({
        approverUserId: "leader-1",
        assignments,
        permissionsByRoleCode,
        requesterUserId: "worker-1",
        targetScope: {
          companyId: "company-1",
          projectId: "project-1",
          scopeId: "team-1",
          scopeType: "TEAM",
          teamId: "team-1"
        }
      })
    ).toEqual({ isAuthorized: true });

    expect(
      canApproveScopedMakeupRequest({
        approverUserId: "leader-1",
        assignments,
        permissionsByRoleCode,
        requesterUserId: "worker-2",
        targetScope: {
          companyId: "company-1",
          projectId: "project-1",
          scopeId: "team-2",
          scopeType: "TEAM",
          teamId: "team-2"
        }
      })
    ).toEqual({ isAuthorized: false, reason: "SCOPE_MISMATCH" });
  });
});

describe("getHighestRoleCode", () => {
  test("returns the higher-ranked role among assignments", () => {
    expect(
      getHighestRoleCode([{ roleCode: "WORKER" }, { roleCode: "TEAM_LEADER" }])
    ).toBe("TEAM_LEADER");
  });

  test("ranks SYSTEM_ADMIN above all others", () => {
    expect(
      getHighestRoleCode([{ roleCode: "PROJECT_ADMIN" }, { roleCode: "SYSTEM_ADMIN" }])
    ).toBe("SYSTEM_ADMIN");
  });

  test("returns null when there are no assignments", () => {
    expect(getHighestRoleCode([])).toBeNull();
  });
});
