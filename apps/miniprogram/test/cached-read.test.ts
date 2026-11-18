import { describe, expect, it } from "vitest";

import { startRead } from "../src/hooks/use-cached-read";

const shown = {
  key: "u1:home",
  writes: 5,
  data: "on screen",
  loading: false,
  refreshing: false,
  error: null,
} as const;

describe("startRead", () => {
  it("shows the cached value at once and marks it as being checked", () => {
    const next = startRead<string>(shown, "u1:home", "cached", 5);
    expect(next).toMatchObject({
      data: "cached",
      loading: false,
      refreshing: true,
    });
  });

  // 下拉刷新：缓存已作废，但屏幕上的数据还是对的，不闪骨架。
  it("keeps what is on screen during a manual refresh", () => {
    const next = startRead<string>(shown, "u1:home", undefined, 5);
    expect(next).toMatchObject({
      data: "on screen",
      loading: false,
      refreshing: true,
    });
  });

  // 刚办完一件事：屏幕上是办之前的数据，换成骨架，不拿旧数据充数。
  it("drops what is on screen after a write", () => {
    const next = startRead<string>(shown, "u1:home", undefined, 6);
    expect(next).toMatchObject({ data: null, loading: true });
  });

  // 换了人或换了日期：上一个键的数据不能留在屏幕上。
  it("drops what is on screen when the key changes", () => {
    const next = startRead<string>(shown, "u2:home", undefined, 5);
    expect(next).toMatchObject({ key: "u2:home", data: null, loading: true });
  });

  it("clears a previous error and stays idle without a key", () => {
    expect(
      startRead<string>({ ...shown, error: "x" }, "u1:home", undefined, 5)
        .error,
    ).toBeNull();
    expect(startRead<string>(shown, null, undefined, 5)).toMatchObject({
      data: null,
      loading: false,
      refreshing: false,
    });
  });
});
