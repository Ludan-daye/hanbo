import { describe, expect, it, test } from "vitest";

import { transferModeText, transferPost, transferReviewReason, transferRoute, transferWho, typedReason } from "../src/pages/transfer-approvals/transfer-view";
import { transferStatusLabel } from "../src/services/transfers";

describe("transfer request text", () => {
  test("route, post and who asked", () => {
    expect(transferRoute({ sourceProjectName: "城市更新", targetProjectName: "滨江花园" })).toBe("从 城市更新 调到 滨江花园");
    expect(transferPost({ projectRoleLabel: "TEAM_LEADER", teamName: "钢筋一班" })).toBe("班组长，钢筋一班");
    expect(transferPost({ projectRoleLabel: "木工", teamName: null })).toBe("木工，不分班组");
    expect(
      transferWho({ requestedByName: "李经理", createdAt: "2026-11-18T02:00:00.000Z", reviewedByName: null, reviewedAt: null, status: "PENDING" }),
    ).toBe("李经理 2026-11-18 申请");
    expect(
      transferWho({ requestedByName: "李经理", createdAt: "2026-11-18T02:00:00.000Z", reviewedByName: "王总", reviewedAt: "2026-11-19T02:00:00.000Z", status: "REJECTED" }),
    ).toBe("李经理 2026-11-18 申请，王总 2026-11-19 未同意");
  });
  test("status is shape plus colour", () => {
    expect(transferStatusLabel("PENDING")).toEqual({ kind: "warn", text: "等公司同意" });
    expect(transferStatusLabel("APPROVED")).toEqual({ kind: "ok", text: "已调入" });
    expect(transferStatusLabel("REJECTED")).toEqual({ kind: "bad", text: "未同意" });
  });
});

describe("调走还是兼任", () => {
  it("调走写明原项目办退场，兼任和旧数据写照旧", () => {
    expect(transferModeText({ mode: "MOVE", sourceProjectName: "城市更新" })).toBe("调走：同意后在城市更新办退场");
    expect(transferModeText({ mode: "CONCURRENT", sourceProjectName: "城市更新" })).toBe("兼任：城市更新的身份照旧");
    expect(transferModeText({ sourceProjectName: "城市更新" })).toBe("兼任：城市更新的身份照旧");
  });
  test("handled requests read in the past tense with one wording for rejected", () => {
    expect(
      transferModeText({ mode: "MOVE", sourceProjectName: "城市更新", status: "APPROVED", sourceExitedAt: "2026-11-23T16:00:00.000Z" }),
    ).toBe("已调走，城市更新于 2026-11-24 办退场");
    // Same-day move: the stored exit is the entry day, not a computed day before.
    expect(
      transferModeText({ mode: "MOVE", sourceProjectName: "项目丁", status: "APPROVED", sourceExitedAt: "2026-11-20T16:00:00.000Z" }),
    ).toBe("已调走，项目丁于 2026-11-21 办退场");
    expect(transferModeText({ mode: "MOVE", sourceProjectName: "城市更新", status: "APPROVED", sourceExitedAt: null })).toBe("已调走，城市更新办退场");
    expect(transferModeText({ mode: "CONCURRENT", sourceProjectName: "城市更新", status: "APPROVED" })).toBe("已兼任，城市更新的身份照旧");
    expect(transferModeText({ mode: "MOVE", sourceProjectName: "城市更新", status: "REJECTED" })).toBe("未同意，仍在城市更新（申请的是调走）");
    expect(transferReviewReason({ reviewReason: "人手不够", status: "REJECTED" })).toBe("未同意的理由：人手不够");
    expect(transferReviewReason({ reviewReason: "下周一到", status: "APPROVED" })).toBe("同意时的备注：下周一到");
    expect(transferReviewReason({ reviewReason: null, status: "APPROVED" })).toBeNull();
  });
});

describe("不同意的理由", () => {
  test("typed reason is trimmed and optional", () => {
    expect(typedReason("  人手不够 ")).toBe("人手不够");
    expect(typedReason("   ")).toBeNull();
    expect(typedReason("")).toBeNull();
  });
});
