import type { WorktimeRule, WorktimeRuleVersion } from "@construction/domain";
import { apiClient } from "./client";

export type WorktimeConfiguration = {
  readonly current: WorktimeRuleVersion;
  readonly versions: readonly WorktimeRuleVersion[];
  readonly defaultConfig: WorktimeRule;
  readonly latestVersion: number;
};
export type WorktimeRuleInput = {
  readonly expectedVersion: number;
  readonly startsOn: string;
  readonly config: WorktimeRule;
};
export const fetchWorktimeConfiguration = (projectId: string): Promise<WorktimeConfiguration> =>
  apiClient.request(`/worktime/projects/${projectId}`, { method: "GET" });
export const saveWorktimeConfiguration = (projectId: string, input: WorktimeRuleInput): Promise<WorktimeConfiguration> =>
  apiClient.request(`/worktime/projects/${projectId}`, { method: "PUT", data: input });
