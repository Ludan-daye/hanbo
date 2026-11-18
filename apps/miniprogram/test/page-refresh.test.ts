import { describe, expect, it } from "vitest";

import { shouldRefreshOnShow } from "../src/hooks/use-page-refresh";

const base = {
  now: 100_000,
  writesAtLastRefresh: 3,
  writesNow: 3,
  minIntervalMs: 30_000,
};

describe("shouldRefreshOnShow", () => {
  it("refreshes on first show", () =>
    expect(shouldRefreshOnShow({ ...base, lastRefreshAt: null })).toBe(true));

  // 打卡途中拍照、刷脸会让页面隐藏再显示，不能因此重读。
  it("skips when shown again within the interval and nothing was written", () =>
    expect(shouldRefreshOnShow({ ...base, lastRefreshAt: 95_000 })).toBe(
      false,
    ));

  it("refreshes after the interval", () =>
    expect(shouldRefreshOnShow({ ...base, lastRefreshAt: 70_000 })).toBe(true));

  // 在子页面办了事，哪怕一秒后就返回，上一页也要重读。
  it("refreshes when anything was written in between", () =>
    expect(
      shouldRefreshOnShow({ ...base, lastRefreshAt: 99_000, writesNow: 4 }),
    ).toBe(true));
});
