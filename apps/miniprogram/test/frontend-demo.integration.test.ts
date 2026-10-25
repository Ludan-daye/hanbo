import { beforeEach, describe, expect, test } from "vitest";
import Taro from "@tarojs/taro";

import {
  createDemoClient,
  demoEnrollFace,
  readDemoState,
  resetDemoState,
} from "../src/services/demo/client";
import type { LoginResponse, MeResponse } from "../src/services/auth.types";
import type { AccountProfile } from "../src/services/account";
import type {
  CompanyProject,
  DailyReport,
  DefaultAttendanceConfiguration,
  ProjectParticipant,
  ProjectTeam,
} from "../src/services/management.types";
import type {
  AttendanceToday,
  Makeup,
  SubmitAttendanceRecordResult,
} from "../src/services/me.types";
import type { FaceProfile } from "../src/services/face";
import type {
  Account,
  Company,
  SystemSettings,
} from "../src/services/workflows";
import { chinaDaysAgo, chinaToday } from "../src/services/time";
import { sessionEntryUrl } from "../src/routing/session";
import { initialSessionState, sessionPhase, sessionReducer, type SessionState } from "../src/store/sessionReducer";

const client = createDemoClient();
const login = async (code: string): Promise<MeResponse> => {
  const tokens = await client.request<LoginResponse>("/auth/wechat/login", {
    method: "POST",
    data: { code },
    auth: false,
  });
  Taro.setStorageSync("demoAccessToken", tokens.accessToken);
  return client.request("/auth/me", { method: "GET" });
};
const restoreSession = async (): Promise<SessionState> => {
  const me: MeResponse = await client.request("/auth/me", { method: "GET" });
  const accountProfile: AccountProfile = await client.request("/account/profile", { method: "GET" });
  const tokens: SessionState = sessionReducer(initialSessionState, {
    type: "SET_TOKENS",
    accessToken: String(Taro.getStorageSync("demoAccessToken")),
    refreshToken: "demo-refresh",
  });
  return sessionReducer(tokens, { type: "SET_ME", me, accountProfile });
};
beforeEach(() => {
  resetDemoState();
  Taro.removeStorageSync("demoAccessToken");
});

describe("standalone frontend workflows using persistent demo storage", () => {
  test("login requires both profile fields before binding, persists completion, and checks returning bound accounts", async () => {
    await login("dev-unbound");
    expect(sessionEntryUrl(sessionPhase(await restoreSession()))).toBe("/pages/complete-profile/index");
    await client.request("/account/profile", { method: "PUT", data: { nickname: "张师傅" } });
    expect(sessionPhase(await restoreSession())).toBe("profile-required");
    await client.request("/account/avatar", {
      method: "POST",
      data: { avatarDataUrl: "data:image/png;base64,iVBORw0KGgo=" },
    });
    expect(sessionEntryUrl(sessionPhase(await restoreSession()))).toBe("/pages/bind/index");
    await client.request("/auth/bind", { method: "POST", data: { invitationCode: "HANBO-DEMO" } });
    expect(sessionEntryUrl(sessionPhase(await restoreSession()))).toBe("/pages/home/index");
    await login("dev-unbound");
    expect(sessionPhase(await restoreSession())).toBe("ready");
    await login("dev-worker");
    expect(sessionEntryUrl(sessionPhase(await restoreSession()))).toBe("/pages/complete-profile/index");
    await client.request("/account/avatar", {
      method: "POST",
      data: { avatarDataUrl: "data:image/png;base64,iVBORw0KGgo=" },
    });
    expect(sessionPhase(await restoreSession())).toBe("profile-required");
    await client.request("/account/profile", { method: "PUT", data: { nickname: "李师傅" } });
    expect(sessionPhase(await restoreSession())).toBe("ready");
  });
  test("avatar and nickname persist for one account across logins and stay separate from other identities", async () => {
    await login("dev-worker");
    const avatarDataUrl = "data:image/png;base64,iVBORw0KGgo=";
    await client.request<AccountProfile>("/account/profile", {
      method: "PUT",
      data: { nickname: "张师傅" },
    });
    await client.request<AccountProfile>("/account/avatar", {
      method: "POST",
      data: { avatarDataUrl },
    });
    await expect(
      client.request("/account/profile", {
        method: "PUT",
        data: { nickname: " " },
      }),
    ).rejects.toThrow("昵称");
    await login("dev-team");
    expect(
      (
        await client.request<AccountProfile>("/account/profile", {
          method: "GET",
        })
      ).nickname,
    ).toBeNull();
    await login("dev-worker");
    const profile = await createDemoClient().request<AccountProfile>(
      "/account/profile",
      { method: "GET" },
    );
    expect(profile.nickname).toBe("张师傅");
    expect(profile.avatarDataUrl).toBe(avatarDataUrl);
    expect(profile.phoneMasked).toMatch(/^\d{3}\*{4}\d{4}$/);
  });
  test("all five roles and unbound invitation entry are available without HTTP", async () => {
    for (const [code, role] of [
      ["dev-system", "SYSTEM_ADMIN"],
      ["dev-company", "COMPANY_ADMIN"],
      ["dev-project", "PROJECT_ADMIN"],
      ["dev-team", "TEAM_LEADER"],
      ["dev-worker", "WORKER"],
    ]) {
      expect((await login(code)).roles.highestRoleCode).toBe(role);
    }
    expect((await login("dev-unbound")).user.isBound).toBe(false);
    await expect(
      client.request("/auth/bind", {
        method: "POST",
        data: { invitationCode: "INVALID-CODE" },
      }),
    ).rejects.toThrow("邀请码无效");
    expect(
      (await client.request<MeResponse>("/auth/me", { method: "GET" })).user
        .isBound,
    ).toBe(false);
    await client.request("/auth/bind", {
      method: "POST",
      data: { invitationCode: "HANBO-DEMO" },
    });
    expect(
      (await client.request<MeResponse>("/auth/me", { method: "GET" })).user
        .isBound,
    ).toBe(true);
    await client.request("/auth/logout", { method: "POST" });
    Taro.removeStorageSync("demoAccessToken");
    const returningUser = await login("dev-unbound");
    expect(returningUser.user.isBound).toBe(true);
    expect(returningUser.roles.highestRoleCode).toBe("WORKER");
    await expect(
      client.request("/auth/bind", {
        method: "POST",
        data: { invitationCode: "HANBO-DEMO" },
      }),
    ).rejects.toThrow("邀请码无效");
  });
  test("person creation, team assignment and exit persist across clients and role switches", async () => {
    await login("dev-project");
    const team = await client.request<ProjectTeam>(
      "/management/projects/demo-project/teams",
      { method: "POST", data: { name: "测试二班", status: "ACTIVE" } },
    );
    const body = {
      displayName: "测试成员",
      phone: "13800000009",
      participantType: "WORKER",
      projectRoleLabel: "木工",
      teamId: team.id,
      requiresAttendance: true,
      status: "ACTIVE",
    };
    const person = await client.request<ProjectParticipant>(
      "/management/projects/demo-project/participants",
      { method: "POST", data: body },
    );
    expect(person.teamName).toBe("测试二班");
    await client.request(
      `/management/projects/demo-project/participants/${person.memberId}`,
      { method: "PUT", data: { ...body, status: "EXITED" } },
    );
    await login("dev-company");
    const people = await createDemoClient().request<
      readonly ProjectParticipant[]
    >("/management/companies/demo-company/participants", { method: "GET" });
    expect(people.find((row) => row.memberId === person.memberId)?.status).toBe(
      "EXITED",
    );
  });
  test("worker makeup -> team approval -> worker result -> report", async () => {
    await login("dev-worker");
    const request = await client.request<Makeup>(
      "/makeups/projects/demo-project/requests",
      {
        method: "POST",
        data: {
          attendanceDate: chinaDaysAgo(1),
          pointCode: "SEGMENT_1_START",
          reason: "测试补卡",
          requestedOccurredAt: `${chinaDaysAgo(1)}T08:00:00+08:00`,
        },
      },
    );
    await expect(
      client.request(`/makeups/requests/${request.id}/approve`, {
        method: "POST",
        data: { approvalReason: "本人" },
      }),
    ).rejects.toThrow();
    await login("dev-team");
    await client.request(`/makeups/requests/${request.id}/approve`, {
      method: "POST",
      data: { approvalReason: "已核实现场签到" },
    });
    await expect(
      client.request(`/makeups/requests/${request.id}/reject`, {
        method: "POST",
        data: { approvalReason: "重复处理" },
      }),
    ).rejects.toThrow("已被处理");
    await login("dev-worker");
    const rows = await client.request<readonly Makeup[]>("/me/makeups", {
      method: "GET",
    });
    expect(rows.find((row) => row.id === request.id)?.status).toBe("APPROVED");
    await login("dev-project");
    const report = await client.request<DailyReport>(
      `/reports/projects/demo-project/daily?date=${chinaDaysAgo(1)}`,
      { method: "GET" },
    );
    expect(report.totals.approvedMakeupCount).toBe(1);
    expect(
      report.participants.find(
        (row) => row.participantId === request.participantId,
      )?.isMissingPunch,
    ).toBe(false);
  });
  test("project creation and separate shift/schedule saving keep scope isolated", async () => {
    await login("dev-company");
    const project = await client.request<CompanyProject>(
      "/management/companies/demo-company/projects",
      {
        method: "POST",
        data: {
          name: "新项目",
          address: "测试地址",
          centerLatitude: "31",
          centerLongitude: "121",
          geofenceRadiusM: 200,
          status: "PREPARING",
          plannedStartDate: chinaToday(),
          plannedEndDate: null,
        },
      },
    );
    await client.request(`/attendance/projects/${project.id}/default-shift`, {
      method: "PUT",
      data: {
        name: "新班次",
        segments: [
          {
            sequence: 1,
            startTime: "08:30",
            endTime: "12:00",
            lateGraceMins: 5,
            earlyGraceMins: 5,
          },
          {
            sequence: 2,
            startTime: "13:00",
            endTime: "17:00",
            lateGraceMins: 5,
            earlyGraceMins: 5,
          },
        ],
      },
    });
    await client.request(
      `/attendance/projects/${project.id}/default-schedule`,
      {
        method: "PUT",
        data: {
          startsOn: chinaToday(),
          endsOn: null,
          workdays: [1, 2, 3, 4, 5],
        },
      },
    );
    const configuration = await client.request<DefaultAttendanceConfiguration>(
      `/attendance/projects/${project.id}/default-configuration`,
      { method: "GET" },
    );
    expect(configuration.shift?.name).toBe("新班次");
    expect(configuration.schedule?.workdays).toHaveLength(5);
    await login("dev-project");
    await expect(
      client.request(`/management/projects/${project.id}/participants`, {
        method: "GET",
      }),
    ).rejects.toThrow("没有访问");
  });
  test("photo submission, admin review, and photo persistence remain local", async () => {
    await login("dev-worker");
    const face = demoEnrollFace(
      "data:image/png;base64,dGVzdA==",
      "demo-face-v1",
    );
    await login("dev-project");
    const reviewed = await client.request<FaceProfile>(
      `/face-profiles/projects/demo-project/${face.id}/review`,
      { method: "POST", data: { decision: "APPROVED", reason: "测试审核" } },
    );
    expect(reviewed.status).toBe("APPROVED");
    expect(readDemoState().faces[0].photo).toContain("data:image/png");
  });
  test("punch records are local demonstration evidence and never claim verified biometrics", async () => {
    await login("dev-worker");
    const result = await client.request<SubmitAttendanceRecordResult>(
      "/attendance/projects/demo-project/records",
      {
        method: "POST",
        data: {
          attendanceDate: chinaToday(),
          pointCode: "SEGMENT_1_END",
          occurredAt: new Date().toISOString(),
          latitude: "31.2304",
          longitude: "121.4737",
          locationAccuracyM: null,
          selfieObjectKey: "demo/selfie",
          selfieHash: "demo",
          sitePhotoObjectKey: "demo/site",
          sitePhotoHash: "demo",
        },
      },
    );
    expect(result.record.facePassed).toBe(false);
    expect(result.record.faceScore).toBeNull();
    expect(
      readDemoState().records.some((row) => row.id === result.record.id),
    ).toBe(true);
  });
  test("member and team schedules take precedence and can be explicitly removed", async () => {
    await login("dev-project");
    const shift = readDemoState().configurations["demo-project"].shift;
    const schedule = {
      startsOn: chinaToday(),
      endsOn: null,
      workdays: [1, 2, 3, 4, 5, 6, 7],
    };
    await client.request(
      "/attendance/projects/demo-project/teams/demo-team/shift",
      { method: "PUT", data: { ...shift, name: "班组班次" } },
    );
    await client.request(
      "/attendance/projects/demo-project/teams/demo-team/schedule",
      { method: "PUT", data: schedule },
    );
    await client.request(
      "/attendance/projects/demo-project/members/member-worker/shift",
      { method: "PUT", data: { ...shift, name: "个人班次" } },
    );
    await client.request(
      "/attendance/projects/demo-project/members/member-worker/schedule",
      { method: "PUT", data: schedule },
    );
    await login("dev-worker");
    expect(
      (
        await client.request<AttendanceToday>(
          "/me/projects/demo-project/attendance-today",
          { method: "GET" },
        )
      ).shiftName,
    ).toBe("个人班次");
    await login("dev-project");
    await client.request(
      "/attendance/projects/demo-project/members/member-worker/configuration",
      { method: "DELETE" },
    );
    await login("dev-worker");
    expect(
      (
        await client.request<AttendanceToday>(
          "/me/projects/demo-project/attendance-today",
          { method: "GET" },
        )
      ).shiftName,
    ).toBe("班组班次");
  });
  test("system company, account, announcement and audit changes persist", async () => {
    await login("dev-system");
    const company = await client.request<Company>("/system/companies", {
      method: "POST",
      data: { id: "", name: "第二公司", status: "ACTIVE" },
    });
    const account = readDemoState().accounts.find(
      (row) => row.id === "dev-company",
    ) as Account;
    await client.request("/system/accounts/dev-company", {
      method: "PUT",
      data: { ...account, scopeId: company.id },
    });
    await client.request("/system/settings", {
      method: "PUT",
      data: { supportPhone: "13800000000", announcement: "测试公告" },
    });
    await login("dev-company");
    expect(
      (await client.request<MeResponse>("/auth/me", { method: "GET" })).roles
        .assignments[0].scope.scopeId,
    ).toBe(company.id);
    expect(
      (await client.request<SystemSettings>("/app/settings", { method: "GET" }))
        .announcement,
    ).toBe("测试公告");
    await expect(
      client.request("/system/accounts", { method: "GET" }),
    ).rejects.toThrow();
    expect(readDemoState().audit.length).toBeGreaterThanOrEqual(3);
  });
});
