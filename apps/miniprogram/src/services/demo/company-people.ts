import { ApiError } from "../apiClient";
import type {
  CompanyPerson,
  ManagedParticipant,
  ProjectAdmins,
} from "../management.types";
import { memberRoleAssignments } from "../member-roles";

import { demoId, demoMe, type DemoState } from "./state";

// 公司管理员的“项目负责人”和“人员任职”（2026-11-21 第二、三期），与服务端同口径。

const BOUND = new Set(["profile-worker", "profile-team", "profile-project"]);
export const demoProfileBound = (state: DemoState, profileId: string): boolean =>
  BOUND.has(profileId) ||
  state.boundProfileId === profileId ||
  state.accounts.some((account) => `profile-${account.id}` === profileId);

const holdsAdmin = (person: ManagedParticipant): boolean =>
  person.status === "ACTIVE" && person.projectRoleLabel === "PROJECT_ADMIN";

export const demoProjectAdmins = (state: DemoState, companyId: string): ProjectAdmins => ({
  projects: state.projects
    .filter((project) => project.companyId === companyId)
    .map((project) => ({
      admins: state.people
        .filter((person) => person.projectId === project.id && holdsAdmin(person))
        .map((person) => ({
          displayName: person.displayName,
          isBound: demoProfileBound(state, person.profileId),
          memberId: person.memberId,
          participantType: person.participantType,
          phone: person.phone,
          profileId: person.profileId,
        })),
      name: project.name,
      projectId: project.id,
      status: project.status,
    })),
});

export const demoCompanyPerson = (
  state: DemoState,
  companyId: string,
  participantType: string,
  profileId: string,
): CompanyPerson => {
  const projects = new Map(
    state.projects.filter((row) => row.companyId === companyId).map((row) => [row.id, row]),
  );
  const rows = state.people.filter(
    (person) =>
      person.profileId === profileId &&
      person.participantType === participantType &&
      projects.has(person.projectId),
  );
  const first = rows[0];
  if (first === undefined)
    throw new ApiError(404, "这个人不在本公司的项目里。", { message: "COMPANY_PERSON_NOT_FOUND" });
  return {
    displayName: first.displayName,
    isBound: demoProfileBound(state, profileId),
    memberships: rows.map((person) => ({
      enteredAt: person.enteredAt,
      evaluationScore:
        state.evaluations?.find((row) => row.projectId === person.projectId && row.memberId === person.memberId)
          ?.evaluation.score ?? null,
      exitedAt: person.exitedAt,
      history: (state.memberHistories ?? [])
        .filter((row) => row.person.memberId === person.memberId && row.person.projectId === person.projectId)
        .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
        .map((row) => ({
          projectRoleLabel: row.person.projectRoleLabel,
          recordedAt: row.recordedAt,
          status: row.person.status,
          teamName: row.person.teamName,
        })),
      memberId: person.memberId,
      projectId: person.projectId,
      projectName: projects.get(person.projectId)?.name ?? "",
      projectRoleLabel: person.projectRoleLabel,
      projectStatus: projects.get(person.projectId)?.status ?? "ACTIVE",
      roles: memberRoleAssignments(person).map((role) => ({
        roleCode: role.roleCode,
        teamId: role.teamId,
        teamName: state.teams.find((team) => team.id === role.teamId)?.name ?? null,
      })),
      status: person.status,
      teamId: person.teamId,
      teamName: person.teamName,
      updatedAt: person.updatedAt,
    })),
    participantType: first.participantType,
    phone: first.phone,
    profileId,
  };
};

/** 离岗：REVOKE_ADMIN 把管理身份改成普通成员、清掉他负责的班组；EXIT_ALL 全部退场。 */
export const demoOffboard = (
  state: DemoState,
  userId: string,
  companyId: string,
  participantType: string,
  profileId: string,
  body: { readonly mode?: unknown; readonly effectiveDate?: unknown },
): { readonly state: DemoState; readonly data: CompanyPerson } => {
  const mode = body.mode ?? "REVOKE_ADMIN";
  if ((mode !== "REVOKE_ADMIN" && mode !== "EXIT_ALL") || typeof body.effectiveDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.effectiveDate))
    throw new ApiError(400, "离岗日期不对，请重新选择。", { message: "INVALID_OFFBOARD_REQUEST" });
  const person = demoCompanyPerson(state, companyId, participantType, profileId);
  if (demoMe(state, userId).profile.id === profileId)
    throw new ApiError(409, "不能调整自己的管理身份。", { message: "CANNOT_CHANGE_OWN_MANAGEMENT_ASSIGNMENT" });
  const now = new Date().toISOString();
  const exitedAt = `${body.effectiveDate}T00:00:00+08:00`;
  const touched = new Set<string>();
  const people = state.people.map((row) => {
    if (row.profileId !== profileId || !person.memberships.some((m) => m.memberId === row.memberId) || row.status === "EXITED")
      return row;
    if (mode === "EXIT_ALL") {
      touched.add(row.memberId);
      return { ...row, status: "EXITED" as const, exitedAt, updatedAt: now };
    }
    const leads = state.teams.some((team) => team.leader?.memberId === row.memberId);
    const manages = row.projectRoleLabel === "PROJECT_ADMIN" || row.projectRoleLabel === "TEAM_LEADER" ||
      (row.additionalRoles ?? []).some((role) => role.roleCode === "TEAM_LEADER");
    if (!manages && !leads) return row;
    touched.add(row.memberId);
    return {
      ...row,
      additionalRoles: (row.additionalRoles ?? []).filter((role) => role.roleCode !== "TEAM_LEADER"),
      projectRoleLabel:
        row.projectRoleLabel === "PROJECT_ADMIN" || row.projectRoleLabel === "TEAM_LEADER"
          ? row.participantType === "WORKER" && row.workType ? row.workType : "WORKER"
          : row.projectRoleLabel,
      teamId: row.projectRoleLabel === "PROJECT_ADMIN" ? null : row.teamId,
      teamName: row.projectRoleLabel === "PROJECT_ADMIN" ? null : row.teamName,
      updatedAt: now,
    };
  });
  if (touched.size === 0)
    throw new ApiError(409, "他在本公司已经没有要收回的职务了。", { message: "OFFBOARD_NOTHING_TO_CHANGE" });
  const cleared = state.teams.filter((team) => team.leader && touched.has(team.leader.memberId));
  const next: DemoState = {
    ...state,
    people,
    teams: state.teams.map((team) => (team.leader && touched.has(team.leader.memberId) ? { ...team, leader: null } : team)),
    teamLeaderChanges: [
      ...(state.teamLeaderChanges ?? []),
      ...cleared.map((team) => ({
        id: demoId("leader-change"),
        teamId: team.id,
        changedAt: now,
        reason: mode === "EXIT_ALL" ? ("MEMBER_INACTIVE" as const) : ("MEMBER_TRANSFERRED" as const),
        previousLeaderName: person.displayName ?? "姓名待补录",
        leaderName: null,
        changedByName: state.accountProfiles?.[userId]?.realName ?? "公司管理员",
      })),
    ],
  };
  return { state: next, data: demoCompanyPerson(next, companyId, participantType, profileId) };
};
