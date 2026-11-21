import { describe, expect, test } from "vitest";

import { healthLines, healthOrder } from "../src/pages/project-health/health-view";

const project = (overrides: Partial<Parameters<typeof healthLines>[0]>) => ({
  appealPending: 0,
  facePending: 0,
  lowCredit: 0,
  name: "滨江花园",
  projectId: "p-1",
  registrationPending: 0,
  status: "ACTIVE" as const,
  violationPending: 0,
  ...overrides,
});

describe("project health", () => {
  test("lists only backlogs with a count, each linking to its list", () => {
    const lines = healthLines(project({ violationPending: 2, registrationPending: 3 }), "c-1");
    expect(lines.map((line) => [line.title, line.count])).toEqual([
      ["违规待复核", 2],
      ["资料待核实", 3],
    ]);
    expect(lines[1]!.url).toBe("/pages/company-people/index?companyId=c-1&projectId=p-1&status=ACTIVE&registrationStatus=PENDING");
    expect(healthLines(project({}), "c-1")).toEqual([]);
  });

  test("busy projects first, completed ones last", () => {
    const order = healthOrder([
      project({ projectId: "a", name: "甲" }),
      project({ projectId: "b", name: "乙", status: "COMPLETED", facePending: 9 }),
      project({ projectId: "c", name: "丙", lowCredit: 1 }),
    ]);
    expect(order.map((row) => row.projectId)).toEqual(["c", "a", "b"]);
  });
});
