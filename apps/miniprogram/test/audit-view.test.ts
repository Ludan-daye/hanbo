import { describe, expect, it } from "vitest";

import { auditLogScope, auditTimeLabel } from "../src/pages/audit-log/audit-view";

describe("操作记录", () => {
  it("链接带项目看项目；从公司工作台进来看公司", () => {
    expect(
      auditLogScope({ projectParam: "p1", companyParam: undefined, projectId: "p1", companyId: "c1" }),
    ).toEqual({ kind: "PROJECT", id: "p1" });
    expect(
      auditLogScope({ projectParam: undefined, companyParam: "c1", projectId: "p1", companyId: "c1" }),
    ).toEqual({ kind: "COMPANY", id: "c1" });
    expect(
      auditLogScope({ projectParam: undefined, companyParam: undefined, projectId: "p1", companyId: null }),
    ).toEqual({ kind: "PROJECT", id: "p1" });
    expect(
      auditLogScope({ projectParam: undefined, companyParam: undefined, projectId: null, companyId: null }),
    ).toBeNull();
  });
  it("今天只写几点，今年写月日，往年带年份", () => {
    expect(auditTimeLabel("2026-11-20T01:30:00.000Z", "2026-11-20")).toBe("今天 09:30");
    expect(auditTimeLabel("2026-11-18T01:30:00.000Z", "2026-11-20")).toBe("11月18日 09:30");
    expect(auditTimeLabel("2025-12-31T01:30:00.000Z", "2026-11-20")).toBe("2025年12月31日 09:30");
  });
});
