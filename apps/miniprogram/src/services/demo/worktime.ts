import { defaultWorktimeRule, resolveWorktimeRule, classifyWorktime, type WorktimeRuleVersion } from "@construction/domain";
import type { RequestOptions } from "../apiClient";
import { ApiError } from "../apiClient";
import type { WorktimeConfiguration, WorktimeRuleInput } from "../worktime";
import { chinaToday } from "../time";
import { demoPlanLevel } from "./plans";
import type { DemoState } from "./state";

const configuration = (versions: readonly WorktimeRuleVersion[]): WorktimeConfiguration => ({
  versions, current: resolveWorktimeRule(versions, chinaToday()), defaultConfig: defaultWorktimeRule,
  latestVersion: Math.max(0, ...versions.map((row) => row.version)),
});
export const demoWorktimeRequest = (
  state: DemoState, userId: string, projectId: string, options: RequestOptions,
): { readonly state: DemoState; readonly data: WorktimeConfiguration } => {
  if (!state.projects.some((row) => row.id === projectId)) throw new ApiError(404, "项目不存在。", {});
  const level = demoPlanLevel(state, userId, projectId, null);
  if (level < 3) throw new ApiError(403, "无权查看项目工时设置。", {});
  const versions = (state.worktimeRules ?? []).filter((row) => row.projectId === projectId);
  const current = configuration(versions);
  if ((options.method ?? "GET") === "GET") return { state, data: current };
  if (options.method !== "PUT") throw new ApiError(405, "不支持此操作。", {});
  const input = options.data as WorktimeRuleInput;
  if (input.expectedVersion !== current.latestVersion) throw new ApiError(409, "规则已更新，请刷新。", {});
  const date = new Date(`${input.startsOn}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== input.startsOn || input.startsOn <= chinaToday()) throw new ApiError(400, "规则最早次日生效。", {});
  const row = { ...input, projectId, version: current.latestVersion + 1 };
  classifyWorktime([], input.startsOn, row, new Date());
  const next = { ...state, worktimeRules: [...(state.worktimeRules ?? []), row] };
  return { state: next, data: configuration([...versions, row]) };
};
