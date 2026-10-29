import {
  defaultAttendancePoints,
  legacyAttendancePoints,
  validateAttendancePoints,
} from "@construction/domain/attendance.js";
import { ROLE_LEVEL } from "@construction/domain/roles.js";
import { participantPermissionRole } from "../../routing/permissionLevels";
import { ApiError } from "../apiClient";
import type {
  PlanConfiguration,
  PlanInput,
  PlanScope,
  EffectivePlan,
} from "../attendance-plans";
import type { ProjectParticipant } from "../management.types";
import { chinaToday } from "../time";
import { demoId, demoMe, type DemoState } from "./state";
import { effectiveDemoConfiguration } from "./configuration";

export type DemoPlan = PlanConfiguration &
  PlanScope & {
    readonly authorUserId: string | null;
    readonly authorLevel: number;
  };
const memberLevel = (person: ProjectParticipant): number => ROLE_LEVEL[participantPermissionRole(person)];
export const demoPlanLevel = (
  state: DemoState,
  userId: string,
  projectId: string,
  teamId: string | null,
): number => {
  const project = state.projects.find((row) => row.id === projectId);
  return Math.max(
    0,
    ...demoMe(state, userId)
      .roles.assignments.filter(
        (assignment) =>
          assignment.scope.scopeType === "GLOBAL" ||
          (assignment.scope.scopeType === "COMPANY" &&
            assignment.scope.scopeId === project?.companyId) ||
          (assignment.scope.scopeType === "PROJECT" &&
            assignment.scope.scopeId === projectId) ||
          (assignment.scope.scopeType === "TEAM" &&
            assignment.scope.scopeId === teamId),
      )
      .map((assignment) => ROLE_LEVEL[assignment.roleCode]),
  );
};
export const demoPlanScopes = (
  state: DemoState,
  userId: string,
): readonly PlanScope[] =>
  state.projects.flatMap((project) => [
    ...(demoPlanLevel(state, userId, project.id, null) >= 3
      ? [
          {
            projectId: project.id,
            scopeType: "PROJECT" as const,
            scopeId: project.id,
            label: `${project.name} · 项目默认`,
          },
        ]
      : []),
    ...state.teams
      .filter(
        (team) =>
          team.projectId === project.id &&
          demoPlanLevel(state, userId, project.id, team.id) >= 2,
      )
      .map((team) => ({
        projectId: project.id,
        scopeType: "TEAM" as const,
        scopeId: team.id,
        label: `${project.name} · ${team.name}`,
      })),
    ...state.people
      .filter(
        (person) =>
          person.projectId === project.id &&
          person.status === "ACTIVE" &&
          person.profileId !== demoMe(state, userId).profile.id &&
          demoPlanLevel(state, userId, project.id, person.teamId) >
            memberLevel(person),
      )
      .map((person) => ({
        projectId: project.id,
        scopeType: "MEMBER" as const,
        scopeId: person.memberId,
        label: `${project.name} · ${person.displayName ?? person.phone}`,
      })),
  ]);
export const effectiveDemoPlan = (
  state: DemoState,
  person: ProjectParticipant,
  date: string,
): EffectivePlan => {
  const plans = [...(state.plans ?? [])]
    .reverse()
    .sort((a, b) => b.startsOn.localeCompare(a.startsOn));
  for (const scope of [
    { type: "MEMBER", id: person.memberId },
    { type: "TEAM", id: person.teamId },
    { type: "PROJECT", id: person.projectId },
  ]) {
    const plan = plans.find(
      (row) =>
        row.projectId === person.projectId &&
        row.scopeType === scope.type &&
        row.scopeId === scope.id &&
        row.startsOn <= date &&
        row.authorLevel > memberLevel(person) &&
        (row.authorUserId === null ||
          demoMe(state, row.authorUserId).profile.id !== person.profileId),
    );
    if (!plan || plan.inherit || (plan.endsOn !== null && plan.endsOn < date))
      continue;
    return {
      name: plan.name,
      points: plan.points,
      isWorkday: plan.workdays.includes(
        new Date(`${date}T00:00:00Z`).getUTCDay() || 7,
      ),
    };
  }
  if (
    plans.some(
      (row) =>
        row.projectId === person.projectId &&
        row.authorLevel === 6 &&
        row.startsOn <= date,
    )
  )
    return {
      name: "每日两次",
      points: defaultAttendancePoints,
      isWorkday: true,
    };
  const legacy = effectiveDemoConfiguration(state, person, date);
  if (legacy.shift && legacy.schedule)
    return {
      name: legacy.shift.name,
      points: legacyAttendancePoints(legacy.shift.segments),
      isWorkday: legacy.schedule.workdays.some(
        (day) => day === (new Date(`${date}T00:00:00Z`).getUTCDay() || 7),
      ),
    };
  return { name: "每日两次", points: defaultAttendancePoints, isWorkday: true };
};
export const demoPlanRequest = (
  state: DemoState,
  userId: string,
  parts: readonly string[],
  method: string,
  body: unknown,
): { readonly state: DemoState; readonly data: unknown } => {
  const scopes = demoPlanScopes(state, userId);
  if (parts[2] === "scopes") return { state, data: scopes };
  const scope = scopes.find(
    (row) =>
      row.projectId === parts[2] &&
      row.scopeType === parts[3] &&
      row.scopeId === parts[4],
  );
  if (!scope) throw new ApiError(403, "只能设置授权范围内下级的排班。", {});
  const latest = [...(state.plans ?? [])]
    .reverse()
    .filter(
      (row) =>
        row.projectId === scope.projectId &&
        row.scopeType === scope.scopeType &&
        row.scopeId === scope.scopeId,
    )
    .sort((a, b) => b.startsOn.localeCompare(a.startsOn))[0];
  if (method === "GET")
    return {
      state,
      data: latest ?? {
        id: null,
        name: "每日两次",
        startsOn: chinaToday(),
        endsOn: null,
        inherit: false,
        points: defaultAttendancePoints,
        workdays: [1, 2, 3, 4, 5, 6, 7],
      },
    };
  const input = body as PlanInput;
  validateAttendancePoints(input.points);
  if (
    input.startsOn <= chinaToday() ||
    (latest && input.startsOn < latest.startsOn) ||
    !input.workdays.length ||
    (input.endsOn !== null && input.endsOn < input.startsOn)
  )
    throw new ApiError(400, "请设置有效的未来生效日期和工作日。", {});
  if ((latest?.id ?? null) !== input.expectedId)
    throw new ApiError(409, "排班已更新，请刷新后重试。", {});
  if (parts[5] === "inherit" && scope.scopeType === "PROJECT")
    throw new ApiError(400, "项目默认排班不能移除。", {});
  const teamId =
    scope.scopeType === "TEAM"
      ? scope.scopeId
      : (state.people.find((person) => person.memberId === scope.scopeId)
          ?.teamId ?? null);
  const plan: DemoPlan = {
    ...scope,
    ...input,
    id: demoId("plan"),
    inherit: parts[5] === "inherit",
    authorUserId: userId,
    authorLevel: demoPlanLevel(state, userId, scope.projectId, teamId),
  };
  return {
    state: { ...state, plans: [...(state.plans ?? []), plan] },
    data: plan,
  };
};
