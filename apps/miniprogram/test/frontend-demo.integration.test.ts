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
  ManagedParticipant,
  ParticipantPage,
  DailyReport,
  DefaultAttendanceConfiguration,
  ProjectParticipant,
  ProjectTeam,
  ManagedTeam,
  ReuseProject,
  ReusePersonForm,
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
import {
  initialSessionState,
  sessionPhase,
  sessionReducer,
  type SessionState,
} from "../src/store/sessionReducer";
import type { LegacyDemoState } from "../src/services/demo/state";

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
  const accountProfile: AccountProfile = await client.request(
    "/account/profile",
    { method: "GET" },
  );
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
  test("saves team details and responsible person, then clears the designation on member exit", async () => {
    await login("dev-project");
    const team = await client.request<ManagedTeam>(
      "/management/projects/demo-project/teams/demo-team",
      { method: "GET" },
    );
    const body = {
      name: "测试钢筋班",
      workType: "钢筋工",
      remark: "测试备注",
      status: "ACTIVE",
      leader: { memberId: "member-worker", participantType: "WORKER" },
      expectedUpdatedAt: team.updatedAt,
    };
    const saved = await client.request<ManagedTeam>(
      "/management/projects/demo-project/teams/demo-team",
      { method: "PUT", data: body },
    );
    expect(saved.leader?.displayName).toBe("张建国（演示）");
    expect(saved.memberCount).toBeGreaterThan(0);
    await expect(
      client.request("/management/projects/demo-project/teams/demo-team", {
        method: "PUT",
        data: body,
      }),
    ).rejects.toThrow("已更新");
    const person = await client.request<ManagedParticipant>(
      "/management/projects/demo-project/participants/member-worker",
      { method: "GET" },
    );
    await client.request(
      "/management/projects/demo-project/participants/member-worker",
      {
        method: "PUT",
        data: {
          displayName: person.displayName,
          workType: person.workType,
          phone: person.phone,
          participantType: person.participantType,
          projectRoleLabel: person.projectRoleLabel,
          teamId: person.teamId,
          requiresAttendance: person.requiresAttendance,
          status: "EXITED",
          enteredAt: person.enteredAt,
          exitedAt: new Date().toISOString(),
          expectedUpdatedAt: person.updatedAt,
          expectedProfileUpdatedAt: person.profileUpdatedAt,
        },
      },
    );
    const cleared = await client.request<ManagedTeam>(
      "/management/projects/demo-project/teams/demo-team",
      { method: "GET" },
    );
    const candidates = await client.request<ParticipantPage>(
      "/management/projects/demo-project/participant-page?page=1&pageSize=1&search=&teamId=demo-team&status=ACTIVE",
      { method: "GET" },
    );
    expect(candidates.items).toHaveLength(1);
    expect(
      candidates.items.every((candidate) => candidate.status === "ACTIVE"),
    ).toBe(true);
    expect(candidates.items[0]?.memberId).not.toBe(person.memberId);
    expect(candidates.total).toBe(cleared.memberCount);
    expect(cleared.leader).toBeNull();
    expect(cleared.name).toBe("测试钢筋班");
    const leaders = await client.request<ParticipantPage>(
      "/management/projects/demo-project/participant-page?page=1&pageSize=1&search=&permissionRole=TEAM_LEADER",
      { method: "GET" },
    );
    expect(leaders.total).toBe(1);
    expect(leaders.items).toHaveLength(1);
    expect(leaders.items[0]?.projectRoleLabel).toBe("TEAM_LEADER");
    const managers = await client.request<ParticipantPage>(
      "/management/projects/demo-project/participant-page?page=1&pageSize=1&search=&permissionRole=PROJECT_ADMIN",
      { method: "GET" },
    );
    expect(managers.total).toBe(1);
    expect(managers.items[0]?.projectRoleLabel).toBe("PROJECT_ADMIN");
    await expect(
      client.request(
        "/management/projects/demo-project/participant-page?page=1&pageSize=1&search=&permissionRole=SYSTEM_ADMIN",
        { method: "GET" },
      ),
    ).rejects.toThrow("项目人员权限筛选无效");
  });
  test("reuses an existing profile into a second project and rejects duplicates and unauthorized sources", async () => {
    await login("dev-project");
    expect(
      await client.request<readonly ReuseProject[]>(
        "/management/projects/demo-project/reuse-projects",
        { method: "GET" },
      ),
    ).toEqual([]);
    await login("dev-company");
    const sources = await client.request<readonly ReuseProject[]>(
      "/management/projects/demo-project-2/reuse-projects",
      { method: "GET" },
    );
    expect(sources.map((source) => source.id)).toContain("demo-project");
    const source = await client.request<ManagedParticipant>(
      "/management/projects/demo-project/participants/member-worker",
      { method: "GET" },
    );
    const body: ReusePersonForm = {
      sourceProjectId: source.projectId,
      sourceMemberId: source.memberId,
      participantType: source.participantType,
      expectedSourceUpdatedAt: source.updatedAt,
      expectedProfileUpdatedAt: source.profileUpdatedAt,
      projectRoleLabel: "钢筋安装",
      teamId: null,
      requiresAttendance: true,
      enteredAt: new Date().toISOString(),
    };
    const reused = await client.request<ManagedParticipant>(
      "/management/projects/demo-project-2/reused-participants",
      { method: "POST", data: body },
    );
    expect(reused.profileId).toBe(source.profileId);
    expect(reused.memberId).not.toBe(source.memberId);
    expect(
      await client.request(
        "/management/projects/demo-project/participants/member-worker",
        { method: "GET" },
      ),
    ).toEqual(source);
    await expect(
      client.request(
        "/management/projects/demo-project-2/reused-participants",
        { method: "POST", data: body },
      ),
    ).rejects.toThrow("已在本项目");
    await login("dev-worker");
    expect(
      (
        await client.request<readonly { projectId: string }[]>("/me/projects", {
          method: "GET",
        })
      ).map((project) => project.projectId),
    ).toContain("demo-project-2");
  });
  test("upgrades legacy saved data without losing account profiles or attendance records", async () => {
    await login("dev-worker");
    await client.request("/account/profile", {
      method: "PUT",
      data: { nickname: "保留昵称", realName: "张建国", phone: "13800000001" },
    });
    await client.request("/account/avatar", {
      method: "POST",
      data: { avatarDataUrl: "data:image/png;base64,iVBORw0KGgo=" },
    });
    const saved = readDemoState();
    const legacy: LegacyDemoState = {
      ...saved,
      version: 1,
      people: saved.people.map(
        ({
          workType,
          enteredAt,
          exitedAt,
          updatedAt,
          profileUpdatedAt,
          nameStatus,
          ...person
        }) => person,
      ),
      projects: saved.projects.map(
        ({ code, contactName, contactPhone, remark, updatedAt, ...project }) =>
          project,
      ),
    };
    Taro.setStorageSync("hanbo.frontend-demo.v1", legacy);
    const upgraded = readDemoState();
    expect(upgraded.version).toBe(2);
    expect(upgraded.accountProfiles).toEqual(saved.accountProfiles);
    expect(upgraded.records).toEqual(saved.records);
    expect(upgraded.makeups).toEqual(saved.makeups);
    expect(upgraded.people.map((person) => person.memberId)).toEqual(
      saved.people.map((person) => person.memberId),
    );
    expect(
      upgraded.people.every(
        (person) =>
          typeof person.workType === "string" &&
          Number.isFinite(Date.parse(person.enteredAt)),
      ),
    ).toBe(true);
    expect(readDemoState()).toEqual(upgraded);
    expect(sessionPhase(await restoreSession())).toBe("ready");
  });
  test("login requires both profile fields before binding, persists completion, and checks returning bound accounts", async () => {
    await login("dev-unbound");
    expect(sessionEntryUrl(sessionPhase(await restoreSession()))).toBe(
      "/pages/complete-profile/index",
    );
    await expect(
      client.request("/auth/bind", {
        method: "POST",
        data: { invitationCode: "HANBO-DEMO" },
      }),
    ).rejects.toThrow("完善");
    await expect(
      client.request("/account/profile", {
        method: "PUT",
        data: { nickname: "测试" },
      }),
    ).rejects.toThrow("真实姓名");
    await expect(
      client.request("/account/profile", {
        method: "PUT",
        data: { nickname: "测试", realName: "待入场成员", phone: "123" },
      }),
    ).rejects.toThrow("手机号");
    await client.request("/account/profile", {
      method: "PUT",
      data: {
        nickname: "张师傅",
        realName: "待入场成员",
        phone: "13800000006",
      },
    });
    expect(sessionPhase(await restoreSession())).toBe("profile-required");
    await client.request("/account/avatar", {
      method: "POST",
      data: { avatarDataUrl: "data:image/png;base64,iVBORw0KGgo=" },
    });
    expect(sessionEntryUrl(sessionPhase(await restoreSession()))).toBe(
      "/pages/bind/index",
    );
    await client.request("/account/profile", {
      method: "PUT",
      data: { nickname: "测试", realName: "其他人", phone: "13800000006" },
    });
    await expect(
      client.request("/auth/bind", {
        method: "POST",
        data: { invitationCode: "HANBO-DEMO" },
      }),
    ).rejects.toThrow("不一致");
    expect(
      readDemoState().invitations.find((row) => row.code === "HANBO-DEMO")
        ?.status,
    ).toBe("PENDING");
    await client.request("/account/profile", {
      method: "PUT",
      data: { nickname: "测试", realName: "待入场成员", phone: "13800000006" },
    });
    await client.request("/auth/bind", {
      method: "POST",
      data: { invitationCode: "HANBO-DEMO" },
    });
    expect(sessionEntryUrl(sessionPhase(await restoreSession()))).toBe(
      "/pages/home/index",
    );
    await login("dev-unbound");
    expect(sessionPhase(await restoreSession())).toBe("ready");
    await login("dev-worker");
    expect(sessionEntryUrl(sessionPhase(await restoreSession()))).toBe(
      "/pages/complete-profile/index",
    );
    await client.request("/account/avatar", {
      method: "POST",
      data: { avatarDataUrl: "data:image/png;base64,iVBORw0KGgo=" },
    });
    expect(sessionPhase(await restoreSession())).toBe("profile-required");
    await client.request("/account/profile", {
      method: "PUT",
      data: { nickname: "李师傅", realName: "张建国", phone: "13800000001" },
    });
    expect(sessionPhase(await restoreSession())).toBe("ready");
  });
  test("avatar and nickname persist for one account across logins and stay separate from other identities", async () => {
    await login("dev-worker");
    const avatarDataUrl = "data:image/png;base64,iVBORw0KGgo=";
    await client.request<AccountProfile>("/account/profile", {
      method: "PUT",
      data: { nickname: "张师傅", realName: "张建国", phone: "13800000001" },
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
    await client.request("/account/profile", {
      method: "PUT",
      data: { nickname: "测试", realName: "待入场成员", phone: "13800000006" },
    });
    await client.request("/account/avatar", {
      method: "POST",
      data: { avatarDataUrl: "data:image/png;base64,iVBORw0KGgo=" },
    });
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
      workType: "木工",
      enteredAt: new Date().toISOString(),
      exitedAt: null,
      expectedUpdatedAt: null,
      expectedProfileUpdatedAt: null,
      phone: "13800000009",
      participantType: "WORKER",
      projectRoleLabel: "木工",
      teamId: team.id,
      requiresAttendance: true,
      status: "ACTIVE",
    };
    const person = await client.request<ManagedParticipant>(
      "/management/projects/demo-project/participants",
      { method: "POST", data: body },
    );
    expect(person.teamName).toBe("测试二班");
    await client.request(
      `/management/projects/demo-project/participants/${person.memberId}`,
      {
        method: "PUT",
        data: {
          ...body,
          status: "EXITED",
          exitedAt: new Date().toISOString(),
          expectedUpdatedAt: person.updatedAt,
          expectedProfileUpdatedAt: person.profileUpdatedAt,
        },
      },
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
    const stored = readDemoState();
    Taro.setStorageSync("hanbo.frontend-demo.v1", { ...stored, makeups: [], records: stored.records.filter((row) => !(row.participantId === "profile-worker" && row.attendanceDate === chinaDaysAgo(1) && row.pointCode === "SEGMENT_1_START")) });
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
  test("project creation and atomic attendance plan saving keep scope isolated", async () => {
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
    const path = `/attendance/planning/${project.id}/PROJECT/${project.id}`;
    await client.request(path, {
      method: "POST",
      data: { expectedId: null, name: "新班次", startsOn: new Date(Date.parse(`${chinaToday()}T00:00:00Z`) + 86400000).toISOString().slice(0, 10), endsOn: null, workdays: [1,2,3,4,5], points: [
        { code: "START", label: "上班", kind: "START", time: "08:30", graceMins: 5 },
        { code: "END", label: "下班", kind: "END", time: "17:00", graceMins: 5 },
      ] },
    });
    const configuration = await client.request<{ name: string; workdays: number[] }>(path, { method: "GET" });
    expect(configuration.name).toBe("新班次");
    expect(configuration.workdays).toHaveLength(5);
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
    const countBefore = readDemoState().records.length;
    await expect(
      client.request("/attendance/projects/demo-project/records", {
        method: "POST",
        data: {
          attendanceDate: chinaToday(),
          pointCode: "END",
          occurredAt: new Date().toISOString(),
          latitude: "32.2304",
          longitude: "121.4737",
          locationAccuracyM: "10",
          selfieObjectKey: "demo/selfie",
          selfieHash: "demo",
          sitePhotoObjectKey: "demo/site",
          sitePhotoHash: "demo",
        },
      }),
    ).rejects.toThrow("不在考勤范围内");
    expect(readDemoState().records).toHaveLength(countBefore);
    const result = await client.request<SubmitAttendanceRecordResult>(
      "/attendance/projects/demo-project/records",
      {
        method: "POST",
        data: {
          attendanceDate: chinaToday(),
          pointCode: "END",
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
  test("future member and team plans take precedence without changing today's requirements", async () => {
    await login("dev-project");
    const startsOn = new Date(Date.parse(`${chinaToday()}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    const nextDay = new Date(Date.parse(`${startsOn}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    const points = [
      { code: "START", label: "上班", kind: "START", time: "08:00", graceMins: 0 },
      { code: "CHECK", label: "午间签到", kind: "CHECKPOINT", time: "12:00", graceMins: 5 },
      { code: "END", label: "下班", kind: "END", time: "17:30", graceMins: 0 },
    ];
    const input = { expectedId: null, startsOn, endsOn: null, workdays: [1,2,3,4,5,6,7], points };
    await client.request("/attendance/planning/demo-project/TEAM/demo-team", { method: "POST", data: { ...input, name: "班组班次" } });
    const member = await client.request<{ id: string }>("/attendance/planning/demo-project/MEMBER/member-worker", { method: "POST", data: { ...input, name: "个人班次" } });
    await login("dev-worker");
    const today = await client.request<AttendanceToday>("/me/projects/demo-project/attendance-today", { method: "GET" });
    expect(today.points).toHaveLength(2);
    expect(today.shiftName).toBe("每日两次");
    expect((await client.request<{ name: string }>(`/me/projects/demo-project/attendance-plan?date=${startsOn}`, { method: "GET" })).name).toBe("个人班次");
    await login("dev-project");
    await client.request("/attendance/planning/demo-project/MEMBER/member-worker/inherit", { method: "POST", data: { ...input, expectedId: member.id, startsOn: nextDay, name: "继承" } });
    await login("dev-worker");
    expect((await client.request<{ name: string }>(`/me/projects/demo-project/attendance-plan?date=${nextDay}`, { method: "GET" })).name).toBe("班组班次");
    await expect(client.request("/attendance/planning/demo-project/TEAM/demo-team", { method: "POST", data: { ...input, name: "越权" } })).rejects.toThrow();
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
