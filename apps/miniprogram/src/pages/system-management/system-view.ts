import { displayProjectRole } from "../../routing/features";
import {
  PERMISSION_LEVELS,
  permissionLevel,
} from "../../routing/permissionLevels";
import type { RoleCode } from "../../services/auth.types";
import type {
  CompanyProject,
  ProjectTeam,
} from "../../services/management.types";
import { formatChinaDate, formatChinaHm } from "../../services/time";
import type { Account, Company } from "../../services/workflows";

/** 平台管理现在显示哪一屏。四个标签在“列表”里，其余三屏各有自己的标题和返回。 */
export type SystemScreen = "list" | "company" | "new-company" | "account";

export const systemScreen = (input: {
  /** 点开了一个账号，正在改它的权限。 */
  readonly editingAccount: boolean;
  /** 点了“新增公司”。 */
  readonly addingCompany: boolean;
  /** 点开的公司还在不在。 */
  readonly hasCompany: boolean;
}): SystemScreen =>
  input.editingAccount
    ? "account"
    : input.addingCompany
      ? "new-company"
      : input.hasCompany
        ? "company"
        : "list";

export type ScopeOption = { readonly id: string; readonly name: string };

export const ROLE_OPTIONS: readonly RoleCode[] = PERMISSION_LEVELS.map(
  (level) => level.roleCode,
);

/** 这个等级能管的范围。班组名后面带上项目，不同项目里同名的班组才分得开。 */
export const scopeOptions = (
  role: RoleCode,
  companies: readonly Company[],
  projects: readonly CompanyProject[],
  teams: readonly ProjectTeam[],
): readonly ScopeOption[] =>
  role === "SYSTEM_ADMIN"
    ? [{ id: "GLOBAL", name: "全平台" }]
    : role === "COMPANY_ADMIN"
      ? companies
      : role === "TEAM_LEADER"
        ? teams.map((team) => {
            const project = projects.find((row) => row.id === team.projectId);
            return {
              id: team.id,
              name: project ? `${team.name}（${project.name}）` : team.name,
            };
          })
        : projects;

/** “三级 项目管理员”。 */
export const levelText = (role: RoleCode): string =>
  `${"一二三四五"[permissionLevel(role).level - 1]}级 ${displayProjectRole(role)}`;

/** 账号那一行的副行：身份，手机号。 */
export const accountSub = (
  account: Pick<Account, "roleCode" | "phone">,
): string => `${displayProjectRole(account.roleCode)}，${account.phone}`;

// 演示数据里的日志只记了“请求方式 路径”，这里换成一句人话。
const NAMED: ReadonlyArray<readonly [RegExp, string]> = [
  [/^POST \/system\/companies$/, "保存公司"],
  [/^PUT \/system\/accounts\//, "调整账号权限"],
  [/^PUT \/system\/settings$/, "修改平台设置"],
  [/^POST \/management\/companies\/[^/]+\/projects$/, "新建项目"],
  [/^POST \/management\/projects\/[^/]+\/participants$/, "添加成员"],
  [/^POST \/management\/projects\/[^/]+\/reused-participants$/, "复用人员"],
  [/^POST \/bindings\/projects\/[^/]+\/invitations$/, "生成邀请码"],
  [/^POST \/attendance\/projects\/[^/]+\/records$/, "打卡"],
  [/^POST \/makeups\/projects\/[^/]+\/requests$/, "申请补卡"],
  [/^POST \/makeups\/requests\/[^/]+\/approve$/, "通过补卡"],
  [/^POST \/makeups\/requests\/[^/]+\/reject$/, "驳回补卡"],
  [/^POST \/safety-credit\/policies$/, "发布信用规则"],
  [/^POST \/report-exports$/, "生成报表"],
  [/^POST \/auth\/logout$/, "退出登录"],
  [/^POST \/auth\/bind$/, "绑定微信"],
];
// 按路径开头分到一块业务；管理接口再按项目下面的那一段细分。
const AREAS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^\/system\//, "平台管理"],
  [/^\/management\/projects\/[^/]+\/[a-z-]*participants/, "项目人员"],
  [/^\/management\/projects\/[^/]+\/(teams|managed-teams)(\/|$)/, "班组"],
  [/^\/management\/projects\//, "项目资料"],
  [/^\/attendance\/planning\//, "打卡安排"],
  [/^\/attendance\//, "考勤"],
  [/^\/makeups\//, "补卡"],
  [/^\/safety-credit\//, "安全信用"],
  [/^\/worktime\//, "工时规则"],
  [/^\/team-work\//, "班组任务"],
  [/^\/face/, "人脸档案"],
  [/^\/bindings\//, "邀请码"],
  [/^\/account\//, "个人资料"],
  [/^\/uploads/, "照片"],
];
const VERBS: Readonly<Record<string, string>> = {
  POST: "提交",
  PUT: "修改",
  PATCH: "修改",
  DELETE: "删除",
};

/** 日志里“做了什么”。服务器已经写成一句话的原样显示。 */
export const describeAudit = (action: string): string => {
  const request = /^(POST|PUT|PATCH|DELETE) (\/[^?\s]*)/.exec(action);
  if (request === null) return action;
  const [, method, path] = request;
  const named = NAMED.find(([pattern]) => pattern.test(`${method} ${path}`));
  if (named) return named[1];
  const area = AREAS.find(([pattern]) => pattern.test(path));
  return `${VERBS[method]}${area ? area[1] : "数据"}`;
};

/** 日志里“谁做的”：能对上账号就写姓名。 */
export const auditActor = (
  actor: string,
  accounts: readonly Pick<Account, "id" | "name">[],
): string => accounts.find((row) => row.id === actor)?.name ?? actor;

/** “11-18 10:20”，按中国时间。 */
export const auditTime = (createdAt: string): string =>
  Number.isNaN(Date.parse(createdAt))
    ? ""
    : `${formatChinaDate(createdAt).slice(5)} ${formatChinaHm(createdAt)}`;
