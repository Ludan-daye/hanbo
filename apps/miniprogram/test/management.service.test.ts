import { afterEach, describe, expect, test } from "vitest";

import Taro, { __setRequestHandler } from "@tarojs/taro";

import {
  configureDefaultSchedule,
  configureDefaultShift,
  createCompanyProject,
  fetchCompanyDailyReport,
  fetchCompanyMonthlyReport,
  fetchCompanyParticipants,
  fetchCompanyProjects,
  fetchCompanyWeeklyReport,
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
  const calls: Array<{ url: string; method?: string; data?: unknown }> = [];
  __setRequestHandler(async (o) => {
    calls.push({ url: o.url, method: o.method, data: o.data });
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

  test("configureDefaultShift -> PUT /attendance/projects/:projectId/default-shift with body", async () => {
    setToken();
    const calls = recordRequests();
    const body = {
      name: "默认班次",
      segments: [
        { sequence: 1 as const, startTime: "08:00", endTime: "12:00", lateGraceMins: 0, earlyGraceMins: 0 },
        { sequence: 2 as const, startTime: "13:00", endTime: "17:00", lateGraceMins: 0, earlyGraceMins: 0 }
      ] as const
    };
    await configureDefaultShift("p-1", body);
    expect(calls[0]?.method).toBe("PUT");
    expect(calls[0]?.url.endsWith("/attendance/projects/p-1/default-shift")).toBe(true);
    expect(calls[0]?.data).toEqual(body);
  });

  test("configureDefaultSchedule -> PUT /attendance/projects/:projectId/default-schedule with body", async () => {
    setToken();
    const calls = recordRequests();
    const body = { startsOn: "2026-06-01", endsOn: null, workdays: [1, 2, 3, 4, 5] };
    await configureDefaultSchedule("p-1", body);
    expect(calls[0]?.method).toBe("PUT");
    expect(calls[0]?.url.endsWith("/attendance/projects/p-1/default-schedule")).toBe(true);
    expect(calls[0]?.data).toEqual(body);
  });

  test("createCompanyProject -> POST /management/companies/:companyId/projects with body", async () => {
    setToken();
    const calls = recordRequests();
    const body = {
      name: "新工地",
      managerProfileIds: ["manager-1"],
      address: "示例地址",
      centerLatitude: "31.0",
      centerLongitude: "121.0",
      geofenceRadiusM: 200,
      status: "PREPARING" as const,
      plannedStartDate: "2026-07-01",
      plannedEndDate: null
    };
    await createCompanyProject("c-1", body);
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url.endsWith("/management/companies/c-1/projects")).toBe(true);
    expect(calls[0]?.data).toEqual(body);
  });

  test("fetchCompanyDailyReport -> GET /reports/companies/:companyId/daily?date=", async () => {
    setToken();
    const calls = recordRequests();
    await fetchCompanyDailyReport("c-1", "2026-06-10");
    expect(calls[0]?.url.endsWith("/reports/companies/c-1/daily?date=2026-06-10")).toBe(true);
  });
  test("fetchCompanyWeeklyReport -> GET /reports/companies/:companyId/weekly?weekStartDate=", async () => {
    setToken();
    const calls = recordRequests();
    await fetchCompanyWeeklyReport("c-1", "2026-06-08");
    expect(calls[0]?.url.endsWith("/reports/companies/c-1/weekly?weekStartDate=2026-06-08")).toBe(true);
  });
  test("fetchCompanyMonthlyReport -> GET /reports/companies/:companyId/monthly?month=", async () => {
    setToken();
    const calls = recordRequests();
    await fetchCompanyMonthlyReport("c-1", "2026-06");
    expect(calls[0]?.url.endsWith("/reports/companies/c-1/monthly?month=2026-06")).toBe(true);
  });
});
