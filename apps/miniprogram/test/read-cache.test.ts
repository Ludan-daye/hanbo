import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  cachedRead,
  clearReadCache,
  invalidateReads,
  noteWrite,
  peekRead,
  readAge,
  writeVersion,
} from "../src/services/read-cache";

beforeEach(() => clearReadCache());

describe("read cache", () => {
  it("stores the last successful result and its age", async () => {
    await cachedRead("u1:a", async () => 1);
    expect(peekRead<number>("u1:a")).toBe(1);
    expect(readAge("u1:a", Date.now() + 500)).toBeGreaterThanOrEqual(500);
    expect(readAge("u1:missing")).toBeNull();
  });

  it("merges concurrent reads of the same key", async () => {
    const fetcher = vi.fn(async () => 7);
    await Promise.all([
      cachedRead("u1:b", fetcher),
      cachedRead("u1:b", fetcher),
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("skips the request while the cached value is fresh enough", async () => {
    const fetcher = vi.fn(async () => "v");
    await cachedRead("u1:f", fetcher);
    await expect(
      cachedRead("u1:f", fetcher, { maxAgeMs: 30_000 }),
    ).resolves.toBe("v");
    expect(fetcher).toHaveBeenCalledTimes(1);
    await cachedRead("u1:f", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not show a value that is too old", async () => {
    await cachedRead("u1:old", async () => 1);
    expect(peekRead("u1:old", 0)).toBeUndefined();
  });

  it("keeps the previous value when a refresh fails", async () => {
    await cachedRead("u1:c", async () => "old");
    await expect(
      cachedRead("u1:c", async () => {
        throw new Error("x");
      }),
    ).rejects.toThrow("x");
    expect(peekRead("u1:c")).toBe("old");
  });

  it("drops by prefix and entirely", async () => {
    await cachedRead("u1:a", async () => 1);
    await cachedRead("u2:a", async () => 2);
    invalidateReads("u1:");
    expect(peekRead("u1:a")).toBeUndefined();
    expect(peekRead("u2:a")).toBe(2);
    clearReadCache();
    expect(peekRead("u2:a")).toBeUndefined();
  });

  // 换账号：上一个人还在路上的请求回来后，不能把数据写回缓存。
  it("does not let a read that was in flight repopulate a cleared cache", async () => {
    let release: (value: string) => void = () => {};
    const slow = cachedRead(
      "u1:slow",
      () => new Promise<string>((resolve) => (release = resolve)),
    );
    clearReadCache();
    release("previous user");
    await slow;
    expect(peekRead("u1:slow")).toBeUndefined();
  });

  // 办完一件事：缓存作废，并且新的读取不会接到办事之前发出的旧请求上。
  it("drops cached values on a write and starts new reads afresh", async () => {
    await cachedRead("u1:w", async () => "before");
    let release: (value: string) => void = () => {};
    const stale = cachedRead(
      "u1:w",
      () => new Promise<string>((resolve) => (release = resolve)),
    );
    const before = writeVersion();
    noteWrite();
    expect(writeVersion()).toBe(before + 1);
    expect(peekRead("u1:w")).toBeUndefined();
    const fresh = cachedRead("u1:w", async () => "after");
    release("before");
    await Promise.all([stale, fresh]);
    expect(await fresh).toBe("after");
    expect(peekRead("u1:w")).toBe("after");
  });
});
