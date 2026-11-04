import type {
  NewTaskInvitation,
  SafetyBriefing,
  SafetyBriefingInput,
  SafetyIssue,
  SafetyIssueInput,
  SafetyIssuePage,
  SavedTeamDailySummary,
  TeamTaskDetails,
  TeamTaskDefaults,
  TeamTaskTemplatePage,
  TaskInvitation,
  TaskInvitationInput,
  TaskJoinResult,
  TeamDailySummary,
  TeamTask,
  TeamTaskInput,
  TeamTaskWorker,
} from "@construction/domain";
import { apiClient } from "./client";

const teamPath = (teamId: string): string =>
  `/team-work/teams/${encodeURIComponent(teamId)}`;
const taskPath = (teamId: string, taskId: string): string =>
  `${teamPath(teamId)}/tasks/${encodeURIComponent(taskId)}`;
export const fetchTaskWorkers = (
  teamId: string,
): Promise<readonly TeamTaskWorker[]> =>
  apiClient.request(`${teamPath(teamId)}/workers`, { method: "GET" });
export const fetchTeamTaskDefaults = (
  teamId: string,
  date: string,
): Promise<TeamTaskDefaults> =>
  apiClient.request(`${teamPath(teamId)}/task-defaults?date=${date}`, {
    method: "GET",
  });
export const fetchTeamTaskTemplates = (
  teamId: string,
  cursor: string | null,
  search: string,
): Promise<TeamTaskTemplatePage> =>
  apiClient.request(
    `${teamPath(teamId)}/task-templates?search=${encodeURIComponent(search)}${cursor === null ? "" : `&cursor=${encodeURIComponent(cursor)}`}`,
    { method: "GET" },
  );
export const addTeamTaskMembers = (
  teamId: string,
  taskId: string,
  memberIds: readonly string[],
): Promise<TeamTask> =>
  apiClient.request(`${taskPath(teamId, taskId)}/members`, {
    method: "POST",
    data: { memberIds },
  });
export const fetchTeamTasks = (
  teamId: string,
  date: string,
): Promise<readonly TeamTask[]> =>
  apiClient.request(`${teamPath(teamId)}/tasks?date=${date}`, {
    method: "GET",
  });
export const createTeamTask = (
  teamId: string,
  data: TeamTaskInput,
): Promise<TeamTask> =>
  apiClient.request(`${teamPath(teamId)}/tasks`, { method: "POST", data });
export const updateTeamTask = (
  teamId: string,
  taskId: string,
  data: TeamTaskDetails,
): Promise<TeamTask> =>
  apiClient.request(taskPath(teamId, taskId), { method: "PUT", data });
export const removeTeamTaskMember = (
  teamId: string,
  taskId: string,
  memberId: string,
): Promise<void> =>
  apiClient.request(
    `${taskPath(teamId, taskId)}/members/${encodeURIComponent(memberId)}`,
    { method: "DELETE" },
  );
export const fetchOpenSafetyIssues = (
  teamId: string,
  cursor: string | null,
): Promise<SafetyIssuePage> =>
  apiClient.request(
    `${teamPath(teamId)}/issues/open${cursor === null ? "" : `?cursor=${encodeURIComponent(cursor)}`}`,
    { method: "GET" },
  );
export const closeTeamTask = (
  teamId: string,
  taskId: string,
  status: "COMPLETED" | "CANCELLED",
): Promise<void> =>
  apiClient.request(`${taskPath(teamId, taskId)}/status`, {
    method: "PUT",
    data: { status },
  });
export const createTaskInvitation = (
  teamId: string,
  taskId: string,
  data: TaskInvitationInput,
): Promise<NewTaskInvitation> =>
  apiClient.request(`${taskPath(teamId, taskId)}/invitations`, {
    method: "POST",
    data,
  });
export const fetchTaskInvitations = (
  teamId: string,
  taskId: string,
): Promise<readonly TaskInvitation[]> =>
  apiClient.request(`${taskPath(teamId, taskId)}/invitations`, {
    method: "GET",
  });
export const revokeTaskInvitation = (
  teamId: string,
  taskId: string,
  id: string,
): Promise<void> =>
  apiClient.request(
    `${taskPath(teamId, taskId)}/invitations/${encodeURIComponent(id)}/revoke`,
    { method: "POST" },
  );
export const joinTemporaryTask = (code: string): Promise<TaskJoinResult> =>
  apiClient.request("/team-work/me/join", { method: "POST", data: { code } });
export const fetchMyTasks = (date: string): Promise<readonly TeamTask[]> =>
  apiClient.request(`/team-work/me/tasks?date=${date}`, { method: "GET" });
export const fetchTeamBriefings = (
  teamId: string,
  date: string,
): Promise<readonly SafetyBriefing[]> =>
  apiClient.request(`${teamPath(teamId)}/briefings?date=${date}`, {
    method: "GET",
  });
export const publishTeamBriefing = (
  teamId: string,
  data: SafetyBriefingInput,
): Promise<void> =>
  apiClient.request(`${teamPath(teamId)}/briefings`, { method: "POST", data });
export const fetchMyBriefings = (
  date: string,
): Promise<readonly SafetyBriefing[]> =>
  apiClient.request(`/team-work/me/briefings?date=${date}`, { method: "GET" });
export const acknowledgeBriefing = (id: string): Promise<void> =>
  apiClient.request(
    `/team-work/me/briefings/${encodeURIComponent(id)}/acknowledge`,
    { method: "POST" },
  );
export const fetchSafetyIssues = (
  teamId: string,
  date: string,
): Promise<readonly SafetyIssue[]> =>
  apiClient.request(`${teamPath(teamId)}/issues?date=${date}`, {
    method: "GET",
  });
export const recordSafetyIssue = (
  teamId: string,
  data: SafetyIssueInput,
): Promise<void> =>
  apiClient.request(`${teamPath(teamId)}/issues`, { method: "POST", data });
export const resolveSafetyIssue = (
  teamId: string,
  id: string,
  resolution: string,
): Promise<void> =>
  apiClient.request(
    `${teamPath(teamId)}/issues/${encodeURIComponent(id)}/resolution`,
    { method: "PUT", data: { resolution } },
  );
export const fetchTeamDailySummary = (
  teamId: string,
  date: string,
): Promise<TeamDailySummary> =>
  apiClient.request(`${teamPath(teamId)}/daily?date=${date}`, {
    method: "GET",
  });
export const saveTeamDailySummary = (
  teamId: string,
  date: string,
): Promise<TeamDailySummary> =>
  apiClient.request(`${teamPath(teamId)}/daily/${date}`, { method: "POST" });

export const fetchSavedTeamDailySummary = async (
  teamId: string,
  date: string,
): Promise<TeamDailySummary | null> => {
  const response = await apiClient.request<SavedTeamDailySummary>(
    `${teamPath(teamId)}/daily/${date}`,
    { method: "GET" },
  );
  return response.snapshot;
};

export const confirmTaskExit = (
  teamId: string,
  taskId: string,
  memberId: string,
): Promise<void> =>
  apiClient.request(
    `${taskPath(teamId, taskId)}/members/${encodeURIComponent(memberId)}/exit`,
    { method: "POST" },
  );
