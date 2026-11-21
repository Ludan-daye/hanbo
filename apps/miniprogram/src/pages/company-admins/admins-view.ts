import { displayProjectRole } from "../../routing/features";
import { formatChinaDate } from "../../services/time";
import type {
  CompanyPerson,
  CompanyPersonMembership,
  OffboardMode,
  ProjectAdmins,
} from "../../services/management.types";

// 项目负责人页和人员任职页要写的字，不碰界面，方便单测。

export type AdminLine = {
  readonly projectId: string;
  readonly title: string;
  readonly sub: string;
  /** 进行中或筹备中却没有管理员：标红。 */
  readonly missing: boolean;
  readonly admins: ProjectAdmins["projects"][number]["admins"];
  readonly status: ProjectAdmins["projects"][number]["status"];
};

const STATUS_ORDER = { ACTIVE: 0, PREPARING: 1, SUSPENDED: 2, COMPLETED: 3 } as const;

/** 每个项目一行：没管理员的排前面，再按进行中、筹备中、暂停、完工。 */
export const projectAdminLines = (
  data: ProjectAdmins | null,
): readonly AdminLine[] =>
  (data?.projects ?? [])
    .map((project): AdminLine => {
      const open = project.status === "ACTIVE" || project.status === "PREPARING";
      return {
        projectId: project.projectId,
        title: project.name,
        sub:
          project.admins.length === 0
            ? "还没有项目管理员"
            : project.admins
                .map((admin) => `${admin.displayName ?? "姓名待补录"}${admin.isBound ? "" : "（未绑定）"}`)
                .join("、"),
        missing: open && project.admins.length === 0,
        admins: project.admins,
        status: project.status,
      };
    })
    .sort(
      (a, b) =>
        Number(b.missing) - Number(a.missing) ||
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status],
    );

/** 一个任职的身份：“项目管理员”“班组长（钢筋一班）”“钢筋工”，几个身份用顿号连起来。 */
export const membershipRoles = (membership: CompanyPersonMembership): string =>
  membership.roles
    .map((role) =>
      role.roleCode === "TEAM_LEADER"
        ? `班组长（${role.teamName ?? "班组"}）`
        : role.roleCode === "PROJECT_ADMIN"
          ? "项目管理员"
          : displayProjectRole(membership.projectRoleLabel === "WORKER" ? "WORKER" : membership.projectRoleLabel),
    )
    .filter((text, index, all) => all.indexOf(text) === index)
    .join("、");

const manages = (membership: CompanyPersonMembership): boolean =>
  membership.status !== "EXITED" &&
  membership.roles.some((role) => role.roleCode !== "WORKER");

/** 离岗会动到哪几个项目，按钮旁边写清楚，考勤和补卡记录不动。 */
export const offboardSummary = (
  person: CompanyPerson,
  mode: OffboardMode,
): { readonly projects: readonly string[]; readonly text: string } => {
  const projects = person.memberships
    .filter((membership) =>
      mode === "EXIT_ALL" ? membership.status !== "EXITED" : manages(membership),
    )
    .map((membership) => membership.projectName);
  if (projects.length === 0)
    return {
      projects,
      text:
        mode === "EXIT_ALL"
          ? "他在本公司的项目都已退场。"
          : "他在本公司没有项目管理员或班组长职务，不用收回。要让他离开，请选“所有项目都退场”。",
    };
  return {
    projects,
    text:
      mode === "EXIT_ALL"
        ? `在 ${projects.join("、")} 办退场，账号收回这些项目的权限。考勤、补卡记录都保留。`
        : `收回 ${projects.join("、")} 的项目管理员、班组长职务和班组负责人，他仍以普通成员留在项目里。考勤、补卡记录都保留。`,
  };
};

/** 任职的状态。 */
export const membershipStatus = (
  membership: Pick<CompanyPersonMembership, "status">,
): { readonly kind: "ok" | "warn" | "idle"; readonly text: string } =>
  membership.status === "ACTIVE"
    ? { kind: "ok", text: "在场" }
    : membership.status === "SUSPENDED"
      ? { kind: "warn", text: "暂停" }
      : { kind: "idle", text: "已退场" };

/** 他有没有管理职务（项目管理员、班组长）可以收回：没有时离岗默认选“所有项目都退场”。 */
export const hasManagementPosts = (person: CompanyPerson): boolean =>
  person.memberships.some(manages);

/** 离岗确认框和按钮的字，跟着选的方式走。 */
export const offboardWords = (
  mode: OffboardMode,
): { readonly title: string; readonly confirm: string; readonly button: string } =>
  mode === "EXIT_ALL"
    ? { title: "所有项目都退场", confirm: "确认退场", button: "全部退场" }
    : { title: "收回管理职务", confirm: "确认收回", button: "收回管理职务" };

/**
 * 任职变化记录，新的在前。只有最新一条是现在的样子（写状态）；更早的都已被后来的变更取代，
 * 写成“某天 至 某天 身份”，不再写“在场”，免得看着像他现在还是项目管理员。
 */
export const historyLines = (
  history: CompanyPersonMembership["history"],
): readonly string[] =>
  history.map((row, index) => {
    const role = `${displayProjectRole(row.projectRoleLabel)}${row.teamName ? `，${row.teamName}` : ""}`;
    const from = formatChinaDate(row.recordedAt);
    if (index === 0) return `${from} 起 ${role}，${membershipStatus(row).text}`;
    return `${from} 至 ${formatChinaDate(history[index - 1]!.recordedAt)} ${role}${row.status === "SUSPENDED" ? "，暂停" : ""}`;
  });
