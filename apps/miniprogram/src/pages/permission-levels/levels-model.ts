import { PANEL_LABELS } from "../../routing/features";
import type { PermissionLevel } from "../../routing/permissionLevels";
import { roleHomePanel } from "../../routing/roleHome";
import type { MeResponse, RoleCode } from "../../services/auth.types";
import type { MyProjectMembership } from "../../services/me.types";

// “权限与范围”页面上要算的东西，不碰界面，方便单测。

type Assignment = MeResponse["roles"]["assignments"][number];

const NUMERALS = "一二三四五";

/** 职级的短名字：“班组长”“项目管理员”。 */
export const roleShortName = (roleCode: RoleCode): string =>
  PANEL_LABELS[roleHomePanel(roleCode)];

/** 小标牌上的标题：“二级 班组长”。 */
export const levelTitle = (
  level: Pick<PermissionLevel, "level" | "roleCode">,
): string =>
  `${NUMERALS[level.level - 1] ?? level.level}级 ${roleShortName(level.roleCode)}`;

/** 五个等级各管什么，一句话。 */
export const LEVEL_SUMMARY: Readonly<Record<RoleCode, string>> = {
  WORKER: "本人的打卡、考勤和补卡",
  TEAM_LEADER: "本班组的安排、审批和日报",
  PROJECT_ADMIN: "本项目的人员、规则和报表",
  COMPANY_ADMIN: "本公司的项目和人员",
  SYSTEM_ADMIN: "平台、公司和账号",
};

const SCOPE_TYPE: Readonly<Record<string, string>> = {
  GLOBAL: "整个平台",
  COMPANY: "所属公司",
  PROJECT: "所属项目",
  TEAM: "所属班组",
};

/** 这条授权落在哪个项目、哪个班组上；认不出来（项目没读到，或不是项目和班组）时是 null。 */
export const assignmentPlace = (
  assignment: Assignment,
  projects: readonly MyProjectMembership[] | null,
): string | null => {
  const project = projects?.find((item) =>
    assignment.scope.scopeType === "TEAM"
      ? item.teamId === assignment.scope.scopeId
      : item.projectId === assignment.scope.scopeId,
  );
  if (!project) return null;
  return assignment.scope.scopeType === "TEAM" && project.teamName
    ? `${project.projectName}，${project.teamName}`
    : project.projectName;
};

/** “我的范围”里一行的说明：“所属班组，滨江花园一期，钢筋一班”。 */
export const assignmentLine = (
  assignment: Assignment,
  projects: readonly MyProjectMembership[] | null,
): string => {
  const kind =
    SCOPE_TYPE[assignment.scope.scopeType] ?? assignment.scope.scopeType;
  const place = assignmentPlace(assignment, projects);
  return place ? `${kind}，${place}` : kind;
};

/**
 * 小标牌的第二行：先说这一级管到哪；只有一条授权时接着写具体是哪个项目、哪个班组。
 * 有几条授权时不在这里挤，下面单独列。
 */
export const levelScopeLine = (
  level: Pick<PermissionLevel, "scope">,
  assignments: readonly Assignment[],
  projects: readonly MyProjectMembership[] | null,
): string => {
  const place =
    assignments.length === 1 ? assignmentPlace(assignments[0], projects) : null;
  return place ? `范围：${level.scope}。${place}` : `范围：${level.scope}`;
};
