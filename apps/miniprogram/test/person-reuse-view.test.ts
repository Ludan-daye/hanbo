import { describe, expect, test } from "vitest";

import { sourceStatus } from "../src/pages/person-reuse/reuse-view";

describe("sourceStatus", () => {
  test("a member of a completed or paused project is not 在场", () => {
    expect(sourceStatus("ACTIVE", "COMPLETED")).toBe("原项目已完工");
    expect(sourceStatus("ACTIVE", "SUSPENDED")).toBe("原项目停工");
    expect(sourceStatus("EXITED", "COMPLETED")).toBe("原项目已退场");
  });
  test("an ongoing project reads the member's own status", () => {
    expect(sourceStatus("ACTIVE", "ACTIVE")).toBe("原项目在场");
    expect(sourceStatus("ACTIVE")).toBe("原项目在场");
    expect(sourceStatus("SUSPENDED", "ACTIVE")).toBe("原项目暂停");
    expect(sourceStatus("EXITED", "ACTIVE")).toBe("原项目已退场");
  });
});
