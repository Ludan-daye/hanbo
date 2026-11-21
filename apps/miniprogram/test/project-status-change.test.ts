import { describe, expect, test } from "vitest";

import { statusChangeConfirm } from "../src/pages/project-detail/status-change";

describe("statusChangeConfirm", () => {
  test("pausing or completing asks first and says what stops", () => {
    const completed = statusChangeConfirm("ACTIVE", "COMPLETED");
    expect(completed?.title).toBe("项目改为已完工？");
    expect(completed?.confirmText).toBe("改为已完工");
    expect(completed?.content).toContain("不能再打卡");
    expect(completed?.content).toContain("不再算这个项目的应到人数");
    expect(statusChangeConfirm("ACTIVE", "SUSPENDED")?.confirmText).toBe("改为已暂停");
    expect(statusChangeConfirm("SUSPENDED", "COMPLETED")?.confirmText).toBe("改为已完工");
  });

  test("no question when the status stays or goes back to work", () => {
    expect(statusChangeConfirm("COMPLETED", "COMPLETED")).toBeNull();
    expect(statusChangeConfirm("COMPLETED", "ACTIVE")).toBeNull();
    expect(statusChangeConfirm("PREPARING", "ACTIVE")).toBeNull();
    expect(statusChangeConfirm("ACTIVE", "PREPARING")).toBeNull();
  });
});
