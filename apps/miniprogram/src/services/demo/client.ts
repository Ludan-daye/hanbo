import Taro from "@tarojs/taro";

import { ApiError, type ApiClient, type RequestOptions } from "../apiClient";
import type { AccountProfile } from "../account";
import type {
  DefaultScheduleBody,
  DefaultShiftBody,
  CompanyProject,
  CreateProjectBody,
  ProjectParticipant,
  ProjectTeam,
} from "../management.types";
import type { SubmitAttendanceRecordBody, SubmitMakeupBody } from "../me.types";
import type {
  Account,
  Company,
  PersonForm,
  SystemSettings,
} from "../workflows";
import type { UploadResult } from "../uploads";
import { chinaToday } from "../time";
import { effectiveDemoConfiguration } from "./configuration";
import { demoDaySummary, demoReport } from "./reports";
import {
  demoId,
  demoMe,
  initialDemoState,
  makeDemoRecord,
  DEMO_POINT_CODES,
  type DemoState,
  type DemoFace,
  type DemoInvitation,
} from "./state";

const STORAGE_KEY = "hanbo.frontend-demo.v1";
export const readDemoState = (): DemoState => {
  const stored: DemoState | "" = Taro.getStorageSync(STORAGE_KEY);
  if (stored === "") return initialDemoState();
  if (stored.version !== 1)
    throw new Error("演示数据版本不兼容，请在“我的”重置演示数据。");
  return stored;
};
export const resetDemoState = (): void => {
  Taro.removeStorageSync(STORAGE_KEY);
};
const currentUser = (): string => {
  const token: string = String(Taro.getStorageSync("demoAccessToken") || "");
  if (!token.startsWith("demo:"))
    throw new ApiError(401, "请选择演示身份后继续。", {
      tokenPresent: token.length > 0,
    });
  return token.slice(5);
};
type DemoResponse = { readonly state: DemoState; readonly data: unknown };
const response = (state: DemoState, data: unknown): DemoResponse => ({
  state,
  data,
});
const requirePerson = (
  state: DemoState,
  userId: string,
  projectId: string,
): ProjectParticipant => {
  const me = demoMe(state, userId);
  const person = state.people.find(
    (row) =>
      row.profileId === me.profile.id &&
      row.projectId === projectId &&
      row.status === "ACTIVE",
  );
  if (!person)
    throw new ApiError(403, "当前演示身份没有此项目的有效成员档案。", {
      projectId,
      userId,
    });
  return person;
};
const assertDemoScope = (
  state: DemoState,
  userId: string,
  path: string,
  method: string,
): void => {
  const me = demoMe(state, userId);
  const role = me.roles.highestRoleCode;
  const parts = path.split("?")[0].split("/").filter(Boolean);
  if (
    role === "SYSTEM_ADMIN" ||
    parts[0] === "auth" ||
    parts[0] === "account" ||
    parts[0] === "me" ||
    (parts[0] === "face-profiles" && parts[1] === "me") ||
    parts[0] === "app"
  )
    return;
  const assignedScope = me.roles.assignments[0]?.scope.scopeId;
  const managedCompany = state.companies.find(
    (row) => row.id === assignedScope,
  );
  const managesProject = (projectId: string): boolean =>
    role === "PROJECT_ADMIN"
      ? assignedScope === projectId
      : role === "COMPANY_ADMIN" &&
        managedCompany?.status === "ACTIVE" &&
        state.projects.some(
          (row) => row.id === projectId && row.companyId === assignedScope,
        );
  if (parts[0] === "system")
    throw new ApiError(403, "需要系统管理员身份。", { path, userId });
  if (
    parts[1] === "companies" &&
    role === "COMPANY_ADMIN" &&
    parts[2] === assignedScope &&
    managedCompany?.status === "ACTIVE"
  )
    return;
  if (parts[1] === "projects" && managesProject(parts[2])) return;
  if (parts[1] === "teams") {
    const team = state.teams.find((row) => row.id === parts[2]);
    if (
      (role === "TEAM_LEADER" && assignedScope === parts[2]) ||
      (team && managesProject(team.projectId))
    )
      return;
  }
  if (
    (parts[0] === "attendance" && parts[3] === "records") ||
    (parts[0] === "makeups" && parts[1] === "projects")
  ) {
    requirePerson(state, userId, parts[2]);
    return;
  }
  if (parts[0] === "makeups" && parts[1] === "requests") {
    const request = state.makeups.find((row) => row.id === parts[2]);
    const person = state.people.find(
      (row) =>
        row.profileId === request?.participantId &&
        row.projectId === request.projectId,
    );
    if (
      person &&
      ((role === "TEAM_LEADER" && person.teamId === assignedScope) ||
        managesProject(person.projectId))
    )
      return;
  }
  throw new ApiError(403, "此演示身份没有访问当前数据范围的权限。", {
    path,
    method,
    userId,
    role,
    assignedScope,
  });
};
const routeDemo = (
  state: DemoState,
  userId: string,
  path: string,
  options: RequestOptions,
): DemoResponse => {
  const method = options.method ?? "GET";
  const [pathname, queryText] = path.split("?");
  const parts = pathname.split("/").filter(Boolean);
  const query: Readonly<Record<string, string>> = Object.fromEntries(
    (queryText ?? "")
      .split("&")
      .filter(Boolean)
      .map((pair) => pair.split("=").map(decodeURIComponent)),
  );
  const me = demoMe(state, userId);
  assertDemoScope(state, userId, path, method);
  if (path === "/app/settings") return response(state, state.settings);
  if (path === "/auth/me") return response(state, me);
  if (path === "/account/profile" || path === "/account/avatar") {
    const person = state.people.find((row) => row.profileId === me.profile.id);
    const profile: AccountProfile = {
      nickname: state.accountProfiles?.[userId]?.nickname ?? null,
      avatarDataUrl: state.accountProfiles?.[userId]?.avatarDataUrl ?? null,
      isBound: me.user.isBound,
      phoneMasked: person
        ? person.phone.replace(/^(\d{3})\d+(\d{4})$/, "$1****$2")
        : null,
    };
    if (method === "GET" && path === "/account/profile")
      return response(state, profile);
    if (method === "PUT" && path === "/account/profile") {
      const { nickname } = options.data as { readonly nickname: string };
      if (
        typeof nickname !== "string" ||
        nickname.trim().length === 0 ||
        nickname.trim().length > 32
      ) {
        throw new ApiError(400, "昵称须为 1 至 32 个字符。", { path });
      }
      const updated: AccountProfile = { ...profile, nickname: nickname.trim() };
      return response(
        {
          ...state,
          accountProfiles: { ...state.accountProfiles, [userId]: updated },
        },
        updated,
      );
    }
    if (method === "POST" && path === "/account/avatar") {
      const { avatarDataUrl } = options.data as {
        readonly avatarDataUrl: string;
      };
      if (
        typeof avatarDataUrl !== "string" ||
        !/^data:image\/(jpeg|png);base64,/.test(avatarDataUrl)
      ) {
        throw new ApiError(400, "请选择 JPG 或 PNG 格式的头像。", { path });
      }
      const updated: AccountProfile = { ...profile, avatarDataUrl };
      return response(
        {
          ...state,
          accountProfiles: { ...state.accountProfiles, [userId]: updated },
        },
        updated,
      );
    }
    throw new ApiError(405, "账号资料接口不支持此操作。", { path, method });
  }
  if (path === "/auth/logout") return response(state, {});
  if (path === "/auth/bind") {
    const code = (
      options.data as { readonly invitationCode: string }
    ).invitationCode.trim();
    const invitation = state.invitations.find(
      (row) =>
        row.code === code &&
        row.status === "PENDING" &&
        Date.parse(row.expiresAt) > Date.now(),
    );
    if (userId !== "dev-unbound" || state.boundProfileId || !invitation)
      throw new ApiError(
        400,
        "邀请码无效、已使用或当前身份已绑定。演示邀请码：HANBO-DEMO",
        { code },
      );
    return response(
      {
        ...state,
        boundProfileId: invitation.profileId,
        invitations: state.invitations.map((row) =>
          row.id === invitation.id
            ? { ...row, status: "ACCEPTED", acceptedByUserId: userId }
            : row,
        ),
      },
      {},
    );
  }
  if (parts[0] === "system") {
    if (me.roles.highestRoleCode !== "SYSTEM_ADMIN")
      throw new ApiError(403, "仅系统管理员可以访问平台管理。", { path });
    if (parts[1] === "companies") {
      if (method === "GET") return response(state, state.companies);
      const body = options.data as Company;
      if (
        state.companies.some(
          (row) => row.name === body.name && row.id !== body.id,
        )
      )
        throw new ApiError(409, "已有同名公司。", { name: body.name });
      const company: Company = { ...body, id: body.id || demoId("company") };
      return response(
        {
          ...state,
          companies: [
            ...state.companies.filter((row) => row.id !== company.id),
            company,
          ],
        },
        company,
      );
    }
    if (parts[1] === "accounts") {
      if (method === "GET") return response(state, state.accounts);
      const account = options.data as Account;
      if (account.id === userId)
        throw new ApiError(400, "不能修改当前登录账号的权限或状态。", {
          accountId: account.id,
        });
      return response(
        {
          ...state,
          accounts: state.accounts.map((row) =>
            row.id === account.id ? account : row,
          ),
        },
        account,
      );
    }
    if (parts[1] === "settings")
      return method === "GET"
        ? response(state, state.settings)
        : response(
            { ...state, settings: options.data as SystemSettings },
            options.data,
          );
    if (parts[1] === "audit") return response(state, state.audit);
  }
  if (path === "/me/projects")
    return response(
      state,
      state.people
        .filter(
          (row) => row.profileId === me.profile.id && row.status === "ACTIVE",
        )
        .map((row) => ({
          projectId: row.projectId,
          projectName: state.projects.find((p) => p.id === row.projectId)?.name,
          projectRoleLabel: row.projectRoleLabel,
          teamId: row.teamId,
          teamName: row.teamName,
        })),
    );
  if (pathname === "/me/attendance-records")
    return response(
      state,
      state.records.filter(
        (row) =>
          row.participantId === me.profile.id &&
          row.attendanceDate >= query.from &&
          row.attendanceDate <= query.to,
      ),
    );
  if (path === "/me/makeups")
    return response(
      state,
      state.makeups.filter((row) => row.requesterUserId === userId),
    );
  if (parts[0] === "me" && parts[3] === "attendance-today") {
    const projectId = parts[2];
    const person = requirePerson(state, userId, projectId);
    const project = state.projects.find((row) => row.id === projectId);
    if (!project) throw new ApiError(404, "项目不存在。", { projectId });
    const configuration = effectiveDemoConfiguration(
      state,
      person,
      chinaToday(),
    );
    const shift = configuration?.shift;
    const schedule = configuration?.schedule;
    const date = chinaToday();
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
    const isWorkday =
      !!schedule &&
      schedule.startsOn <= date &&
      (schedule.endsOn === null || date <= schedule.endsOn) &&
      schedule.workdays.some((day) => day === weekday);
    return response(state, {
      attendanceDate: date,
      configured: !!shift && !!schedule,
      geofence: {
        centerLatitude: project.centerLatitude,
        centerLongitude: project.centerLongitude,
        radiusM: project.geofenceRadiusM,
      },
      isWorkday,
      shiftName: shift?.name ?? null,
      result: demoDaySummary(state, person, date),
      points: shift
        ? DEMO_POINT_CODES.map((pointCode, index) => ({
            pointCode,
            scheduledTime: [
              shift.segments[0].startTime,
              shift.segments[0].endTime,
              shift.segments[1].startTime,
              shift.segments[1].endTime,
            ][index],
            graceMins:
              index === 0
                ? shift.segments[0].lateGraceMins
                : shift.segments[1].earlyGraceMins,
            record:
              state.records
                .filter(
                  (r) =>
                    r.projectId === projectId &&
                    r.participantId === person.profileId &&
                    r.attendanceDate === date &&
                    r.pointCode === pointCode,
                )
                .slice(-1)[0] ?? null,
          }))
        : [],
    });
  }
  if (parts[0] === "management" || parts[0] === "bindings") {
    const scope = parts[1];
    const scopeId = parts[2];
    const resource = parts[3];
    if (scope === "companies") {
      if (resource === "projects") {
        if (method === "GET")
          return response(
            state,
            state.projects.filter((row) => row.companyId === scopeId),
          );
        const project: CompanyProject = {
          ...(options.data as CreateProjectBody),
          id: demoId("project"),
          companyId: scopeId,
        };
        return response(
          { ...state, projects: [...state.projects, project] },
          project,
        );
      }
      if (resource === "participants")
        return response(
          state,
          state.people
            .filter((row) =>
              state.projects.some(
                (p) => p.id === row.projectId && p.companyId === scopeId,
              ),
            )
            .map((row) => ({
              ...row,
              projectName: state.projects.find((p) => p.id === row.projectId)
                ?.name,
            })),
        );
    }
    if (scope === "teams" && resource === "participants")
      return response(
        state,
        state.people.filter((row) => row.teamId === scopeId),
      );
    if (scope === "projects") {
      const project = state.projects.find((row) => row.id === scopeId);
      if (!project)
        throw new ApiError(404, "项目不存在。", { projectId: scopeId });
      if (!resource)
        return method === "GET"
          ? response(state, project)
          : response(
              {
                ...state,
                projects: state.projects.map((row) =>
                  row.id === scopeId ? (options.data as CompanyProject) : row,
                ),
              },
              options.data,
            );
      if (resource === "participants") {
        if (method === "GET")
          return response(
            state,
            state.people.filter((row) => row.projectId === scopeId),
          );
        const body = options.data as PersonForm;
        const original = state.people.find(
          (row) => row.memberId === parts[4] && row.projectId === scopeId,
        );
        if (method === "PUT" && !original)
          throw new ApiError(404, "成员档案不存在。", { memberId: parts[4] });
        if (
          state.people.some(
            (row) =>
              row.projectId === scopeId &&
              row.phone === body.phone &&
              row.memberId !== original?.memberId,
          )
        )
          throw new ApiError(
            409,
            "此项目已有相同手机号的成员，请编辑已有档案。",
            { projectId: scopeId, phone: body.phone },
          );
        const person: ProjectParticipant = {
          ...body,
          projectId: scopeId,
          profileId: original?.profileId ?? demoId("profile"),
          memberId: original?.memberId ?? demoId("member"),
          teamName:
            state.teams.find((row) => row.id === body.teamId)?.name ?? null,
        };
        return response(
          {
            ...state,
            people: [
              ...state.people.filter((row) => row.memberId !== person.memberId),
              person,
            ],
          },
          person,
        );
      }
      if (resource === "teams") {
        if (method === "GET")
          return response(
            state,
            state.teams.filter((row) => row.projectId === scopeId),
          );
        const body = options.data as {
          readonly name: string;
          readonly status: string;
        };
        if (
          state.teams.some(
            (row) => row.projectId === scopeId && row.name === body.name,
          )
        )
          throw new ApiError(409, "此项目已有同名班组。", body);
        const team: ProjectTeam = {
          ...body,
          id: demoId("team"),
          projectId: scopeId,
        };
        return response({ ...state, teams: [...state.teams, team] }, team);
      }
      if (resource === "invitations") {
        if (method === "GET")
          return response(
            state,
            state.invitations
              .filter((row) => row.projectId === scopeId)
              .map((row) => ({
                ...row,
                status:
                  row.status === "PENDING" &&
                  Date.parse(row.expiresAt) < Date.now()
                    ? "EXPIRED"
                    : row.status,
              })),
          );
        if (parts[5] === "revoke") {
          const invitation = state.invitations.find(
            (row) => row.id === parts[4] && row.projectId === scopeId,
          );
          if (!invitation || invitation.status !== "PENDING")
            throw new ApiError(409, "邀请已失效，请刷新列表。", {
              invitationId: parts[4],
            });
          const updated: DemoInvitation = { ...invitation, status: "REVOKED" };
          return response(
            {
              ...state,
              invitations: state.invitations.map((row) =>
                row.id === updated.id ? updated : row,
              ),
            },
            updated,
          );
        }
        const body = options.data as {
          readonly profileId: string;
          readonly targetType: "WORKER" | "MANAGER";
        };
        if (
          state.accounts.some(
            (account) =>
              demoMe(state, account.id).profile.id === body.profileId,
          ) ||
          state.boundProfileId === body.profileId
        )
          throw new ApiError(409, "该成员已经绑定账号，无需重复邀请。", body);
        const invitation: DemoInvitation = {
          ...body,
          projectId: scopeId,
          id: demoId("invite"),
          code: demoId("HB").toUpperCase(),
          status: "PENDING",
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
          acceptedByUserId: null,
        };
        return response(
          { ...state, invitations: [...state.invitations, invitation] },
          invitation,
        );
      }
    }
  }
  if (parts[0] === "attendance" && parts[1] === "projects") {
    const projectId = parts[2];
    const scoped = parts[3] === "teams" || parts[3] === "members";
    const resource = scoped ? parts[5] : parts[3];
    const configKey = scoped
      ? `${projectId}/${parts[3]}/${parts[4]}`
      : projectId;
    if (scoped && method === "DELETE" && resource === "configuration")
      return response(
        {
          ...state,
          configurations: Object.fromEntries(
            Object.entries(state.configurations).filter(
              ([key]) => key !== configKey,
            ),
          ),
        },
        {},
      );
    const config = state.configurations[configKey] ?? {
      shift: null,
      schedule: null,
    };
    if (resource === "default-configuration" || resource === "configuration")
      return response(state, config);
    if (resource === "default-shift" || resource === "shift") {
      const shift = {
        ...(options.data as DefaultShiftBody),
        id: config.shift?.id ?? demoId("shift"),
      };
      return response(
        {
          ...state,
          configurations: {
            ...state.configurations,
            [configKey]: { ...config, shift },
          },
        },
        shift,
      );
    }
    if (resource === "default-schedule" || resource === "schedule") {
      if (!config.shift)
        throw new ApiError(400, "请先保存班次。", { projectId });
      const schedule = {
        ...(options.data as DefaultScheduleBody),
        shiftId: config.shift.id,
      };
      return response(
        {
          ...state,
          configurations: {
            ...state.configurations,
            [configKey]: { ...config, schedule },
          },
        },
        schedule,
      );
    }
    if (resource === "records") {
      const person = requirePerson(state, userId, projectId);
      const body = options.data as SubmitAttendanceRecordBody;
      const record = {
        ...makeDemoRecord(
          person,
          body.attendanceDate,
          body.pointCode,
          body.occurredAt,
        ),
        ...body,
      };
      const next = { ...state, records: [...state.records, record] };
      return response(next, {
        record,
        result: demoDaySummary(next, person, body.attendanceDate),
      });
    }
  }
  if (parts[0] === "makeups") {
    if (parts[1] === "teams")
      return response(
        state,
        state.makeups.filter(
          (row) =>
            row.status === "PENDING" &&
            state.people.some(
              (p) =>
                p.profileId === row.participantId &&
                p.projectId === row.projectId &&
                p.teamId === parts[2],
            ),
        ),
      );
    if (parts[1] === "projects") {
      const person = requirePerson(state, userId, parts[2]);
      const body = options.data as SubmitMakeupBody;
      const makeup = {
        ...body,
        id: demoId("makeup"),
        projectId: person.projectId,
        participantId: person.profileId,
        participantType: person.participantType,
        requesterUserId: userId,
        status: "PENDING" as const,
        approvalReason: null,
        approvedAt: null,
        approverUserId: null,
      };
      return response(
        { ...state, makeups: [...state.makeups, makeup] },
        makeup,
      );
    }
    const request = state.makeups.find((row) => row.id === parts[2]);
    if (!request || request.status !== "PENDING")
      throw new ApiError(409, "这条补卡申请已被处理，请刷新列表。", {
        requestId: parts[2],
      });
    if (request.requesterUserId === userId)
      throw new ApiError(403, "不能审批自己的补卡申请。", {
        requestId: request.id,
      });
    const updated = {
      ...request,
      status:
        parts[3] === "approve" ? ("APPROVED" as const) : ("REJECTED" as const),
      approvalReason: (options.data as { readonly approvalReason: string })
        .approvalReason,
      approverUserId: userId,
      approvedAt: new Date().toISOString(),
    };
    return response(
      {
        ...state,
        makeups: state.makeups.map((row) =>
          row.id === updated.id ? updated : row,
        ),
      },
      updated,
    );
  }
  if (parts[0] === "reports") {
    const scopeId = parts[2];
    const people = state.people.filter((row) =>
      parts[1] === "projects"
        ? row.projectId === scopeId
        : parts[1] === "teams"
          ? row.teamId === scopeId
          : state.projects.some(
              (p) => p.id === row.projectId && p.companyId === scopeId,
            ),
    );
    const start = query.date ?? query.weekStartDate ?? `${query.month}-01`;
    const end =
      parts[3] === "weekly"
        ? new Date(Date.parse(`${start}T00:00:00Z`) + 6 * 86400000)
            .toISOString()
            .slice(0, 10)
        : parts[3] === "monthly"
          ? new Date(
              Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)), 0),
            )
              .toISOString()
              .slice(0, 10)
          : start;
    return response(
      state,
      demoReport(state, people, scopeId, parts[3], start, end),
    );
  }
  if (parts[0] === "face-profiles") {
    if (parts[1] === "me")
      return response(state, {
        mode: "DEVELOPMENT",
        consentVersion: "demo-face-v1",
        consentText:
          "前端演示：照片仅保存在当前设备，不上传云端，不执行真实活体或人脸比对。请使用测试图片。",
        profile:
          state.faces
            .filter((row) => row.ownerId === me.profile.id)
            .slice(-1)[0] ?? null,
      });
    const faces = state.faces.filter((row) =>
      state.people.some(
        (p) => p.projectId === parts[2] && p.profileId === row.ownerId,
      ),
    );
    if (!parts[3]) return response(state, faces);
    const face = faces.find((row) => row.id === parts[3]);
    if (!face)
      throw new ApiError(404, "人脸档案不存在。", { profileId: parts[3] });
    if (parts[4] === "photo") return response(state, { dataUrl: face.photo });
    if (face.ownerId === me.profile.id)
      throw new ApiError(403, "不能审核自己的底照。", { profileId: face.id });
    const body = options.data as {
      readonly decision: string;
      readonly reason: string;
    };
    const updated: DemoFace = {
      ...face,
      status: body.decision,
      reviewReason: body.reason,
      reviewedAt: new Date().toISOString(),
    };
    return response(
      {
        ...state,
        faces: state.faces.map((row) => (row.id === face.id ? updated : row)),
      },
      updated,
    );
  }
  throw new ApiError(501, `前端演示接口尚未定义：${method} ${path}`, {
    method,
    path,
    data: options.data,
  });
};

export const createDemoClient = (): ApiClient => ({
  request: async <T>(path: string, options?: RequestOptions): Promise<T> => {
    const state = readDemoState();
    if (path === "/auth/wechat/login") {
      const code = (options?.data as { readonly code: string }).code;
      if (
        !state.accounts.some((row) => row.id === code) &&
        code !== "dev-unbound"
      )
        throw new ApiError(400, "未知的演示身份。", { code });
      demoMe(state, code);
      Taro.setStorageSync(STORAGE_KEY, state);
      return {
        accessToken: `demo:${code}`,
        refreshToken: `demo-refresh:${code}`,
      } as T;
    }
    const userId = currentUser();
    const result = routeDemo(state, userId, path, options ?? {});
    const next: DemoState =
      options?.method && options.method !== "GET"
        ? {
            ...result.state,
            audit: [
              {
                id: demoId("audit"),
                action: `${options.method} ${path}`,
                actor: userId,
                createdAt: new Date().toISOString(),
              },
              ...result.state.audit,
            ].slice(0, 200),
          }
        : result.state;
    Taro.setStorageSync(STORAGE_KEY, next);
    return result.data as T;
  },
});

export const demoUploadImage = (filePath: string): UploadResult => {
  if (filePath.length === 0) throw new Error("请选择一张测试图片。");
  const id = demoId("photo");
  return {
    objectKey: `demo/${id}`,
    hash: id,
    contentType: "image/jpeg",
    sizeBytes: 0,
  };
};
export const demoEnrollFace = (
  photo: string,
  consentVersion: string,
): DemoFace => {
  if (consentVersion !== "demo-face-v1")
    throw new Error("请重新阅读演示采集说明。");
  const state = readDemoState();
  const me = demoMe(state, currentUser());
  if (!me.profile.id || !me.profile.type)
    throw new Error("当前演示账号没有人员档案。");
  const face: DemoFace = {
    id: demoId("face"),
    ownerId: me.profile.id,
    ownerType: me.profile.type,
    version:
      state.faces.filter((row) => row.ownerId === me.profile.id).length + 1,
    status: "PENDING",
    reviewReason: null,
    createdAt: new Date().toISOString(),
    reviewedAt: null,
    photo,
  };
  Taro.setStorageSync(STORAGE_KEY, {
    ...state,
    faces: [
      ...state.faces.map((row) =>
        row.ownerId === me.profile.id ? { ...row, status: "REPLACED" } : row,
      ),
      face,
    ],
  });
  return face;
};
