import { afterEach, describe, expect, test } from "vitest";

import Taro, { __setRequestHandler } from "@tarojs/taro";

import {
  fetchDailyReport,
  fetchMonthlyReport,
  fetchParticipants,
  fetchTeamDailyReport,
  fetchTeamMonthlyReport,
  fetchTeamParticipants,
  fetchTeamWeeklyReport,
  fetchWeeklyReport
} from "../src/services/management";

afterEach(() => {
  Taro.removeStorageSync("accessToken");
  Taro.removeStorageSync("refreshToken");
});

const setToken = (): void => {
  Taro.setStorageSync("accessToken", "tok");
};

const recordRequests = () => {
  const calls: Array<{ url: string; method?: string }> = [];
  __setRequestHandler(async (o) => {
    calls.push({ url: o.url, method: o.method });
    return { statusCode: 200, data: { ok: true } };
  });
  return calls;
};

describe("management service URLs and methods", () => {
  test("fetchParticipants -> GET /management/projects/:projectId/participants", async () => {
    setToken();
    const calls = recordRequests();
    await fetchParticipants("p-1");
    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.url.endsWith("/management/projects/p-1/participants")).toBe(true);
  });

  test("fetchDailyReport -> GET .../daily?date=YYYY-MM-DD", async () => {
    setToken();
    const calls = recordRequests();
    await fetchDailyReport("p-1", "2026-06-10");
    expect(calls[0]?.url.endsWith("/reports/projects/p-1/daily?date=2026-06-10")).toBe(true);
  });

  test("fetchWeeklyReport -> GET .../weekly?weekStartDate=YYYY-MM-DD", async () => {
    setToken();
    const calls = recordRequests();
    await fetchWeeklyReport("p-1", "2026-06-08");
    expect(calls[0]?.url.endsWith("/reports/projects/p-1/weekly?weekStartDate=2026-06-08")).toBe(true);
  });

  test("fetchMonthlyReport -> GET .../monthly?month=YYYY-MM", async () => {
    setToken();
    const calls = recordRequests();
    await fetchMonthlyReport("p-1", "2026-06");
    expect(calls[0]?.url.endsWith("/reports/projects/p-1/monthly?month=2026-06")).toBe(true);
  });

  test("fetchTeamParticipants -> GET /management/teams/:teamId/participants", async () => {
    setToken();
    const calls = recordRequests();
    await fetchTeamParticipants("t-1");
    expect(calls[0]?.url.endsWith("/management/teams/t-1/participants")).toBe(true);
  });

  test("fetchTeamDailyReport -> GET /reports/teams/:teamId/daily?date=", async () => {
    setToken();
    const calls = recordRequests();
    await fetchTeamDailyReport("t-1", "2026-06-10");
    expect(calls[0]?.url.endsWith("/reports/teams/t-1/daily?date=2026-06-10")).toBe(true);
  });

  test("fetchTeamWeeklyReport -> GET /reports/teams/:teamId/weekly?weekStartDate=", async () => {
    setToken();
    const calls = recordRequests();
    await fetchTeamWeeklyReport("t-1", "2026-06-08");
    expect(calls[0]?.url.endsWith("/reports/teams/t-1/weekly?weekStartDate=2026-06-08")).toBe(true);
  });

  test("fetchTeamMonthlyReport -> GET /reports/teams/:teamId/monthly?month=", async () => {
    setToken();
    const calls = recordRequests();
    await fetchTeamMonthlyReport("t-1", "2026-06");
    expect(calls[0]?.url.endsWith("/reports/teams/t-1/monthly?month=2026-06")).toBe(true);
  });
});
