import { describe, expect, it } from "vitest";

import {
  auditEntryMeta,
  auditEntryNarrowing,
  auditLogScope,
  auditTimeLabel,
  auditTypeOptions,
  narrowOptions,
} from "../src/pages/audit-log/audit-view";

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

describe("平台日志（五级第四期）", () => {
  it("类型：项目没有“公司”，公司没有“平台”，平台都有", () => {
    const labels = (kind: "PROJECT" | "COMPANY" | "PLATFORM") => auditTypeOptions(kind).map((item) => item.label);
    expect(labels("PROJECT")).toEqual(["全部操作", "人员", "班组和任务", "考勤和补卡", "安全", "项目设置"]);
    expect(labels("COMPANY")).toEqual([...labels("PROJECT"), "公司"]);
    expect(labels("PLATFORM")).toEqual([...labels("COMPANY"), "平台"]);
  });

  it("灰字：平台的写公司和项目，公司的写项目，项目的只写时间", () => {
    const entry = { companyName: "瀚渤建设", createdAt: "2026-11-20T01:30:00.000Z", projectName: "一号楼" };
    expect(auditEntryMeta(entry, "PLATFORM", "2026-11-20")).toBe("今天 09:30，瀚渤建设，一号楼");
    expect(auditEntryMeta(entry, "COMPANY", "2026-11-20")).toBe("今天 09:30，一号楼");
    expect(auditEntryMeta(entry, "PROJECT", "2026-11-20")).toBe("今天 09:30");
    expect(auditEntryMeta({ ...entry, companyName: null, projectName: null }, "PLATFORM", "2026-11-20")).toBe("今天 09:30");
  });

  it("选项：全部在前，点记录选中的人不在名单里时补在后面", () => {
    const admins = [{ id: "u1", name: "平台甲" }];
    expect(narrowOptions("所有人", admins, null)).toEqual([
      { value: null, label: "所有人" },
      { value: "u1", label: "平台甲" },
    ]);
    expect(narrowOptions("所有人", admins, { id: "u1", name: "平台甲" })).toHaveLength(2);
    expect(narrowOptions("所有人", admins, { id: "u2", name: "王经理" }).at(-1)).toEqual({ value: "u2", label: "王经理" });
  });

  it("点一条：只看这个人、只看这家公司；已经在看的不再列", () => {
    const entry = { actorName: "平台甲", actorUserId: "u1", companyId: "c1", companyName: "瀚渤建设" };
    expect(auditEntryNarrowing(entry, { actorUserId: null, companyId: null }).map((item) => item.label)).toEqual([
      "只看 平台甲 的操作",
      "只看“瀚渤建设”",
    ]);
    expect(auditEntryNarrowing(entry, { actorUserId: "u1", companyId: null }).map((item) => item.field)).toEqual(["companyId"]);
    expect(auditEntryNarrowing({ ...entry, actorUserId: null, companyId: null }, { actorUserId: null, companyId: null })).toEqual([]);
  });
});
