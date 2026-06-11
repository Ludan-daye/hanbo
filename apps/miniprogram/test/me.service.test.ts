import { afterEach, describe, expect, test } from "vitest";

import Taro, { __setRequestHandler } from "@tarojs/taro";

import { fetchMyAttendanceRecords, fetchMyMakeups, fetchMyProjects, submitMakeup } from "../src/services/me";

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

describe("me service", () => {
  test("fetchMyAttendanceRecords -> GET /me/attendance-records?from&to", async () => {
    setToken();
    const calls = record();
    await fetchMyAttendanceRecords("2026-06-01", "2026-06-10");
    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.url.endsWith("/me/attendance-records?from=2026-06-01&to=2026-06-10")).toBe(true);
  });

  test("fetchMyMakeups -> GET /me/makeups", async () => {
    setToken();
    const calls = record();
    await fetchMyMakeups();
    expect(calls[0]?.url.endsWith("/me/makeups")).toBe(true);
  });

  test("fetchMyProjects -> GET /me/projects", async () => {
    setToken();
    const calls = record();
    await fetchMyProjects();
    expect(calls[0]?.url.endsWith("/me/projects")).toBe(true);
  });

  test("submitMakeup -> POST /makeups/projects/:projectId/requests with body", async () => {
    setToken();
    const calls = record();
    await submitMakeup("p-1", {
      attendanceDate: "2026-06-10",
      pointCode: "SEGMENT_1_START",
      reason: "忘了",
      requestedOccurredAt: "2026-06-10T01:00:00.000Z"
    });
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url.endsWith("/makeups/projects/p-1/requests")).toBe(true);
    expect(calls[0]?.data).toEqual({
      attendanceDate: "2026-06-10",
      pointCode: "SEGMENT_1_START",
      reason: "忘了",
      requestedOccurredAt: "2026-06-10T01:00:00.000Z"
    });
  });
});
