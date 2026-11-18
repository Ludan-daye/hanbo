import { describe, expect, it, vi } from "vitest";

import { createActionGuard } from "../src/hooks/use-action";

describe("createActionGuard", () => {
  it("runs once when triggered twice before the first finishes", async () => {
    const guard = createActionGuard();
    let release: () => void = () => {};
    const action = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const first = guard.run(action);
    const second = guard.run(action);
    expect(guard.busy()).toBe(true);
    release();
    await Promise.all([first, second]);
    expect(action).toHaveBeenCalledTimes(1);
    expect(guard.busy()).toBe(false);
  });

  it("frees the guard when the action throws", async () => {
    const guard = createActionGuard();
    await expect(
      guard.run(async () => {
        throw new Error("x");
      }),
    ).rejects.toThrow("x");
    expect(guard.busy()).toBe(false);
    await expect(guard.run(async () => "again")).resolves.toBe("again");
  });
});
