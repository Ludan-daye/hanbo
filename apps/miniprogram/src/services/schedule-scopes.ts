import { apiClient } from "./client";
import {
  configureDefaultSchedule,
  configureDefaultShift,
  fetchDefaultAttendanceConfiguration,
} from "./management";
import type {
  DefaultAttendanceConfiguration,
  DefaultScheduleBody,
  DefaultShiftBody,
} from "./management.types";

export type ScheduleScope = {
  readonly scopeType: "PROJECT" | "TEAM" | "MEMBER";
  readonly scopeId: string;
  readonly label: string;
};
const scopePath = (projectId: string, scope: ScheduleScope): string =>
  `/attendance/projects/${projectId}/${scope.scopeType === "TEAM" ? "teams" : "members"}/${scope.scopeId}`;

/** Team/member schedule endpoints are frontend contracts awaiting server implementation. */
export const fetchScopedConfiguration = (
  projectId: string,
  scope: ScheduleScope,
): Promise<DefaultAttendanceConfiguration> =>
  scope.scopeType === "PROJECT"
    ? fetchDefaultAttendanceConfiguration(projectId)
    : apiClient.request(`${scopePath(projectId, scope)}/configuration`, {
        method: "GET",
      });
export const saveScopedShift = (
  projectId: string,
  scope: ScheduleScope,
  body: DefaultShiftBody,
): Promise<unknown> =>
  scope.scopeType === "PROJECT"
    ? configureDefaultShift(projectId, body)
    : apiClient.request(`${scopePath(projectId, scope)}/shift`, {
        method: "PUT",
        data: body,
      });
export const saveScopedSchedule = (
  projectId: string,
  scope: ScheduleScope,
  body: DefaultScheduleBody,
): Promise<unknown> =>
  scope.scopeType === "PROJECT"
    ? configureDefaultSchedule(projectId, body)
    : apiClient.request(`${scopePath(projectId, scope)}/schedule`, {
        method: "PUT",
        data: body,
      });
export const removeScopedConfiguration = (
  projectId: string,
  scope: ScheduleScope,
): Promise<void> => {
  if (scope.scopeType === "PROJECT")
    throw new Error("项目默认排班不能作为专属排班移除。");
  return apiClient.request(`${scopePath(projectId, scope)}/configuration`, {
    method: "DELETE",
  });
};
