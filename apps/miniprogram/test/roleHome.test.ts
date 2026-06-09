import { describe, expect, test } from "vitest";

import { roleHomePanel } from "../src/routing/roleHome";

describe("roleHomePanel", () => {
  test("maps each role to its panel key", () => {
    expect(roleHomePanel("WORKER")).toBe("worker");
    expect(roleHomePanel("TEAM_LEADER")).toBe("teamLeader");
    expect(roleHomePanel("PROJECT_ADMIN")).toBe("projectAdmin");
    expect(roleHomePanel("COMPANY_ADMIN")).toBe("companyAdmin");
    expect(roleHomePanel("SYSTEM_ADMIN")).toBe("systemAdmin");
  });

  test("maps null (bound, no role) to the none panel", () => {
    expect(roleHomePanel(null)).toBe("none");
  });
});
