import { afterEach, describe, expect, test } from "vitest";

import Taro, { __setRequestHandler } from "@tarojs/taro";

import {
  fetchCompanyParticipants,
  fetchCompanyProjects,
  fetchDailyReport,
  fetchMonthlyReport,
  fetchParticipants,
  fetchProjectInvitations,
  fetchProjectTeams,
  fetchTeamDailyReport,
  fetchTeamMonthlyReport,
  fetchTeamParticipants,
  fetchTeamWeeklyReport,
  fetchWeeklyReport,
  revokeProjectInvitation
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

  test("fetchCompanyProjects -> GET /management/companies/:companyId/projects", async () => {
    setToken();
    const calls = recordRequests();
    await fetchCompanyProjects("c-1");
    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.url.endsWith("/management/companies/c-1/projects")).toBe(true);
  });

  test("fetchCompanyParticipants -> GET /management/companies/:companyId/participants", async () => {
    setToken();
    const calls = recordRequests();
    await fetchCompanyParticipants("c-1");
    expect(calls[0]?.url.endsWith("/management/companies/c-1/participants")).toBe(true);
  });

  test("fetchProjectTeams -> GET /management/projects/:projectId/teams", async () => {
    setToken();
    const calls = recordRequests();
    await fetchProjectTeams("p-1");
    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.url.endsWith("/management/projects/p-1/teams")).toBe(true);
  });

  test("fetchProjectInvitations -> GET /management/projects/:projectId/invitations", async () => {
    setToken();
    const calls = recordRequests();
    await fetchProjectInvitations("p-1");
    expect(calls[0]?.url.endsWith("/management/projects/p-1/invitations")).toBe(true);
  });

  test("revokeProjectInvitation -> POST /management/projects/:projectId/invitations/:invitationId/revoke", async () => {
    setToken();
    const calls = recordRequests();
    await revokeProjectInvitation("p-1", "inv-1");
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url.endsWith("/management/projects/p-1/invitations/inv-1/revoke")).toBe(true);
  });
});
