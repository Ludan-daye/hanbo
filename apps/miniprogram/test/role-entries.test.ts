import { describe, expect, test } from "vitest";

import {
  featureUrl,
  scopeKey,
  scopeLine,
  scopeParentName,
  scopeShortName,
} from "../src/components/role-panels/scope";
import { FEATURES } from "../src/routing/features";
import type { PanelKey } from "../src/routing/roleHome";
import type { WorkRoleScope } from "../src/services/management.types";

const PERSONAL: readonly string[] = [
  "/pages/my-projects/index",
  "/pages/my-tasks/index",
  "/pages/my-records/index",
  "/pages/my-makeups/index",
];
const MANAGEMENT_PANELS: readonly PanelKey[] = [
  "teamLeader",
  "projectAdmin",
  "companyAdmin",
  "systemAdmin",
];

describe("FEATURES", () => {
  test("工作台只放管理的事：本人的项目、任务、考勤、补卡只在 worker 这一组", () => {
    for (const panel of MANAGEMENT_PANELS)
      expect(
        FEATURES[panel].filter((feature) => PERSONAL.includes(feature.url)),
      ).toEqual([]);
    expect(FEATURES.worker.map((feature) => feature.url)).toEqual(PERSONAL);
  });

  test("the team leader has exactly the six team entries, in the order of the home grid", () => {
    expect(FEATURES.teamLeader.map((feature) => feature.title)).toEqual([
      "工作安排",
      "班组安全",
      "班组日报",
      "打卡安排",
      "补卡审批",
      "班组考勤",
    ]);
  });

  test("within a panel every entry has its own page, so rows can be keyed by it", () => {
    for (const features of Object.values(FEATURES)) {
      const urls = features.map((feature) => feature.url);
      expect(new Set(urls).size).toBe(urls.length);
    }
  });

  test("the entries picked for the home grids exist in their panels", () => {
    const picks: Readonly<Partial<Record<PanelKey, readonly string[]>>> = {
      projectAdmin: [
        "/pages/participants/index",
        "/pages/reports/index",
        "/pages/project-management/index",
      ],
      companyAdmin: [
        "/pages/company-people/index",
        "/pages/company-reports/index",
        "/pages/create-project/index",
        "/pages/company-projects/index",
      ],
      systemAdmin: [
        "/pages/system-management/index",
        "/pages/safety-policy/index",
        "/pages/schedules/index",
        "/pages/team-makeups/index",
      ],
    };
    for (const [panel, urls] of Object.entries(picks))
      for (const url of urls)
        expect(
          FEATURES[panel as PanelKey].some((feature) => feature.url === url),
        ).toBe(true);
  });

  test("no copy joins pieces of information with a middle dot", () => {
    for (const features of Object.values(FEATURES))
      for (const feature of features)
        expect(`${feature.title}${feature.sub}`).not.toContain("·");
  });
});

describe("scope names and links", () => {
  const team: WorkRoleScope = {
    roleCode: "TEAM_LEADER",
    scopeType: "TEAM",
    scopeId: "t 1",
    scopeName: "滨江花园一期 / 钢筋一班",
    projectId: "p-1",
  };
  const project: WorkRoleScope = {
    roleCode: "PROJECT_ADMIN",
    scopeType: "PROJECT",
    scopeId: "p-1",
    scopeName: "滨江花园一期",
    projectId: "p-1",
  };

  test("a team shows its own name in the header and the project as its parent", () => {
    expect(scopeShortName(team)).toBe("钢筋一班");
    expect(scopeParentName(team)).toBe("滨江花园一期");
    expect(scopeLine(team)).toBe("滨江花园一期，钢筋一班");
  });

  test("other scopes have a single name", () => {
    expect(scopeShortName(project)).toBe("滨江花园一期");
    expect(scopeParentName(project)).toBeUndefined();
    expect(scopeLine(project)).toBe("滨江花园一期");
    expect(scopeShortName({ scopeName: "" })).toBe("");
  });

  test("the same scope under two roles gets two keys", () => {
    expect(scopeKey(team)).toBe("TEAM_LEADER:t 1");
    expect(scopeKey({ roleCode: "WORKER", scopeId: "t 1" })).not.toBe(
      scopeKey(team),
    );
  });

  test("links carry the scope the way the target pages read it", () => {
    expect(featureUrl("/pages/team-work/index", team)).toBe(
      "/pages/team-work/index?teamId=t%201&projectId=p-1",
    );
    expect(featureUrl("/pages/reports/index", project)).toBe(
      "/pages/reports/index?projectId=p-1",
    );
    expect(
      featureUrl("/pages/company-people/index", {
        ...project,
        roleCode: "COMPANY_ADMIN",
        scopeType: "COMPANY",
        scopeId: "c-1",
      }),
    ).toBe("/pages/company-people/index?companyId=c-1");
    expect(featureUrl("/pages/a/index?x=1", project)).toBe(
      "/pages/a/index?x=1&projectId=p-1",
    );
  });

  test("a platform scope or no scope leaves the link alone", () => {
    expect(
      featureUrl("/pages/schedules/index", {
        ...project,
        roleCode: "SYSTEM_ADMIN",
        scopeType: "GLOBAL",
        scopeId: "GLOBAL",
      }),
    ).toBe("/pages/schedules/index");
    expect(featureUrl("/pages/schedules/index", null)).toBe(
      "/pages/schedules/index",
    );
    expect(featureUrl("/pages/schedules/index", undefined)).toBe(
      "/pages/schedules/index",
    );
  });
});
