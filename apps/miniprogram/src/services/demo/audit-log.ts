import {
  auditActionsIn,
  auditCategoryOf,
  auditSentence,
  type AuditCategory,
} from "@construction/domain";

import type { AuditLogEntry, AuditLogPage } from "../audit-log";
import type { DemoState } from "./state";

const PAGE_SIZE = 30;

type Derived = {
  readonly action: string;
  readonly projectId: string;
  readonly target: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
};

/**
 * 演示里没有真正的审计表：写操作只记了“方法 + 路径”。这里把能认出来的几种
 * 换成和真实接口一样的动作，用同一套句子显示。认不出的不列。
 */
const derive = (state: DemoState, raw: string): Derived | null => {
  const [method, fullPath] = raw.split(" ");
  const parts = (fullPath ?? "").split("?")[0]!.split("/").filter(Boolean);
  const teamProject = (teamId: string | undefined) =>
    state.teams.find((team) => team.id === teamId)?.projectId ?? null;
  if (parts[0] === "makeups" && parts[1] === "requests" && method === "POST") {
    const makeup = state.makeups.find((row) => row.id === parts[2]);
    if (!makeup) return null;
    const person = state.people.find(
      (row) =>
        row.projectId === makeup.projectId &&
        row.profileId === makeup.participantId,
    );
    return {
      action: parts[3] === "approve" ? "MAKEUP_APPROVED" : "MAKEUP_REJECTED",
      projectId: makeup.projectId,
      target: person?.displayName ?? null,
      metadata: {},
    };
  }
  if (parts[0] === "management" && parts[1] === "projects" && parts[2]) {
    const projectId = parts[2];
    if (parts.length === 3 && method === "PUT")
      return { action: "project.update", projectId, target: null, metadata: {} };
    if (parts[3] === "participants" && parts.length === 4 && method === "POST")
      return { action: "project.member.create", projectId, target: null, metadata: {} };
    if (parts[3] === "participants" && parts.length === 5 && method === "PUT")
      return {
        action: "project.member.update",
        projectId,
        target:
          state.people.find((row) => row.memberId === parts[4])?.displayName ??
          null,
        metadata: {},
      };
    if (parts[3] === "teams" && parts.length === 5 && method === "PUT")
      return {
        action: "team.update",
        projectId,
        target: state.teams.find((row) => row.id === parts[4])?.name ?? null,
        metadata: {},
      };
    return null;
  }
  if (parts[0] === "team-work" && parts[1] === "teams" && parts[3] === "tasks") {
    const projectId = teamProject(parts[2]);
    if (projectId === null) return null;
    const title =
      state.teamWork?.tasks.find((row) => row.id === parts[4])?.title ?? null;
    if (parts.length === 4 && method === "POST")
      return { action: "TEAM_TASK_CREATED", projectId, target: null, metadata: {} };
    if (parts[7] === "start-reminder")
      return {
        action: "TEAM_TASK_START_MAKEUP_REMINDED",
        projectId,
        target: title,
        metadata: {},
      };
    if (parts[5] === "status" && method === "PUT")
      return { action: "TEAM_TASK_CLOSED", projectId, target: title, metadata: {} };
  }
  return null;
};

export const demoAuditLog = (
  state: DemoState,
  projectIds: readonly string[],
  type: AuditCategory | null,
  cursor: string | null,
): AuditLogPage => {
  const entries: AuditLogEntry[] = [];
  for (const entry of state.audit) {
    const derived = derive(state, entry.action);
    if (
      derived === null ||
      !projectIds.includes(derived.projectId) ||
      (type !== null && !auditActionsIn(type).includes(derived.action))
    )
      continue;
    const actorName =
      state.accountProfiles?.[entry.actor]?.realName ?? "演示账号";
    entries.push({
      id: entry.id,
      createdAt: entry.createdAt,
      action: derived.action,
      category: auditCategoryOf(derived.action),
      actorName,
      sentence: auditSentence(derived, actorName, derived.target),
      projectId: derived.projectId,
      projectName:
        state.projects.find((row) => row.id === derived.projectId)?.name ??
        null,
    });
  }
  const start = cursor === null ? 0 : Number(cursor) || 0;
  const end = start + PAGE_SIZE;
  return {
    items: entries.slice(start, end),
    nextCursor: entries.length > end ? String(end) : null,
  };
};
