import type { ScheduledAttendancePoint } from "@construction/domain/attendance.js";
import { apiClient } from "./client";

export type PlanScope = {
  readonly projectId: string;
  readonly scopeType: "PROJECT" | "TEAM" | "MEMBER";
  readonly scopeId: string;
  readonly label: string;
};
export type PlanConfiguration = {
  readonly id: string | null;
  readonly inherit: boolean;
  readonly name: string;
  readonly startsOn: string;
  readonly endsOn: string | null;
  readonly points: readonly ScheduledAttendancePoint[];
  readonly workdays: readonly number[];
};
export type PlanInput = Omit<PlanConfiguration, "id" | "inherit"> & {
  readonly expectedId: string | null;
};
export type EffectivePlan = {
  readonly name: string;
  readonly isWorkday: boolean;
  readonly points: readonly ScheduledAttendancePoint[];
};
const path = (scope: PlanScope): string =>
  `/attendance/planning/${scope.projectId}/${scope.scopeType}/${scope.scopeId}`;
export const fetchPlanScopes = (): Promise<readonly PlanScope[]> =>
  apiClient.request("/attendance/planning/scopes", { method: "GET" });
export const fetchPlanConfiguration = (
  scope: PlanScope,
): Promise<PlanConfiguration> =>
  apiClient.request(path(scope), { method: "GET" });
export const savePlanConfiguration = (
  scope: PlanScope,
  body: PlanInput,
): Promise<PlanConfiguration> =>
  apiClient.request(path(scope), { method: "POST", data: body });
export const inheritPlanConfiguration = (
  scope: PlanScope,
  body: PlanInput,
): Promise<PlanConfiguration> =>
  apiClient.request(`${path(scope)}/inherit`, { method: "POST", data: body });
export const fetchMyAttendancePlan = (
  projectId: string,
  date: string,
): Promise<EffectivePlan> =>
  apiClient.request(`/me/projects/${projectId}/attendance-plan?date=${date}`, {
    method: "GET",
  });
