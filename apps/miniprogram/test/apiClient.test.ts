import { afterEach, describe, expect, test } from "vitest";

import Taro, { __setRequestHandler } from "@tarojs/taro";
import { createApiClient } from "../src/services/apiClient.js";

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

  test("on 401 refreshes once and retries with the new token", async () => {
    Taro.setStorageSync("accessToken", "old");
    Taro.setStorageSync("refreshToken", "r1");
    const calls: string[] = [];
    __setRequestHandler(async (o) => {
      calls.push(`${o.method} ${o.url} auth=${o.header?.Authorization ?? ""}`);
      if (o.url.endsWith("/auth/refresh")) {
        return { statusCode: 200, data: { accessToken: "new" } };
      }
      if (o.header?.Authorization === "Bearer old") {
        return { statusCode: 401, data: { message: "expired" } };
      }
      return { statusCode: 200, data: { ok: true } };
    });
    const client = createApiClient("http://api");
    const data = await client.request<{ ok: boolean }>("/protected", { method: "GET" });
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
    await expect(client.request("/protected", { method: "GET" })).rejects.toBeDefined();
    expect(Taro.getStorageSync("accessToken")).toBe("");
  });
});
