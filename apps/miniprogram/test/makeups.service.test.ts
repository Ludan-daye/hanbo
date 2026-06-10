import { afterEach, describe, expect, test } from "vitest";

import Taro, { __setRequestHandler } from "@tarojs/taro";

import { approveMakeup, fetchPendingMakeups, rejectMakeup } from "../src/services/makeups";

afterEach(() => {
  Taro.removeStorageSync("accessToken");
  Taro.removeStorageSync("refreshToken");
});

const setToken = (): void => { Taro.setStorageSync("accessToken", "tok"); };

const record = () => {
  const calls: Array<{ url: string; method?: string; data?: unknown }> = [];
  __setRequestHandler(async (o) => {
    calls.push({ url: o.url, method: o.method, data: o.data });
    return { statusCode: 200, data: [] };
  });
  return calls;
};

describe("makeups service", () => {
  test("fetchPendingMakeups -> GET /makeups/teams/:teamId/pending", async () => {
    setToken();
    const calls = record();
    await fetchPendingMakeups("t-1");
    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.url.endsWith("/makeups/teams/t-1/pending")).toBe(true);
  });

  test("approveMakeup -> POST /makeups/requests/:requestId/approve with { approvalReason }", async () => {
    setToken();
    const calls = record();
    await approveMakeup("req-1", { approvalReason: "ok" });
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url.endsWith("/makeups/requests/req-1/approve")).toBe(true);
    expect(calls[0]?.data).toEqual({ approvalReason: "ok" });
  });

  test("rejectMakeup -> POST /makeups/requests/:requestId/reject with { approvalReason }", async () => {
    setToken();
    const calls = record();
    await rejectMakeup("req-1", { approvalReason: "no good" });
    expect(calls[0]?.url.endsWith("/makeups/requests/req-1/reject")).toBe(true);
    expect(calls[0]?.data).toEqual({ approvalReason: "no good" });
  });
});
