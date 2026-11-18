import { describe, expect, it } from "vitest";

import { statusKindFor } from "../src/components/ui/status-kind";

describe("statusKindFor", () => {
  it("marks normal states ok", () => {
    for (const label of [
      "正常",
      "已通过",
      "已完成",
      "已加入",
      "已确认",
      "核验通过",
      "已打卡",
      "到岗",
      "在场",
      "进行中",
    ])
      expect(statusKindFor(label), label).toBe("ok");
  });
  it("marks things waiting for someone warn", () => {
    for (const label of [
      "待审批",
      "待审核",
      "待打卡",
      "待完成",
      "待整改",
      "待确认",
      "审核中",
      "已暂停",
      "筹备中",
    ])
      expect(statusKindFor(label), label).toBe("warn");
  });
  it("marks exceptions bad", () => {
    for (const label of [
      "缺卡",
      "迟到",
      "早退",
      "缺勤",
      "已驳回",
      "异常",
      "未通过",
      "已过期",
      "已作废",
      "严重",
      "重大",
    ])
      expect(statusKindFor(label), label).toBe("bad");
  });
  it("treats compound and unknown labels sensibly", () => {
    expect(statusKindFor("缺卡 / 迟到")).toBe("bad");
    expect(statusKindFor("07:52 已打卡")).toBe("ok");
    expect(statusKindFor("到点再打")).toBe("idle");
    expect(statusKindFor("已退场")).toBe("idle");
  });
});
