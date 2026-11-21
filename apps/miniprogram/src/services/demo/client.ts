import { confirmDemoSafety, demoSafetyNotice, requireDemoSafety } from "./attendance-safety";
import { parseOvertimePoint, parseTaskPoint, type AuditCategory, type ConfirmAttendanceSafety } from "@construction/domain";
import { approveDemoTaskMakeup, demoTaskMakeupTarget, demoTaskToday, punchDemoTask } from "./task-attendance";
import { demoTeamWorkRequest } from "./team-work";
import { demoWorktimeRequest } from "./worktime";
import { demoOvertimeToday, punchDemoOvertime, requireDemoOvertimeEnd } from "./overtime-attendance";
import { demoSafetyCreditRequest } from "./safety-credit";
import { memberRoleAssignments, memberRoleFields } from "../member-roles";
import { demoMyProject } from "./my-project";
import { demoReportPerson, saveDemoEvaluation } from "./report-details";
import { demoProjectManagers } from "./project-managers";
import { applyDemoCompanyDefaults, demoCompanyDefaults, demoCompanyProfile, saveDemoCompanyDefaults, updateDemoCompanyProfile } from "./company-settings";
import { demoCompanyPeoplePage, demoCompanyPerson, demoOffboard, demoProjectAdmins } from "./company-people";
import { demoPlanRequest, effectiveDemoPlan, demoPlanLevel } from "./plans";
import Taro from "@tarojs/taro";
import { FRONTEND_DEMO } from "../../config/env";
import workerPreviewAvatar from "../../assets/icons/user.png";

import { demoMemberOn, demoMemberEligible } from "./member-history";
import { ROLE_LEVEL } from "@construction/domain/roles.js";
import { participantPermissionRole } from "../../routing/permissionLevels";

import { ApiError, type ApiClient, type RequestOptions } from "../apiClient";
import { noteWrite } from "../read-cache";
import type { AccountProfile } from "../account";
import { emptyWorkerRegistration, normalizeWorkerRegistration, workerRegistrationError, type WorkerRegistration } from "@construction/domain";
import type {
  DefaultScheduleBody,
  DefaultShiftBody,
  ManagedProject,
  WorkRoleScope,
  ManagedParticipant,
  CreateProjectBody,
  ProjectParticipant,
  ProjectTeam,
  ReusePersonForm,
  TeamForm,
} from "../management.types";
import type { SubmitAttendanceRecordBody, SubmitMakeupBody } from "../me.types";
import type {
  Account,
  Company,
  PersonForm,
  SystemSettings,
} from "../workflows";
import type { UploadResult } from "../uploads";
import { chinaToday, chinaDaysAgo } from "../time";
import { checkAttendanceGeofence } from "../geofence";
import { managedDemoTeam } from "./teams";
import { demoAuditLog } from "./audit-log";
import type { TransferRequestForm } from "../transfers";
import { demoDaySummary, demoReport, dailyPerson } from "./reports";
import {
  demoId,
  demoMe,
  initialDemoState,
  makeDemoRecord,
  type DemoState,
  type LegacyDemoState,
  upgradeDemoState,
  upgradeDemoPlanning,
  type DemoFace,
  type DemoInvitation,
  type DemoTransfer,
} from "./state";

const validateDemoRoles = (state: DemoState, projectId: string, body: Pick<PersonForm, "participantType" | "projectRoleLabel" | "teamId" | "additionalRoles">): void => {
  const roles = memberRoleAssignments(body);
  const fields = memberRoleFields(roles, body.projectRoleLabel, body.teamId);
  if (fields.projectRoleLabel !== body.projectRoleLabel || fields.teamId !== body.teamId || roles.length > 21) throw new ApiError(400, "项目职级配置无效。", { projectId });
  if (roles.some((role) => role.roleCode === "TEAM_LEADER" && !state.teams.some((team) => team.id === role.teamId && team.projectId === projectId))) throw new ApiError(400, "管理班组不属于本项目。", { projectId });
};
const belongsToDemoTeam = (person: ProjectParticipant, teamId: string): boolean => person.teamId === teamId || memberRoleAssignments(person).some((role) => role.roleCode === "TEAM_LEADER" && role.teamId === teamId);

const STORAGE_KEY = "hanbo.frontend-demo.v1";
export const readDemoState = (): DemoState => {
  const stored: DemoState | LegacyDemoState | "" =
    Taro.getStorageSync(STORAGE_KEY);
  if (stored === "") return initialDemoState();
  if (stored.version === 1) {
    const upgraded: DemoState = upgradeDemoPlanning(
      upgradeDemoState(stored, new Date().toISOString()),
      chinaDaysAgo(-1),
    );
    Taro.setStorageSync(STORAGE_KEY, upgraded);
    return upgraded;
  }
  if (
    stored.version !== 2 ||
    stored.people.some((person) => typeof person.enteredAt !== "string") ||
    stored.projects.some((project) => typeof project.updatedAt !== "string")
  )
    throw new Error("演示资料结构已更新，请在“我的”重置演示数据后继续。");
  if (stored.plans === undefined) {
    const upgraded = upgradeDemoPlanning(stored, chinaDaysAgo(-1));
    Taro.setStorageSync(STORAGE_KEY, upgraded);
    return upgraded;
  }
  return stored;
};
export const resetDemoState = (): void => {
  Taro.removeStorageSync(STORAGE_KEY);
};

/** Explicit Demo opt-in only: fill missing sample data without bypassing session guards. */
export const prepareDemoWorkerPreview = (): void => {
  if (!FRONTEND_DEMO) throw new Error("直接体验仅适用于演示模式。");
  const state = readDemoState();
  const me = demoMe(state, "dev-worker");
  if (me.roles.highestRoleCode !== "WORKER" || me.profile.id !== "profile-worker")
    throw new Error("演示工人身份不可用，请选择其他演示入口。");
  const person = state.people.find((row) => row.profileId === "profile-worker");
  if (!person) throw new Error("未找到演示工人档案。");
  const previous = state.accountProfiles?.["dev-worker"];
  const phone = previous?.phone || person.phone;
  const accountProfile: AccountProfile = {
    ...previous,
    nickname: previous?.nickname || "演示工人",
    realName: previous?.realName || person.displayName?.replace(/（演示）$/, "") || "张建国",
    phone,
    phoneMasked: previous?.phoneMasked || phone.replace(/^(\d{3})\d+(\d{4})$/, "$1****$2"),
    avatarDataUrl: previous?.avatarDataUrl || workerPreviewAvatar,
    isBound: true,
    workerRegistration: "COMPLETE",
  };
  let registration = state.workerRegistrations?.["profile-worker"];
  if (!registration) {
    // 999999 is a fictional area code. Keep the checksum valid for existing form validation.
    const usedIds = new Set(Object.values(state.workerRegistrations ?? {}).map((row) => row.idNumber));
    let idNumber = "";
    for (let sequence = 1; sequence <= 999; sequence += 1) {
      const body = `99999919900101${String(sequence).padStart(3, "0")}`;
      const sum = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
        .reduce((total, weight, index) => total + Number(body[index]) * weight, 0);
      const candidate = body + "10X98765432"[sum % 11];
      if (!usedIds.has(candidate)) { idNumber = candidate; break; }
    }
    if (!idNumber) throw new Error("演示身份证号已用完，请使用完整登记入口。");
    registration = {
      idNumber,
      residentialAddress: "地区：北京市 / 北京市 / 朝阳区\n详细地址：演示小区1号楼101室",
      emergencyContactName: "测试联系人",
      emergencyContactPhone: "13800000002",
      hasLongTermMedication: false,
      medicationDetails: "",
      hasPersonalInsurance: false,
      insuranceDetails: "",
      payrollBankCard: "6222020000000000000",
    };
  }
  const faces: readonly DemoFace[] = state.faces.some((row) => row.ownerId === "profile-worker")
    ? state.faces
    : [...state.faces, {
        id: demoId("preview-face"), ownerId: "profile-worker", ownerType: "WORKER",
        status: "PENDING", version: 1, reviewReason: null,
        createdAt: new Date().toISOString(), reviewedAt: null, photo: workerPreviewAvatar,
      }];
  Taro.setStorageSync(STORAGE_KEY, {
    ...state,
    accountProfiles: { ...state.accountProfiles, "dev-worker": accountProfile },
    workerRegistrations: { ...state.workerRegistrations, "profile-worker": registration },
    faces,
  });
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
const canManageDemoProject = (
  state: DemoState,
  userId: string,
  projectId: string,
): boolean => {
  const me = demoMe(state, userId);
  const project = state.projects.find((row) => row.id === projectId);
  return me.roles.assignments.some(
    (assignment) =>
      assignment.roleCode === "SYSTEM_ADMIN" ||
      (assignment.roleCode === "PROJECT_ADMIN" &&
        assignment.scope.scopeId === projectId) ||
      (assignment.roleCode === "COMPANY_ADMIN" &&
        assignment.scope.scopeId === project?.companyId &&
        state.companies.some(
          (company) =>
            company.id === project.companyId && company.status === "ACTIVE",
        )),
  );
};
/**
 * 只有公司级能批：项目里除了申请人和自己，没有职级更高的项目管理员，
 * 也没有管着申请人班组的班组长（和服务端 onlyYou 同口径）。
 */
const demoOnlyYou = (
  state: DemoState,
  userId: string,
  row: { readonly projectId: string; readonly attendanceDate: string },
  person: ProjectParticipant,
): boolean => {
  const historical = demoMemberOn(state, person, row.attendanceDate);
  const level = ROLE_LEVEL[participantPermissionRole(historical)];
  const me = demoMe(state, userId);
  return !state.people.some((other) => {
    if (other.projectId !== row.projectId || other.status !== "ACTIVE") return false;
    if (other.profileId === person.profileId || other.profileId === me.profile.id) return false;
    return memberRoleAssignments(other).some(
      (role) =>
        ROLE_LEVEL[role.roleCode] > level &&
        (role.roleCode === "PROJECT_ADMIN" ||
          (role.roleCode === "TEAM_LEADER" && historical.teamId !== null && role.teamId === historical.teamId)),
    );
  });
};
/** 本公司里当前用户不管的项目：从那里要人得向公司管理员申请。 */
const demoTransferSources = (
  state: DemoState,
  userId: string,
  projectId: string,
): readonly { readonly id: string; readonly name: string }[] => {
  const target = state.projects.find((row) => row.id === projectId);
  return state.projects
    .filter(
      (row) =>
        row.id !== projectId &&
        row.companyId === target?.companyId &&
        !canManageDemoProject(state, userId, row.id),
    )
    .map((row) => ({ id: row.id, name: row.name }));
};
/** 公司管理员看、同意或不同意调人申请；同意时走演示版的人员复用。 */
const demoReviewTransfer = (
  state: DemoState,
  userId: string,
  companyId: string,
  requestId: string | undefined,
  decision: string | undefined,
  status: string | undefined,
  projectId?: string,
): DemoResponse => {
  const all = (state.transfers ?? []).filter((row) => row.companyId === companyId);
  if (requestId === undefined)
    return response(state, {
      items: (status === "DONE" ? all.filter((row) => row.status !== "PENDING") : all.filter((row) => row.status === "PENDING"))
        .filter((row) => projectId === undefined || row.sourceProjectId === projectId || row.targetProjectId === projectId),
      nextCursor: null,
    });
  const request = all.find((row) => row.id === requestId);
  if (!request) throw new ApiError(404, "TRANSFER_REQUEST_NOT_FOUND", { message: "TRANSFER_REQUEST_NOT_FOUND" });
  if (request.status !== "PENDING") throw new ApiError(409, "TRANSFER_REQUEST_NOT_PENDING", { message: "TRANSFER_REQUEST_NOT_PENDING" });
  const reviewed = {
    reviewedAt: new Date().toISOString(),
    reviewedByName: state.accountProfiles?.[userId]?.realName ?? "公司管理员",
  };
  let next: DemoState = state;
  let createdMemberId: string | null = null;
  if (decision === "approve") {
    const source = state.people.find((row) => row.memberId === request.sourceMemberId && row.projectId === request.sourceProjectId);
    if (!source) throw new ApiError(404, "来源人员不存在。", {});
    const added = routeDemo(state, userId, `/management/projects/${request.targetProjectId}/reused-participants`, {
      method: "POST",
      data: {
        additionalRoles: request.additionalRoles,
        sourceProjectId: request.sourceProjectId,
        sourceMemberId: request.sourceMemberId,
        participantType: request.participantType,
        expectedSourceUpdatedAt: source.updatedAt,
        expectedProfileUpdatedAt: source.profileUpdatedAt,
        projectRoleLabel: request.projectRoleLabel,
        teamId: request.teamId,
        requiresAttendance: request.requiresAttendance,
        enteredAt: request.enteredAt,
      },
    });
    next = added.state;
    createdMemberId = (added.data as { readonly memberId: string }).memberId;
    // 调走（Q11）：原项目在进场前一天办退场；兼任不动原项目。
    if (request.mode === "MOVE" && source.status !== "EXITED") {
      const dayBefore = new Date(Date.parse(request.enteredAt) - 86_400_000).toISOString();
      const exitedAt = dayBefore < source.enteredAt ? source.enteredAt : dayBefore;
      next = {
        ...next,
        people: next.people.map((row) =>
          row.projectId === source.projectId && row.memberId === source.memberId
            ? { ...row, status: "EXITED" as const, exitedAt, updatedAt: new Date().toISOString() }
            : row,
        ),
        teams: next.teams.map((team) =>
          team.projectId === source.projectId && team.leader?.memberId === source.memberId ? { ...team, leader: null } : team,
        ),
      };
    }
  } else if (decision !== "reject") throw new ApiError(405, "调人申请不支持此操作。", {});
  const updated: DemoTransfer = {
    ...request,
    ...reviewed,
    createdMemberId,
    status: decision === "approve" ? "APPROVED" : "REJECTED",
  };
  return response(
    { ...next, transfers: (next.transfers ?? []).map((row) => (row.id === request.id ? updated : row)) },
    updated,
  );
};
/** 管理员看工人的用工登记原文并标记核实（与服务端同口径）。 */
const demoMemberRegistration = (
  state: DemoState,
  userId: string,
  projectId: string,
  memberId: string,
  action: string | undefined,
  method: string,
  data: unknown,
): DemoResponse => {
  const person = state.people.find((row) => row.projectId === projectId && row.memberId === memberId);
  if (!person) throw new ApiError(404, "成员不存在。", { memberId });
  if (person.participantType !== "WORKER") throw new ApiError(400, "管理人员没有用工登记。", { memberId });
  const registration = state.workerRegistrations?.[person.profileId] ?? null;
  const read = (current: DemoState): unknown => {
    const review = current.registrationReviews?.[person.profileId];
    return {
      displayName: person.displayName,
      memberId,
      phone: person.phone,
      registration,
      submittedAt: registration === null ? null : (review?.submittedAt ?? person.updatedAt),
      verification: {
        status: review?.status ?? "PENDING",
        verifiedAt: review?.verifiedAt ?? null,
        verifiedByName: review?.verifiedByName ?? null,
        version: review?.version ?? 0,
      },
    };
  };
  if (method === "GET" && action === undefined) return response(state, read(state));
  if (method !== "POST" || action !== "verification") throw new ApiError(405, "用工资料接口不支持此操作。", { memberId });
  const body = data as { readonly status?: unknown; readonly expectedVersion?: unknown };
  if ((body.status !== "VERIFIED" && body.status !== "NEEDS_UPDATE") || typeof body.expectedVersion !== "number")
    throw new ApiError(400, "INVALID_REGISTRATION_VERIFICATION_REQUEST", {});
  const me = demoMe(state, userId);
  if (me.profile.id === person.profileId) throw new ApiError(403, "不能核实自己的用工资料。", {});
  if (registration === null) throw new ApiError(409, "他还没填用工登记，不能核实。", {});
  const review = state.registrationReviews?.[person.profileId];
  if ((review?.version ?? 0) !== body.expectedVersion) throw new ApiError(409, "资料刚有变化，请重新打开再核实。", {});
  const next: DemoState = {
    ...state,
    registrationReviews: {
      ...state.registrationReviews,
      [person.profileId]: {
        status: body.status,
        submittedAt: review?.submittedAt ?? person.updatedAt,
        verifiedAt: new Date().toISOString(),
        verifiedByName: state.accountProfiles?.[userId]?.realName ?? "管理员",
        version: (review?.version ?? 0) + 1,
      },
    },
  };
  return response(next, read(next));
};
/** 和服务端一样：只有公司管理员及以上能任免、调整项目管理员。 */
const assertDemoPeerGrant = (
  state: DemoState,
  userId: string,
  original: Pick<
    ManagedParticipant,
    "participantType" | "projectRoleLabel" | "teamId" | "additionalRoles" | "status"
  > | null,
  next: Pick<
    PersonForm,
    "participantType" | "projectRoleLabel" | "teamId" | "additionalRoles" | "status"
  >,
): void => {
  const holdsAdmin = (
    person: Pick<
      PersonForm,
      "participantType" | "projectRoleLabel" | "teamId" | "additionalRoles" | "status"
    > | null,
  ): boolean =>
    person !== null &&
    person.status === "ACTIVE" &&
    memberRoleAssignments(person).some((role) => role.roleCode === "PROJECT_ADMIN");
  const higher = demoMe(state, userId).roles.assignments.some(
    (assignment) =>
      assignment.roleCode === "COMPANY_ADMIN" ||
      assignment.roleCode === "SYSTEM_ADMIN",
  );
  if (!higher && (holdsAdmin(original) || holdsAdmin(next)) && !(holdsAdmin(original) && holdsAdmin(next)))
    throw new ApiError(403, "项目管理员的任免和调整要由公司管理员办理。", {
      message: "MANAGEMENT_ASSIGNMENT_REQUIRES_HIGHER_ROLE",
    });
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
    parts[0] === "safety-credit" ||
    (parts[0] === "attendance" && parts[1] === "planning") ||
    role === "SYSTEM_ADMIN" ||
    parts[0] === "auth" ||
    parts[0] === "account" ||
    (parts[0] === "team-work" && parts[1] === "me") ||
    parts[0] === "me" || path === "/management/my-role-scopes" ||
    (parts[0] === "face-profiles" && parts[1] === "me") ||
    parts[0] === "app"
  )
    return;
  if (parts[0] === "makeups" && ["pending", "reviewed"].includes(parts[1])) return;
  const assignedScope = me.roles.assignments[0]?.scope.scopeId;
  const managedCompany = state.companies.find(
    (row) => row.id === assignedScope,
  );
  const managesProject = (projectId: string): boolean =>
    canManageDemoProject(state, userId, projectId);
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
      me.roles.assignments.some((assignment) => assignment.roleCode === "TEAM_LEADER" && assignment.scope.scopeId === parts[2]) ||
      (team && managesProject(team.projectId))
    )
      return;
  }
  if (
    (parts[0] === "attendance" && ["records", "safety", "safety-confirmations", "tasks", "overtime"].includes(parts[3])) ||
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
      (me.roles.assignments.some((assignment) => assignment.roleCode === "TEAM_LEADER" && person.teamId === assignment.scope.scopeId) ||
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
/**
 * 项目管理员首页的概览：用演示版自己的日报、收件箱、违规看板和底照列表算，
 * 所以数字和点进去的列表一定相同。
 */
const demoProjectOverview = (
  state: DemoState,
  userId: string,
  projectId: string,
  date: string,
): unknown => {
  const read = <T,>(path: string): T =>
    routeDemo(state, userId, path, { method: "GET" }).data as T;
  const daily = read<{
    readonly totals: {
      readonly scheduledDays: number;
      readonly actualAttendedDays: number;
      readonly missingPunchCount: number;
      readonly workedMinutes: number;
    };
  }>(`/reports/projects/${projectId}/daily?date=${date}`);
  const inbox = read<{ readonly items: readonly unknown[] }>(
    `/makeups/pending?projectId=${encodeURIComponent(projectId)}`,
  );
  const board = read<{
    readonly violations: readonly {
      readonly status: string;
      readonly appeals: readonly { readonly status: string }[];
    }[];
  }>(`/safety-credit/projects/${projectId}`);
  const faces = read<readonly { readonly status: string }[]>(
    `/face-profiles/projects/${projectId}`,
  );
  return {
    attendance: {
      expected: daily.totals.scheduledDays,
      missing: daily.totals.missingPunchCount,
      present: daily.totals.actualAttendedDays,
      workedMinutes: daily.totals.workedMinutes,
    },
    date,
    projectId,
    todos: {
      appealPending: board.violations.filter((row) =>
        row.appeals.some((appeal) => appeal.status === "PENDING"),
      ).length,
      facePending: faces.filter((row) => row.status === "PENDING").length,
      makeupPending: inbox.items.length,
      violationPending: board.violations.filter(
        (row) => row.status === "PENDING",
      ).length,
    },
  };
};
/** 公司首页的概览：每个项目用演示版的项目概览算，补卡、调人用演示收件箱，和点进去的列表同口径。 */
const demoCompanyOverview = (
  state: DemoState,
  userId: string,
  companyId: string,
  date: string,
): unknown => {
  const projects = state.projects.filter((row) => row.companyId === companyId);
  const ids = new Set(projects.map((row) => row.id));
  const per = projects.map((project) => {
    const overview = demoProjectOverview(state, userId, project.id, date) as {
      readonly attendance: { readonly expected: number; readonly missing: number; readonly present: number; readonly workedMinutes: number };
      readonly todos: { readonly facePending: number; readonly violationPending: number };
    };
    // 和真实接口一样：只有进行中的项目算应到，其余项目这一行记 0、不进合计。
    return {
      project,
      overview:
        project.status === "ACTIVE"
          ? overview
          : { ...overview, attendance: { expected: 0, missing: 0, present: 0, workedMinutes: 0 } },
    };
  });
  const inbox = (path: string): readonly { readonly projectId: string }[] =>
    (routeDemo(state, userId, path, { method: "GET" }).data as { readonly items: readonly { readonly projectId: string }[] }).items
      .filter((row) => ids.has(row.projectId));
  const sum = (key: "expected" | "missing" | "present" | "workedMinutes"): number =>
    per.reduce((total, row) => total + row.overview.attendance[key], 0);
  return {
    attendance: { expected: sum("expected"), missing: sum("missing"), present: sum("present"), workedMinutes: sum("workedMinutes") },
    companyId,
    date,
    projects: per.map(({ project, overview }) => ({
      attendance: { expected: overview.attendance.expected, missing: overview.attendance.missing, present: overview.attendance.present },
      name: project.name,
      projectId: project.id,
      status: project.status,
      todos: { facePending: overview.todos.facePending, violationPending: overview.todos.violationPending },
    })),
    todos: {
      makeupOnlyYou: inbox("/makeups/pending?onlyMine=true").length,
      makeupPending: inbox("/makeups/pending").length,
      transferPending: (state.transfers ?? []).filter((row) => row.companyId === companyId && row.status === "PENDING").length,
    },
  };
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
  if (parts[0] === "safety-credit") return demoSafetyCreditRequest(state, userId, parts, options);
  if (parts[0] === "worktime" && parts[1] === "projects" && parts[2]) return demoWorktimeRequest(state, userId, parts[2], options);
  if (parts[0] === "team-work") return demoTeamWorkRequest(state, userId, parts, query.date, query.cursor, query.search, options);
  if (parts[0] === "attendance" && parts[1] === "planning")
    return demoPlanRequest(state, userId, parts, method, options.data);
  if (parts[0] === "me" && parts[3] === "attendance-plan")
    return response(
      state,
      effectiveDemoPlan(
        state,
        requirePerson(state, userId, parts[2]),
        query.date,
      ),
    );
  if (path === "/app/settings") return response(state, state.settings);
  if (path === "/auth/me") return response(state, me);
  if (path === "/account/worker-registration") {
    const profileId: string | null = me.profile.id;
    if (profileId === null || me.profile.type !== "WORKER") throw new ApiError(403, "请先绑定本人工人档案。", { path });
    if (method === "GET") return response(state, state.workerRegistrations?.[profileId] ?? emptyWorkerRegistration());
    if (method !== "PUT") throw new ApiError(405, "用工资料接口不支持此操作。", { path });
    const value: WorkerRegistration = normalizeWorkerRegistration(options.data as WorkerRegistration);
    const error: string | null = workerRegistrationError(value);
    if (error !== null) throw new ApiError(400, error, { path });
    const previous: WorkerRegistration | undefined = state.workerRegistrations?.[profileId];
    if (previous && previous.idNumber !== value.idNumber) throw new ApiError(409, "身份证号与已有档案不一致，请联系管理员核实。", { path });
    if (Object.entries(state.workerRegistrations ?? {}).some(([id, item]) => id !== profileId && item.idNumber === value.idNumber)) throw new ApiError(409, "该身份证号已有人员档案。", { path });
    // 资料改了要重新核实，和服务端一样回到待核实。
    const review = state.registrationReviews?.[profileId];
    const updated: DemoState = {
      ...state,
      workerRegistrations: { ...state.workerRegistrations, [profileId]: value },
      registrationReviews: {
        ...state.registrationReviews,
        [profileId]: { status: "PENDING", submittedAt: new Date().toISOString(), verifiedAt: null, verifiedByName: null, version: (review?.version ?? 0) + 1 },
      },
    };
    return routeDemo(updated, userId, "/account/profile", { method: "GET" });
  }
  if (path === "/management/my-role-scopes") return response(state, me.roles.assignments.map((assignment): WorkRoleScope => {
    const scopeType = assignment.scope.scopeType as WorkRoleScope["scopeType"];
    const scopeId = assignment.scope.scopeId;
    const team = state.teams.find((row) => row.id === scopeId);
    const project = state.projects.find((row) => row.id === (scopeType === "TEAM" ? team?.projectId : scopeId));
    const company = state.companies.find((row) => row.id === scopeId);
    const scopeName = scopeType === "GLOBAL" ? "平台" : scopeType === "COMPANY" ? company?.name : scopeType === "PROJECT" ? project?.name : team && project ? `${project.name} / ${team.name}` : undefined;
    if (scopeName === undefined) throw new ApiError(404, "工作范围不存在。", { scopeId });
    return { roleCode: assignment.roleCode, scopeType, scopeId, scopeName, projectId: project?.id ?? null };
  }));
  if (path === "/account/profile" || path === "/account/avatar") {
    const person = state.people.find((row) => row.profileId === me.profile.id);
    const profile: AccountProfile = {
      workerRegistration: me.profile.type !== "WORKER" || me.profile.id === null ? "NOT_APPLICABLE" : state.workerRegistrations?.[me.profile.id] ? "COMPLETE" : "REQUIRED",
      realName: state.accountProfiles?.[userId]?.realName ?? null,
      phone: state.accountProfiles?.[userId]?.phone ?? null,
      nickname: state.accountProfiles?.[userId]?.nickname ?? null,
      avatarDataUrl: state.accountProfiles?.[userId]?.avatarDataUrl ?? null,
      isBound: me.user.isBound,
      phoneMasked: state.accountProfiles?.[userId]?.phone
        ? state.accountProfiles[userId].phone!.replace(
            /^(\d{3})\d+(\d{4})$/,
            "$1****$2",
          )
        : null,
    };
    if (method === "GET" && path === "/account/profile")
      return response(state, profile);
    if (method === "PUT" && path === "/account/profile") {
      const { nickname, realName, phone } = options.data as {
        readonly nickname?: string;
        readonly realName: string;
        readonly phone: string;
      };
      if (
        nickname !== undefined &&
        (typeof nickname !== "string" ||
          nickname.trim().length === 0 ||
          nickname.trim().length > 32)
      ) {
        throw new ApiError(400, "昵称须为 1 至 32 个字符。", { path });
      }
      if (
        typeof realName !== "string" ||
        !realName.trim() ||
        realName.trim().length > 30 ||
        !/^[\p{L}\p{M} ·•・.'’-]+$/u.test(realName.trim())
      )
        throw new ApiError(400, "请填写真实姓名，长度为 1 至 30 个字符。", {
          path,
        });
      if (typeof phone !== "string" || !/^1[3-9]\d{9}$/.test(phone.trim()))
        throw new ApiError(400, "请填写有效的 11 位手机号。", { path });
      if (
        person &&
        (person.displayName?.replace(/（演示）$/, "") !== realName.trim() ||
          person.phone !== phone.trim())
      )
        throw new ApiError(
          403,
          "姓名或手机号与人员档案不一致，请核对后重试。",
          { path },
        );
      const updated: AccountProfile = {
        ...profile,
        nickname: nickname === undefined ? profile.nickname : nickname.trim(),
        realName: realName.trim(),
        phone: phone.trim(),
        phoneMasked: phone.trim().replace(/^(\d{3})\d+(\d{4})$/, "$1****$2"),
      };
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
    const account = state.accountProfiles?.[userId];
    if (
      !account?.realName?.trim() ||
      !/^1[3-9]\d{9}$/.test(account.phone ?? "")
    )
      throw new ApiError(403, "请先完善真实姓名和手机号。", { path });
    const target = state.people.find(
      (person) => person.profileId === invitation.profileId,
    );
    if (
      !target ||
      account.realName !== target.displayName?.replace(/（演示）$/, "") ||
      account.phone !== target.phone
    )
      throw new ApiError(403, "姓名或手机号与人员档案不一致，请核对后重试。", {
        path,
      });
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
  if (parts[0] === "me" && parts[1] === "projects" && parts.length === 3 && method === "GET")
    return response(state, demoMyProject(state, userId, parts[2]));
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
          taskAttendanceOnly: row.taskAttendanceOnly === true,
          teamId: row.teamId,
          teamName: row.teamName,
        })),
    );
  if (pathname === "/me/attendance-days") {
    const dates = Array.from(
      {
        length: Math.min(
          93,
          Math.floor(
            (Date.parse(query.to) - Date.parse(query.from)) / 86400_000,
          ) + 1,
        ),
      },
      (_, i) =>
        new Date(Date.parse(query.from) + i * 86400_000)
          .toISOString()
          .slice(0, 10),
    );
    return response(
      state,
      state.people
        .filter((person) => person.profileId === me.profile.id)
        .flatMap((person) =>
          dates
            .filter(
              (date) =>
                date <= chinaToday() &&
                demoMemberEligible(demoMemberOn(state, person, date), date),
            )
            .map((date) => ({
              ...dailyPerson(state, person, date),
              projectId: person.projectId,
              attendanceDate: date,
            })),
        ),
    );
  }
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
    const date = chinaToday();
    const plan = effectiveDemoPlan(state, person, date);
    const enabled =
      project.status === "ACTIVE" &&
      person.status === "ACTIVE" &&
      demoMemberEligible(demoMemberOn(state, person, date), date);
    const summary = demoDaySummary(state, person, date);
    return response(state, {
      attendanceDate: date,
      configured: true,
      geofence: {
        locationAccuracyLimitM: null,
        centerLatitude: project.centerLatitude,
        centerLongitude: project.centerLongitude,
        radiusM: project.geofenceRadiusM,
      },
      isWorkday: enabled && plan.isWorkday,
      shiftName: enabled ? plan.name : "项目或成员已停用考勤",
      result: summary,
      points:
        enabled && plan.isWorkday
          ? plan.points.map((point) => ({
              pointCode: point.code,
              label: point.label,
              kind: point.kind,
              scheduledTime: point.time,
              graceMins: point.graceMins,
              record:
                summary.selectedRecords[point.code] === undefined
                  ? null
                  : {
                      occurredAt:
                        summary.selectedRecords[
                          point.code
                        ]!.occurredAt.toISOString(),
                      status: "VALID",
                      abnormalReason: null,
                    },
            }))
          : [],
    });
  }

  if (
    parts[0] === "management" &&
    parts[1] === "projects" &&
    parts[3] === "overview" &&
    method === "GET"
  )
    return response(
      state,
      demoProjectOverview(state, userId, parts[2], query.date ?? chinaToday()),
    );
  if (
    parts[0] === "management" &&
    parts[1] === "companies" &&
    parts[3] === "overview" &&
    method === "GET"
  )
    return response(
      state,
      demoCompanyOverview(state, userId, parts[2], query.date ?? chinaToday()),
    );
  if (parts[0] === "management" || parts[0] === "bindings") {
    const scope = parts[1];
    const scopeId = parts[2];
    const resource = parts[3];
    if (resource === "audit-logs" && method === "GET") {
      const projectIds =
        scope === "companies"
          ? state.projects
              .filter((row) => row.companyId === scopeId)
              .map((row) => row.id)
          : [scopeId];
      return response(
        state,
        demoAuditLog(
          state,
          projectIds,
          (query.type as AuditCategory | undefined) ?? null,
          query.cursor ?? null,
          scope === "companies" ? scopeId : null,
        ),
      );
    }
    if (scope === "companies") {
      if (resource === "attendance-defaults")
        return method === "GET"
          ? response(state, demoCompanyDefaults(state, scopeId))
          : saveDemoCompanyDefaults(state, userId, scopeId, options.data as Parameters<typeof saveDemoCompanyDefaults>[3]);
      if (resource === "profile")
        return method === "GET"
          ? response(state, demoCompanyProfile(state, scopeId))
          : updateDemoCompanyProfile(state, scopeId, (options.data ?? {}) as Record<string, unknown>);
      if (resource === "project-health" && method === "GET")
        return response(state, {
          companyId: scopeId,
          projects: state.projects
            .filter((row) => row.companyId === scopeId)
            .map((project) => {
              const overview = demoProjectOverview(state, userId, project.id, chinaToday()) as {
                readonly todos: { readonly appealPending: number; readonly facePending: number; readonly violationPending: number };
              };
              const board = routeDemo(state, userId, `/safety-credit/projects/${project.id}`, { method: "GET" }).data as {
                readonly workers?: readonly { readonly score: number }[];
              };
              return {
                appealPending: overview.todos.appealPending,
                facePending: overview.todos.facePending,
                lowCredit: (board.workers ?? []).filter((row) => row.score < 60).length,
                name: project.name,
                projectId: project.id,
                registrationPending: demoCompanyPeoplePage(state, scopeId, {
                  page: "1", pageSize: "100", participantType: "WORKER", projectId: project.id, registrationStatus: "PENDING", status: "ACTIVE",
                }).total,
                status: project.status,
                violationPending: overview.todos.violationPending,
              };
            }),
        });
      if (resource === "people-page" && method === "GET")
        return response(state, demoCompanyPeoplePage(state, scopeId, query));
      if (resource === "project-admins" && method === "GET")
        return response(state, demoProjectAdmins(state, scopeId));
      if (resource === "people" && parts[4] && parts[5]) {
        if (method === "GET" && parts[6] === undefined)
          return response(state, demoCompanyPerson(state, scopeId, parts[4], parts[5]));
        if (method === "POST" && parts[6] === "offboard")
          return demoOffboard(state, userId, scopeId, parts[4], parts[5], (options.data ?? {}) as { mode?: unknown; effectiveDate?: unknown });
      }
      if (resource === "project-manager-candidates") {
        const search = (query.search ?? "").trim().toLowerCase();
        return response(state, demoProjectManagers(state, scopeId)
          .filter((person) => `${person.name} ${person.phone}`.toLowerCase().includes(search))
          .slice(0, 50));
      }
      if (resource === "projects") {
        if (method === "GET")
          return response(
            state,
            state.projects
              .filter((row) => row.companyId === scopeId)
              .map((row) => ({
                ...row,
                activeMembers: state.people.filter((person) => person.projectId === row.id && person.status === "ACTIVE").length,
                adminNames: state.people
                  .filter((person) => person.projectId === row.id && person.status === "ACTIVE" && person.projectRoleLabel === "PROJECT_ADMIN")
                  .map((person) => person.displayName ?? "姓名待补录"),
              })),
          );
        const body = options.data as CreateProjectBody;
        const newManagers = body.newManagers ?? [];
        if (!Array.isArray(body.managerProfileIds) || body.managerProfileIds.length + newManagers.length === 0 ||
          body.managerProfileIds.length > 20 || newManagers.length > 3 || new Set(body.managerProfileIds).size !== body.managerProfileIds.length)
          throw new ApiError(400, "请至少选择一名项目管理员，且不能重复。", {});
        const companyPeople = state.people.filter((person) => state.projects.some((project) => project.id === person.projectId && project.companyId === scopeId));
        for (const entry of newManagers) {
          const existing = companyPeople.find((person) => person.phone === entry.phone);
          if (existing) throw new ApiError(409, "这个手机号在本公司已有档案，请在管理员列表里直接选他。", { message: "PROJECT_MANAGER_PHONE_EXISTS", profileId: existing.profileId });
        }
        const managers = demoProjectManagers(state, scopeId).filter((person) => body.managerProfileIds.includes(person.profileId));
        if (managers.length !== body.managerProfileIds.length)
          throw new ApiError(400, "所选管理员已停用或不属于本公司，请重新选择。", {});
        const { managerProfileIds, newManagers: _newManagers, applyCompanyDefaults, ...fields } = body;
        const project: ManagedProject = {
          ...fields,
          code: null,
          contactName: null,
          contactPhone: null,
          remark: null,
          updatedAt: new Date().toISOString(),
          id: demoId("project"),
          companyId: scopeId,
        };
        const now = new Date().toISOString();
        const people: readonly ManagedParticipant[] = managers.map((manager) => ({
          memberId: demoId("member"), profileId: manager.profileId, projectId: project.id,
          displayName: manager.name, phone: manager.phone, participantType: state.people.find((person) => person.profileId === manager.profileId)?.participantType ?? "MANAGER",
          projectRoleLabel: "PROJECT_ADMIN", teamId: null, teamName: null, requiresAttendance: true,
          status: "ACTIVE", workType: "施工管理", enteredAt: now, exitedAt: null,
          updatedAt: now, profileUpdatedAt: state.people.find((person) => person.profileId === manager.profileId)?.profileUpdatedAt ?? now,
          nameStatus: "AVAILABLE"
        }));
        // 新录入的管理员：新档案，还没绑定微信。
        const created: readonly ManagedParticipant[] = newManagers.map((entry) => ({
          memberId: demoId("member"), profileId: demoId("profile"), projectId: project.id,
          displayName: entry.name, phone: entry.phone, participantType: "MANAGER",
          projectRoleLabel: "PROJECT_ADMIN", teamId: null, teamName: null, requiresAttendance: true,
          status: "ACTIVE", workType: "施工管理", enteredAt: now, exitedAt: null,
          updatedAt: now, profileUpdatedAt: now, nameStatus: "AVAILABLE"
        }));
        const applied = applyCompanyDefaults === false
          ? { state, version: null }
          : applyDemoCompanyDefaults(state, userId, scopeId, project.id, project.plannedStartDate);
        return response(
          { ...applied.state, projects: [...state.projects, project], people: [...state.people, ...people, ...created] },
          { ...project, appliedDefaultsVersion: applied.version },
        );
      }
      if (resource === "transfer-requests")
        return demoReviewTransfer(state, userId, scopeId, parts[4], parts[5], query.status, query.projectId);
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
      if (resource === "reuse-projects")
        return response(
          state,
          state.projects
            .filter(
              (row) =>
                row.id !== scopeId &&
                row.companyId === project.companyId &&
                canManageDemoProject(state, userId, row.id),
            )
            .map((row) => ({ id: row.id, name: row.name })),
        );
      if (resource === "reused-participants") {
        const body = options.data as ReusePersonForm;
        const sourceProject = state.projects.find(
          (row) => row.id === body.sourceProjectId,
        );
        if (
          !sourceProject ||
          sourceProject.id === scopeId ||
          sourceProject.companyId !== project.companyId ||
          !canManageDemoProject(state, userId, sourceProject.id)
        )
          throw new ApiError(403, "需要同一公司来源项目的管理权限。", {});
        const source = state.people.find(
          (row) =>
            row.projectId === body.sourceProjectId &&
            row.memberId === body.sourceMemberId &&
            row.participantType === body.participantType,
        );
        if (!source) throw new ApiError(404, "来源人员不存在。", {});
        if (
          source.updatedAt !== body.expectedSourceUpdatedAt ||
          source.profileUpdatedAt !== body.expectedProfileUpdatedAt
        )
          throw new ApiError(409, "来源资料已更新，请重新选择。", {});
        if (
          state.people.some(
            (row) =>
              row.projectId === scopeId &&
              (row.profileId === source.profileId ||
                row.phone === source.phone),
          )
        )
          throw new ApiError(
            409,
            "此人员已在本项目，请在人员列表恢复或编辑。",
            {},
          );
        const team =
          body.teamId === null
            ? null
            : state.teams.find(
                (row) => row.id === body.teamId && row.projectId === scopeId,
              );
        if (body.teamId !== null && !team)
          throw new ApiError(400, "班组不属于目标项目。", {});
        validateDemoRoles(state, scopeId, body);
        assertDemoPeerGrant(state, userId, null, {
          ...body,
          participantType: source.participantType,
          status: "ACTIVE",
        });
        const person: ManagedParticipant = {
          ...source,
          additionalRoles: body.additionalRoles ?? [],
          memberId: demoId("member"),
          projectId: scopeId,
          projectRoleLabel: body.projectRoleLabel,
          teamId: body.teamId,
          teamName: team?.name ?? null,
          enteredAt: body.enteredAt,
          exitedAt: null,
          requiresAttendance: body.requiresAttendance,
          status: "ACTIVE",
          updatedAt: new Date().toISOString(),
        };
        return response(
          { ...state, people: [...state.people, person] },
          person,
        );
      }
      if (resource === "transfer-sources")
        return response(state, demoTransferSources(state, userId, scopeId));
      if (resource === "transfer-candidates") {
        if (!demoTransferSources(state, userId, scopeId).some((row) => row.id === query.sourceProjectId))
          throw new ApiError(403, "TRANSFER_SOURCE_NOT_ALLOWED", { message: "TRANSFER_SOURCE_NOT_ALLOWED" });
        const search = (query.search ?? "").trim();
        const rows = state.people.filter(
          (person) =>
            person.projectId === query.sourceProjectId &&
            (!search || (person.displayName ?? "").startsWith(search) || person.phone.includes(search)),
        );
        const pageNumber = Number(query.page ?? 1);
        const size = Number(query.pageSize ?? 50);
        return response(state, {
          items: rows
            .slice((pageNumber - 1) * size, pageNumber * size)
            .map((person) => ({ ...person, phone: person.phone.replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2") })),
          page: pageNumber,
          pageSize: size,
          total: rows.length,
        });
      }
      if (resource === "transfer-requests") {
        if (method === "GET")
          return response(state, (state.transfers ?? []).filter((row) => row.targetProjectId === scopeId).slice().reverse());
        const body = options.data as TransferRequestForm;
        if (!demoTransferSources(state, userId, scopeId).some((row) => row.id === body.sourceProjectId))
          throw new ApiError(403, "TRANSFER_SOURCE_NOT_ALLOWED", { message: "TRANSFER_SOURCE_NOT_ALLOWED" });
        const source = state.people.find((row) => row.projectId === body.sourceProjectId && row.memberId === body.sourceMemberId);
        if (!source) throw new ApiError(404, "来源人员不存在。", {});
        assertDemoPeerGrant(state, userId, null, { ...body, participantType: source.participantType, status: "ACTIVE" });
        if (state.people.some((row) => row.projectId === scopeId && row.profileId === source.profileId))
          throw new ApiError(409, "此人员已在本项目，请在人员列表恢复或编辑。", {});
        if ((state.transfers ?? []).some((row) => row.targetProjectId === scopeId && row.status === "PENDING" && row.sourceMemberId === source.memberId))
          throw new ApiError(409, "TRANSFER_REQUEST_ALREADY_PENDING", { message: "TRANSFER_REQUEST_ALREADY_PENDING" });
        const transfer: DemoTransfer = {
          additionalRoles: body.additionalRoles ?? [],
          companyId: project.companyId,
          createdAt: new Date().toISOString(),
          createdMemberId: null,
          displayName: source.displayName,
          enteredAt: body.enteredAt,
          id: demoId("transfer"),
          mode: body.mode === "CONCURRENT" ? "CONCURRENT" : "MOVE",
          participantType: source.participantType,
          projectRoleLabel: body.projectRoleLabel,
          requestedByName: state.accountProfiles?.[userId]?.realName ?? "项目管理员",
          requestedByUserId: userId,
          requiresAttendance: body.requiresAttendance,
          reviewedAt: null,
          reviewedByName: null,
          reviewReason: null,
          sourceMemberId: source.memberId,
          sourceProjectId: body.sourceProjectId,
          sourceProjectName: state.projects.find((row) => row.id === body.sourceProjectId)?.name ?? "",
          status: "PENDING",
          targetProjectId: scopeId,
          targetProjectName: project.name,
          teamId: body.teamId,
          teamName: state.teams.find((row) => row.id === body.teamId)?.name ?? null,
          workType: source.workType ?? null,
        };
        return response({ ...state, transfers: [...(state.transfers ?? []), transfer] }, transfer);
      }
      if (resource === "managed-teams")
        return response(
          state,
          state.teams
            .filter((team) => team.projectId === scopeId)
            .map((team) => managedDemoTeam(state, team)),
        );
      if (!resource) {
        if (method === "GET") return response(state, project);
        const body = options.data as ManagedProject & {
          readonly expectedUpdatedAt: string;
        };
        if (body.expectedUpdatedAt !== project.updatedAt)
          throw new ApiError(409, "项目资料已更新，请重新进入。", {});
        // Q5：项目状态（暂停、完工）只能由公司管理员改。
        if (
          body.status !== project.status &&
          !me.roles.assignments.some((row) => row.roleCode === "COMPANY_ADMIN" || row.roleCode === "SYSTEM_ADMIN")
        )
          throw new ApiError(403, "项目暂停、完工要由公司管理员办理。", { message: "PROJECT_STATUS_REQUIRES_COMPANY_ADMIN" });
        const updated: ManagedProject = {
          ...body,
          updatedAt: new Date(
            Math.max(Date.now(), new Date(project.updatedAt).getTime() + 1),
          ).toISOString(),
        };
        return response(
          {
            ...state,
            projects: state.projects.map((row) =>
              row.id === scopeId ? updated : row,
            ),
          },
          updated,
        );
      }
      if (resource === "participant-page") {
        const parameters = new Map<string, string>(
          (path.split("?")[1] ?? "")
            .split("&")
            .map((pair): [string, string] => {
              const separator = pair.indexOf("=");
              return [
                pair.slice(0, separator),
                decodeURIComponent(pair.slice(separator + 1)),
              ];
            }),
        );
        const page = Number(parameters.get("page"));
        const pageSize = Number(parameters.get("pageSize"));
        const search = (parameters.get("search") ?? "").trim();
        const participantType = parameters.get("participantType");
        const permissionRole = parameters.get("permissionRole");
        if (
          permissionRole !== undefined &&
          !["WORKER", "TEAM_LEADER", "PROJECT_ADMIN"].includes(permissionRole)
        )
          throw new ApiError(400, "项目人员权限筛选无效。", { path });
        const teamId = parameters.get("teamId");
        const status = parameters.get("status");
        const rows = state.people.filter(
          (person) =>
            person.projectId === scopeId &&
            (!participantType || person.participantType === participantType) &&
            (!permissionRole ||
              memberRoleAssignments(person).some((role) => role.roleCode === permissionRole)) &&
            (!teamId || belongsToDemoTeam(person, teamId)) &&
            (!status || person.status === status) &&
            (!search ||
              (person.displayName ?? "").startsWith(search) ||
              `${person.phone} ${person.workType} ${person.projectRoleLabel} ${person.teamName ?? ""}`.includes(
                search,
              )),
        );
        const ordered = [
          ...rows.filter((person) => person.participantType === "WORKER"),
          ...rows.filter((person) => person.participantType === "MANAGER"),
        ];
        return response(state, {
          items: ordered.slice((page - 1) * pageSize, page * pageSize),
          page,
          pageSize,
          total: rows.length,
        });
      }
      if (resource === "participants" && parts[5] === "registration")
        return demoMemberRegistration(state, userId, scopeId, parts[4], parts[6], method, options.data);
      if (resource === "participants") {
        if (method === "GET") {
          if (parts[4]) {
            const person = state.people.find(
              (row) => row.projectId === scopeId && row.memberId === parts[4],
            );
            if (!person)
              throw new ApiError(404, "成员不存在。", { memberId: parts[4] });
            return response(state, person);
          }
          return response(
            state,
            state.people.filter((row) => row.projectId === scopeId),
          );
        }
        const input = options.data as PersonForm;
        const original = state.people.find(
          (row) => row.memberId === parts[4] && row.projectId === scopeId,
        );
        const body: PersonForm = { ...input, additionalRoles: input.additionalRoles ?? original?.additionalRoles ?? [] };
        validateDemoRoles(state, scopeId, body);
        assertDemoPeerGrant(state, userId, original ?? null, body);
        const grantKeys = (person: Pick<PersonForm, "participantType" | "projectRoleLabel" | "teamId" | "additionalRoles">): string => memberRoleAssignments(person).map((role) => `${role.roleCode}:${role.teamId}`).sort().join("|");
        if (original && original.profileId === me.profile.id && (grantKeys(original) !== grantKeys(body) || original.status !== body.status)) throw new ApiError(409, "不能修改自己的管理权限，请由上级处理。", {});
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
        if (!body.workType || !body.enteredAt)
          throw new ApiError(400, "请填写工种和进场日期。", {});
        if (
          original &&
          (body.expectedUpdatedAt !== original.updatedAt ||
            body.expectedProfileUpdatedAt !== original.profileUpdatedAt)
        )
          throw new ApiError(409, "资料已更新，请重新进入。", {});
        const now = new Date(
          Math.max(
            Date.now(),
            original ? Date.parse(original.updatedAt) + 1 : 0,
            original ? Date.parse(original.profileUpdatedAt) + 1 : 0,
          ),
        ).toISOString();
        const profileChanged: boolean =
          !original ||
          original.displayName !== body.displayName ||
          original.phone !== body.phone ||
          original.workType !== body.workType;
        if (
          original &&
          profileChanged &&
          state.people.some(
            (row) =>
              row.profileId === original.profileId &&
              !canManageDemoProject(state, userId, row.projectId),
          )
        )
          throw new ApiError(403, "基础资料需要所有相关项目的管理权限。", {});
        const person: ManagedParticipant = {
          ...body,
          updatedAt: now,
          profileUpdatedAt: profileChanged ? now : original!.profileUpdatedAt,
          nameStatus: "AVAILABLE",
          projectId: scopeId,
          profileId: original?.profileId ?? demoId("profile"),
          memberId: original?.memberId ?? demoId("member"),
          teamName:
            state.teams.find((row) => row.id === body.teamId)?.name ?? null,
        };
        return response(
          {
            ...state,
            memberHistories: [
              ...(state.memberHistories ?? []),
              ...(original &&
              !(state.memberHistories ?? []).some(
                (h) => h.person.memberId === original.memberId,
              )
                ? [{ recordedAt: original.enteredAt, person: original }]
                : []),
              { recordedAt: now, person },
            ],
            people: [
              ...state.people
                .filter((row) => row.memberId !== person.memberId)
                .map((row) =>
                  profileChanged && row.profileId === person.profileId
                    ? {
                        ...row,
                        displayName: person.displayName,
                        workType: person.workType,
                        phone: person.phone,
                        profileUpdatedAt: person.profileUpdatedAt,
                      }
                    : row,
                ),
              person,
            ],
            teams: state.teams.map((team) =>
              team.projectId === scopeId &&
              team.leader?.memberId === person.memberId &&
              (person.status !== "ACTIVE" || !belongsToDemoTeam(person, team.id))
                ? {
                    ...team,
                    leader: null,
                    updatedAt: new Date(
                      Math.max(
                        Date.now(),
                        Date.parse(team.updatedAt ?? "1970-01-01") + 1,
                      ),
                    ).toISOString(),
                  }
                : team,
            ),
          },
          person,
        );
      }
      if (resource === "teams") {
        if (parts[4]) {
          const original = state.teams.find(
            (team) => team.id === parts[4] && team.projectId === scopeId,
          );
          if (!original) throw new ApiError(404, "班组不存在。", {});
          if (parts[5] === "leader-history")
            return response(
              state,
              (state.teamLeaderChanges ?? [])
                .filter((row) => row.teamId === original.id)
                .slice()
                .sort((a, b) => b.changedAt.localeCompare(a.changedAt))
                .map(({ teamId: _teamId, ...row }) => row),
            );
          if (method === "GET")
            return response(state, managedDemoTeam(state, original));
          const body = options.data as TeamForm;
          if (
            body.expectedUpdatedAt !==
            managedDemoTeam(state, original).updatedAt
          )
            throw new ApiError(409, "班组资料已更新，请重新进入。", {});
          if (
            state.teams.some(
              (team) =>
                team.projectId === scopeId &&
                team.id !== original.id &&
                team.name === body.name,
            )
          )
            throw new ApiError(409, "此项目已有同名班组。", {});
          if (
            body.leader &&
            !state.people.some(
              (person) =>
                person.projectId === scopeId &&
                belongsToDemoTeam(person, original.id) &&
                person.memberId === body.leader?.memberId &&
                person.participantType === body.leader.participantType &&
                person.status === "ACTIVE",
            )
          )
            throw new ApiError(400, "负责人必须是本班组在场成员。", {});
          const updated = {
            ...original,
            name: body.name,
            status: body.status,
            workType: body.workType,
            remark: body.remark,
            leader: body.leader,
            updatedAt: new Date(
              Math.max(Date.now(), Date.parse(body.expectedUpdatedAt) + 1),
            ).toISOString(),
          };
          const before = managedDemoTeam(state, original).leader;
          const afterName = body.leader
            ? (state.people.find(
                (person) =>
                  person.projectId === scopeId &&
                  person.memberId === body.leader?.memberId,
              )?.displayName ?? "姓名待补录")
            : null;
          const leaderChanged =
            (before?.memberId ?? null) !== (body.leader?.memberId ?? null);
          const next: DemoState = {
            ...state,
            teamLeaderChanges: leaderChanged
              ? [
                  ...(state.teamLeaderChanges ?? []),
                  {
                    id: demoId("leader-change"),
                    teamId: original.id,
                    changedAt: new Date().toISOString(),
                    reason: "TEAM_UPDATED",
                    previousLeaderName: before
                      ? (before.displayName ?? "姓名待补录")
                      : null,
                    leaderName: afterName,
                    changedByName:
                      state.accountProfiles?.[userId]?.realName ?? "演示管理员",
                  },
                ]
              : state.teamLeaderChanges,
            teams: state.teams.map((team) =>
              team.id === original.id ? updated : team,
            ),
            people: state.people.map((person) =>
              person.projectId === scopeId && person.teamId === original.id
                ? { ...person, teamName: updated.name }
                : person,
            ),
          };
          return response(next, managedDemoTeam(next, updated));
        }
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
    if (
      method !== "GET" &&
      [
        "default-shift",
        "default-schedule",
        "shift",
        "schedule",
        "configuration",
      ].includes(resource)
    )
      throw new ApiError(410, "旧排班写入接口已停用，请使用打卡安排。", {});
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
    if (resource === "tasks" && parts[5] === "today" && method === "GET") return response(state, demoTaskToday(state, requirePerson(state, userId, projectId), parts[4]));
    if (resource === "overtime" && parts[4] === "today" && method === "GET") return response(state, demoOvertimeToday(state, requirePerson(state, userId, projectId)));
    if (resource === "safety") return response(state, demoSafetyNotice(state, requirePerson(state, userId, projectId), query.pointCode));
    if (resource === "safety-confirmations") return confirmDemoSafety(state, userId, requirePerson(state, userId, projectId), options.data as ConfirmAttendanceSafety);
    if (resource === "records") {
      const person = requirePerson(state, userId, projectId);
      const body = options.data as SubmitAttendanceRecordBody;
      const project = state.projects.find((row) => row.id === projectId);
      if (project === undefined)
        throw new ApiError(404, "项目不存在。", { projectId });
      if (project.status !== "ACTIVE")
        throw new ApiError(400, "项目当前状态不能打卡。", {});
      const location = checkAttendanceGeofence(
        {
          centerLatitude: project.centerLatitude,
          centerLongitude: project.centerLongitude,
          radiusM: project.geofenceRadiusM,
        },
        {
          latitude: body.latitude,
          longitude: body.longitude,
          accuracyM: body.locationAccuracyM,
        },
      );
      if (!location.isInside)
        throw new ApiError(
          400,
          "不在考勤范围内，无法打卡。请进入项目范围后重新打卡。",
          { message: "OUTSIDE_GEOFENCE", projectId },
        );
      if (parseTaskPoint(body.pointCode) !== null) return punchDemoTask(state, userId, person, body);
      if (parseOvertimePoint(body.pointCode) !== null) return punchDemoOvertime(state, userId, person, body);
      const plan = effectiveDemoPlan(state, person, body.attendanceDate);
      const point = plan.points.find((row) => row.code === body.pointCode);
      if (
        !demoMemberEligible(
          demoMemberOn(state, person, body.attendanceDate),
          body.attendanceDate,
        )
      )
        throw new ApiError(400, "该日期不在有效考勤成员期间内。", {});
      if (
        state.records.some(
          (r) =>
            r.projectId === person.projectId &&
            r.participantId === person.profileId &&
            r.attendanceDate === body.attendanceDate &&
            r.pointCode === body.pointCode &&
            r.status === "VALID",
        ) ||
        state.makeups.some(
          (r) =>
            r.projectId === person.projectId &&
            r.participantId === person.profileId &&
            r.attendanceDate === body.attendanceDate &&
            r.pointCode === body.pointCode &&
            r.status !== "REJECTED",
        )
      )
        throw new ApiError(409, "该时点已有打卡或补卡，请刷新记录。", {});
      if (!plan.isWorkday || !point)
        throw new ApiError(400, "该时点不属于当天排班。", {});
      requireDemoSafety(state, userId, person, body);
      const record = {
        pointLabel: point.label,
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
    if (parts[1] === "pending" || parts[1] === "reviewed") {
      const rows = state.makeups
        .filter((row) => {
          const person = state.people.find(
            (p) =>
              p.projectId === row.projectId &&
              p.profileId === row.participantId,
          );
          if (
            !person ||
            (query.projectId !== undefined && row.projectId !== query.projectId) ||
            row.requesterUserId === userId ||
            (parts[1] === "pending" ? row.status !== "PENDING" : row.status === "PENDING" || row.approverUserId !== userId)
          )
            return false;
          const historical = demoMemberOn(state, person, row.attendanceDate);
          return (
            demoPlanLevel(state, userId, row.projectId, historical.teamId) >
              ROLE_LEVEL[participantPermissionRole(historical)] &&
            (query.onlyMine !== "true" || demoOnlyYou(state, userId, row, person))
          );
        })
        .map((row) => {
          const person = state.people.find(
            (p) =>
              p.projectId === row.projectId &&
              p.profileId === row.participantId,
          )!;
          return {
            ...row,
            displayName: person.displayName,
            onlyYou: demoOnlyYou(state, userId, row, person),
            projectName: state.projects.find((p) => p.id === row.projectId)!
              .name,
            teamName: demoMemberOn(state, person, row.attendanceDate).teamName,
          };
        });
      return response(state, { items: rows, nextCursor: null });
    }
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
      const task = parseTaskPoint(body.pointCode) === null ? null : demoTaskMakeupTarget(state, person, body.pointCode, body.requestedOccurredAt);
      const overtime = parseOvertimePoint(body.pointCode);
      if (overtime !== null) requireDemoOvertimeEnd(state, person, body.pointCode, body.requestedOccurredAt);
      const plan = effectiveDemoPlan(state, person, body.attendanceDate);
      const point = plan.points.find((row) => row.code === body.pointCode);
      if (
        !demoMemberEligible(
          demoMemberOn(state, person, body.attendanceDate),
          body.attendanceDate,
        )
      )
        throw new ApiError(400, "该日期不在有效考勤成员期间内。", {});
      if (
        state.records.some(
          (r) =>
            r.projectId === person.projectId &&
            r.participantId === person.profileId &&
            r.attendanceDate === body.attendanceDate &&
            r.pointCode === body.pointCode &&
            r.status === "VALID",
        ) ||
        state.makeups.some(
          (r) =>
            r.projectId === person.projectId &&
            r.participantId === person.profileId &&
            (task !== null || overtime !== null || r.attendanceDate === body.attendanceDate) &&
            r.pointCode === body.pointCode &&
            r.status !== "REJECTED",
        )
      )
        throw new ApiError(409, "该时点已有打卡或补卡，请刷新记录。", {});
      if (
        (task === null && overtime === null && (!plan.isWorkday || !point)) ||
        new Date(body.requestedOccurredAt).getTime() > Date.now()
      )
        throw new ApiError(400, "请按当天有效排班申请已发生的补卡。", {});
      const makeup = {
        ...body,
        pointLabel: task !== null ? `${parseTaskPoint(body.pointCode)?.kind === "START" ? "任务开工" : "任务完工"} · ${task.task.title}` : overtime !== null ? "加班退场" : point!.label,
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
    const applicant = state.people.find(
      (p) =>
        p.profileId === request.participantId &&
        p.projectId === request.projectId,
    );
    if (!applicant) throw new ApiError(404, "申请人档案不存在。", {});
    const historical = demoMemberOn(state, applicant, request.attendanceDate);
    if (
      demoPlanLevel(state, userId, request.projectId, historical.teamId) <=
      ROLE_LEVEL[participantPermissionRole(historical)]
    )
      throw new ApiError(403, "只能审批授权范围内下级的申请。", {});
    const updated = {
      ...request,
      status:
        parts[3] === "approve" ? ("APPROVED" as const) : ("REJECTED" as const),
      approvalReason: (options.data as { readonly approvalReason: string })
        .approvalReason,
      approverUserId: userId,
      approvedAt: new Date().toISOString(),
    };
    const approvedState = updated.status === "APPROVED" && parseTaskPoint(request.pointCode) !== null ? approveDemoTaskMakeup(state, applicant, request.pointCode, request.requestedOccurredAt) : state;
    if (updated.status === "APPROVED" && parseOvertimePoint(request.pointCode) !== null) requireDemoOvertimeEnd(state, applicant, request.pointCode, request.requestedOccurredAt);
    const next = {
      ...approvedState,
      makeups: state.makeups.map((row) =>
        row.id === updated.id ? updated : row,
      ),
    };
    if (updated.status === "APPROVED")
      demoDaySummary(next, historical, request.attendanceDate);
    return response(next, updated);
  }

  if (parts[0] === "reports" && parts[3] === "members") {
    const teamId = parts[1] === "teams" ? parts[2] : null;
    const projectId =
      teamId === null
        ? parts[2]
        : state.teams.find((t) => t.id === teamId)?.projectId;
    if (!projectId) throw new ApiError(404, "项目不存在。", { teamId });
    if (parts[5] === "evaluation" && method === "POST")
      return saveDemoEvaluation(
        state,
        userId,
        projectId,
        parts[4],
        options.data as Readonly<Record<string, unknown>>,
      );
    return response(
      state,
      demoReportPerson(
        state,
        userId,
        projectId,
        parts[4],
        teamId,
        query.from,
        query.to,
      ),
    );
  }
  if (parts[0] === "reports" && parts[3] === "team-options") {
    const projectIds = state.projects
      .filter((p) =>
        parts[1] === "projects" ? p.id === parts[2] : p.companyId === parts[2],
      )
      .map((p) => p.id);
    return response(
      state,
      state.teams
        .filter((team) => projectIds.includes(team.projectId))
        .map((team) => {
          const leader = managedDemoTeam(state, team).leader;
          return {
            teamId: team.id,
            teamName: team.name,
            projectId: team.projectId,
            projectName:
              state.projects.find((p) => p.id === team.projectId)?.name ?? "",
            status: team.status,
            leaderMemberId: leader?.memberId ?? null,
            leaderName: leader?.displayName ?? null,
          };
        }),
    );
  }
  if (parts[0] === "reports") {
    const scopeId = parts[2];
    const people = state.people.filter((row) =>
      parts[1] === "projects"
        ? row.projectId === scopeId
        : parts[1] === "teams"
          ? state.teams.some(
              (team) => team.id === scopeId && row.projectId === team.projectId,
            )
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
    const scopeProjects = new Set(people.map((row) => row.projectId));
    const scopeTeams = state.teams.filter((team) =>
      parts[1] === "teams"
        ? team.id === scopeId
        : parts[1] === "projects"
          ? team.projectId === scopeId
          : state.projects.some(
              (p) => p.id === team.projectId && p.companyId === scopeId,
            ),
    );
    if (query.teamId !== undefined && query.leaderMemberId !== undefined)
      throw new ApiError(400, "INVALID_REPORT_TEAM_FILTER", {});
    if (
      query.teamId !== undefined &&
      !scopeTeams.some((team) => team.id === query.teamId)
    )
      throw new ApiError(400, "REPORT_TEAM_OUT_OF_SCOPE", {});
    if (
      query.leaderMemberId !== undefined &&
      !state.people.some(
        (row) =>
          row.memberId === query.leaderMemberId &&
          scopeProjects.has(row.projectId),
      )
    )
      throw new ApiError(400, "REPORT_LEADER_OUT_OF_SCOPE", {});
    const teamIds =
      parts[1] === "teams"
        ? [scopeId]
        : query.teamId !== undefined
          ? [query.teamId]
          : query.leaderMemberId !== undefined
            ? scopeTeams
                .filter(
                  (team) =>
                    managedDemoTeam(state, team).leader?.memberId ===
                    query.leaderMemberId,
                )
                .map((team) => team.id)
            : null;
    const leaders = new Map(
      state.teams.map((team) => [
        team.id,
        managedDemoTeam(state, team).leader?.displayName ?? null,
      ]),
    );
    // 公司日报和真实接口一样只算进行中的项目（公司首页的“到岗 x／y”按它算）。
    const counted =
      parts[1] === "companies" && parts[3] === "daily"
        ? people.filter((row) =>
            state.projects.some((p) => p.id === row.projectId && p.status === "ACTIVE"),
          )
        : people;
    const built = demoReport(
      state,
      counted,
      scopeId,
      parts[3],
      start,
      end,
      teamIds,
    );
    return response(state, {
      ...built,
      participants: built.participants.map((row) => ({
        ...row,
        teamLeaderName:
          row.teamId === null ? null : (leaders.get(row.teamId) ?? null),
      })),
    });
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
      noteWrite();
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
    // 和真实接口一致：写操作成功后读取缓存作废。
    if (options?.method && options.method !== "GET") noteWrite();
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
