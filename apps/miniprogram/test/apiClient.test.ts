import { afterEach, describe, expect, test, vi } from "vitest";

import Taro, { __setRequestHandler } from "@tarojs/taro";
import { createApiClient } from "../src/services/apiClient";

afterEach(() => {
  Taro.removeStorageSync("accessToken");
  Taro.removeStorageSync("refreshToken");
});

describe("apiClient", () => {
  test("injects the access token and returns data on 200", async () => {
    Taro.setStorageSync("accessToken", "tok-1");
    let seenHeader = "";
    __setRequestHandler(async (o) => {
      seenHeader = o.header?.Authorization ?? "";
      return { statusCode: 200, data: { ok: true } };
    });
    const client = createApiClient("http://api");
    const data = await client.request<{ ok: boolean }>("/x", { method: "GET" });
    expect(seenHeader).toBe("Bearer tok-1");
    expect(data).toEqual({ ok: true });
  });

  test.each([200, 201])("on 401 refreshes with status %i and retries with the new token", async (statusCode: number) => {
    Taro.setStorageSync("accessToken", "old");
    Taro.setStorageSync("refreshToken", "r1");
    const calls: string[] = [];
    __setRequestHandler(async (o) => {
      calls.push(`${o.method} ${o.url} auth=${o.header?.Authorization ?? ""}`);
      if (o.url.endsWith("/auth/refresh")) {
        return { statusCode, data: { accessToken: "new" } };
      }
      if (o.header?.Authorization === "Bearer old") {
        return { statusCode: 401, data: { message: "expired" } };
      }
      return { statusCode: 200, data: { ok: true } };
    });
    const client = createApiClient("http://api");
    const data = await client.request<{ ok: boolean }>("/protected", {
      method: "GET",
    });
    expect(data).toEqual({ ok: true });
    expect(Taro.getStorageSync("accessToken")).toBe("new");
    expect(calls.some((c) => c.includes("/auth/refresh"))).toBe(true);
  });

  test("clears the session and throws when refresh fails", async () => {
    Taro.setStorageSync("accessToken", "old");
    Taro.setStorageSync("refreshToken", "r1");
    __setRequestHandler(async (o) => {
      if (o.url.endsWith("/auth/refresh")) {
        return { statusCode: 401, data: { message: "refresh dead" } };
      }
      return { statusCode: 401, data: { message: "expired" } };
    });
    const client = createApiClient("http://api");
    await expect(
      client.request("/protected", { method: "GET" }),
    ).rejects.toBeDefined();
    expect(Taro.getStorageSync("accessToken")).toBe("");
  });

  test("shares one refresh across parallel requests and reuses it for a late 401", async () => {
    Taro.setStorageSync("accessToken", "old");
    Taro.setStorageSync("refreshToken", "r1");
    let releaseLate!: () => void;
    const late: Promise<void> = new Promise((resolve) => {
      releaseLate = resolve;
    });
    let refreshCount: number = 0;
    __setRequestHandler(async (options) => {
      if (options.url.endsWith("/auth/refresh")) {
        refreshCount += 1;
        return { statusCode: 200, data: { accessToken: "new" } };
      }
      if (options.header?.Authorization === "Bearer old") {
        if (options.url.endsWith("/late")) await late;
        return { statusCode: 401, data: {} };
      }
      expect(options.header?.Authorization).toBe("Bearer new");
      return { statusCode: 200, data: { ok: true } };
    });
    const client = createApiClient("http://api");
    const delayedRequest = client.request("/late");
    try {
      const results = await Promise.all(
        Array.from({ length: 20 }, (_, index) =>
          client.request(`/page-${index}`),
        ),
      );
      expect(results).toEqual(Array.from({ length: 20 }, () => ({ ok: true })));
      expect(refreshCount).toBe(1);
    } finally {
      releaseLate();
    }
    await expect(delayedRequest).resolves.toEqual({ ok: true });
    expect(refreshCount).toBe(1);
  });

  test.each([429, 503])(
    "keeps the session on refresh status %i and allows a later retry",
    async (statusCode: number) => {
      Taro.setStorageSync("accessToken", "old");
      Taro.setStorageSync("refreshToken", "r1");
      let refreshCount: number = 0;
      __setRequestHandler(async (options) => {
        if (options.url.endsWith("/auth/refresh")) {
          refreshCount += 1;
          return refreshCount === 1
            ? { statusCode, data: { message: "temporary outage" } }
            : { statusCode: 200, data: { accessToken: "new" } };
        }
        return options.header?.Authorization === "Bearer old"
          ? { statusCode: 401, data: {} }
          : { statusCode: 200, data: { ok: true } };
      });
      const client = createApiClient("http://api");
      await expect(client.request("/protected")).rejects.toMatchObject({
        statusCode,
      });
      expect(Taro.getStorageSync("accessToken")).toBe("old");
      expect(Taro.getStorageSync("refreshToken")).toBe("r1");
      await expect(client.request("/protected")).resolves.toEqual({ ok: true });
      expect(refreshCount).toBe(2);
    },
  );

  test("rejects malformed refresh responses without discarding login credentials", async () => {
    Taro.setStorageSync("accessToken", "old");
    Taro.setStorageSync("refreshToken", "r1");
    __setRequestHandler(async (options) =>
      options.url.endsWith("/auth/refresh")
        ? { statusCode: 200, data: { accessToken: "" } }
        : { statusCode: 401, data: {} },
    );
    await expect(
      createApiClient("http://api").request("/protected"),
    ).rejects.toMatchObject({ statusCode: 502 });
    expect(Taro.getStorageSync("accessToken")).toBe("old");
    expect(Taro.getStorageSync("refreshToken")).toBe("r1");
  });

  test.each([200, 401])(
    "does not overwrite or clear a new login when the previous refresh returns %i",
    async (statusCode: number) => {
      Taro.setStorageSync("accessToken", "old");
      Taro.setStorageSync("refreshToken", "r1");
      let release!: () => void;
      const responseReady: Promise<void> = new Promise((resolve) => {
        release = resolve;
      });
      let refreshing: boolean = false;
      __setRequestHandler(async (options) => {
        if (options.url.endsWith("/auth/refresh")) {
          refreshing = true;
          await responseReady;
          return { statusCode, data: { accessToken: "previous-user-token" } };
        }
        return { statusCode: 401, data: {} };
      });
      const outcome = createApiClient("http://api")
        .request("/protected")
        .catch((error: unknown) => error);
      try {
        await vi.waitFor(() => expect(refreshing).toBe(true));
        Taro.setStorageSync("accessToken", "other-user-token");
        Taro.setStorageSync("refreshToken", "other-user-refresh");
      } finally {
        release();
      }
      expect(await outcome).toMatchObject({
        statusCode: 401,
        responseBody: { message: "REQUEST_SESSION_CHANGED" },
      });
      expect(Taro.getStorageSync("accessToken")).toBe("other-user-token");
      expect(Taro.getStorageSync("refreshToken")).toBe("other-user-refresh");
    },
  );
});
