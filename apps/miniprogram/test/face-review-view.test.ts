import { describe, expect, it } from "vitest";

import {
  faceReviewStatus,
  facesForTab,
  shownFaceId,
  splitAtOpen,
} from "../src/pages/face-review/review-view";
import type { FaceProfile } from "../src/services/face";

const face = (id: string, status: string): FaceProfile => ({
  id,
  ownerType: "WORKER",
  ownerId: `owner-${id}`,
  status,
  version: 1,
  reviewReason: null,
  createdAt: "2026-11-18T01:20:00.000Z",
  reviewedAt: null,
});

describe("face review view", () => {
  const faces = [
    face("a", "PENDING"),
    face("b", "APPROVED"),
    face("c", "PENDING"),
    face("d", "REJECTED"),
  ];

  it("puts pending photos under 待审核 and everything else under 已审核", () => {
    expect(facesForTab(faces, "PENDING").map((row) => row.id)).toEqual([
      "a",
      "c",
    ]);
    expect(facesForTab(faces, "DONE").map((row) => row.id)).toEqual(["b", "d"]);
  });

  it("gives each status a shape and a short label", () => {
    expect(faceReviewStatus("PENDING")).toEqual({
      kind: "warn",
      text: "待审核",
    });
    expect(faceReviewStatus("APPROVED")).toEqual({
      kind: "ok",
      text: "已通过",
    });
    expect(faceReviewStatus("REJECTED")).toEqual({
      kind: "bad",
      text: "未通过",
    });
    expect(faceReviewStatus("REPLACED").kind).toBe("idle");
    // 认不出来的状态也不把英文常量显示出来
    expect(faceReviewStatus("SOMETHING_NEW").text).toBe("已失效");
  });

  it("always has one pending photo open, and none open by default once reviewed", () => {
    const pending = facesForTab(faces, "PENDING");
    const done = facesForTab(faces, "DONE");
    // 刚进来：最前面那条
    expect(shownFaceId(pending, null, "PENDING")).toBe("a");
    // 点开了另一条：就是它
    expect(shownFaceId(pending, "c", "PENDING")).toBe("c");
    // 点开的那条审完了，不在待审核里了：下一条顶上来
    expect(shownFaceId([face("c", "PENDING")], "a", "PENDING")).toBe("c");
    expect(shownFaceId([], "a", "PENDING")).toBeNull();
    // 已审核：不点就都收着
    expect(shownFaceId(done, null, "DONE")).toBeNull();
    expect(shownFaceId(done, "d", "DONE")).toBe("d");
    expect(shownFaceId(done, "a", "DONE")).toBeNull();
  });

  it("expands one item in place and keeps the rest as rows around it", () => {
    const split = splitAtOpen(faces, "c");
    expect(split.before.map((row) => row.id)).toEqual(["a", "b"]);
    expect(split.current?.id).toBe("c");
    expect(split.after.map((row) => row.id)).toEqual(["d"]);
  });

  it("shows every item as a row when nothing is open or the open one is gone", () => {
    for (const openId of [null, "reviewed-elsewhere"]) {
      const split = splitAtOpen(faces, openId);
      expect(split.before).toHaveLength(4);
      expect(split.current).toBeNull();
      expect(split.after).toHaveLength(0);
    }
  });
});
