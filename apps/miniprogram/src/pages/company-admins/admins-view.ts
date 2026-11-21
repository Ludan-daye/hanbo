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
        ? `在 ${projects.join("、")} 办退场，账号收回${projects.length === 1 ? "这个项目" : `这 ${projects.length} 个项目`}的权限。考勤、补卡记录都保留。`
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

type HistoryRow = CompanyPersonMembership["history"][number];

const laterDay = (a: string, b: string): string => (a > b ? a : b);
const earlierDay = (a: string, b: string): string => (a < b ? a : b);

/**
 * 任职变化记录，新的在前，一个身份一段一行（同一身份只是改了退场、考勤等不另起一行）。
 * 日期用任职本身的进场、退场日：最早一段从进场日起，后面换身份的从记下变更那天起（不早于进场日），
 * 退场的一段止于退场日。只有最新一段写现状（在场／暂停／已退场）；更早的都已被后来的变更取代，
 * 写成“某天 至 某天 身份”，不写“在场”，免得看着像他现在还是项目管理员。
 * 记录最多带 20 条，再早的变更看不到时最早一段的起点按进场日算。
 */
export const historyLines = (
  history: CompanyPersonMembership["history"],
): readonly string[] => {
  const periods: HistoryRow[][] = [];
  for (const row of [...history].reverse()) {
    const current = periods[periods.length - 1];
    const last = current?.[current.length - 1];
    const sameRole =
      last !== undefined &&
      last.projectRoleLabel === row.projectRoleLabel &&
      last.teamName === row.teamName &&
      // 退场后又进场是新的一段。
      !(last.status === "EXITED" && row.status !== "EXITED");
    if (current !== undefined && sameRole) current.push(row);
    else periods.push([row]);
  }
  const starts: string[] = [];
  periods.forEach((period, index) => {
    const first = period[0]!;
    const entered = formatChinaDate(first.enteredAt);
    let start = index === 0 ? entered : laterDay(formatChinaDate(first.recordedAt), entered);
    if (index > 0) start = laterDay(start, starts[index - 1]!);
    const end = period[period.length - 1]!;
    if (end.status === "EXITED" && end.exitedAt !== null)
      start = earlierDay(start, formatChinaDate(end.exitedAt));
    starts.push(start);
  });
  return periods
    .map((period, index) => {
      const end = period[period.length - 1]!;
      const role = `${displayProjectRole(end.projectRoleLabel)}${end.teamName ? `，${end.teamName}` : ""}`;
      const start = starts[index]!;
      const exited = end.status === "EXITED";
      const exitDay = exited ? formatChinaDate(end.exitedAt ?? end.recordedAt) : null;
      if (index === periods.length - 1)
        return exitDay === null
          ? `${start} 起 ${role}，${membershipStatus(end).text}`
          : `${start} 至 ${exitDay} ${role}，已退场`;
      const until = exitDay ?? starts[index + 1]!;
      return `${start} 至 ${until} ${role}${end.status === "SUSPENDED" ? "，暂停" : ""}`;
    })
    .reverse();
};
