import type { StatusKind } from "../../components/ui/status-kind";
import { FEATURES, displayProjectRole, type Feature } from "../../routing/features";
import { formatChinaDate, formatChinaHm } from "../../services/time";
import type {
  CompanyAdmin,
  CompanyForm,
  PlatformAccount,
  PlatformAccountRole,
  PlatformCompany,
  PlatformCompanyDetail,
} from "../../services/workflows";

/** 平台管理现在显示哪一屏。四个标签在“列表”里，其余三屏各有自己的标题和返回。 */
export type SystemScreen = "list" | "company" | "new-company" | "account";

export const systemScreen = (input: {
  /** 点开了一个账号。 */
  readonly hasAccount: boolean;
  /** 点了“新增公司”。 */
  readonly addingCompany: boolean;
  /** 点开的公司还在不在。 */
  readonly hasCompany: boolean;
}): SystemScreen =>
  input.hasAccount
    ? "account"
    : input.addingCompany
      ? "new-company"
      : input.hasCompany
        ? "company"
        : "list";

/** 公司那一行的副行：“3 个进行中项目，管理员：张三、李四”；没有管理员由右侧的红点说。 */
export const companyRowSub = (
  company: Pick<PlatformCompany, "activeProjectCount" | "projectCount" | "admins">,
): string => {
  const projects =
    company.projectCount === 0
      ? "还没有项目"
      : `${company.activeProjectCount} 个进行中项目`;
  return company.admins.length === 0
    ? projects
    : `${projects}，管理员：${company.admins.map((admin) => admin.name).join("、")}`;
};

/**
 * 右侧状态：没有管理员的公司标红，排在暂停前面（没人管比暂停更要紧）。
 * 正常的公司不写，副行的管理员姓名才放得下。
 */
export const companyRowStatus = (
  company: Pick<PlatformCompany, "admins" | "status">,
): { readonly kind: StatusKind; readonly text: string } | undefined =>
  company.admins.length === 0
    ? { kind: "bad", text: "没有管理员" }
    : company.status === "ACTIVE"
      ? undefined
      : { kind: "warn", text: "已暂停" };

/** 管理员那一行的副行：手机号，绑定了没有，邀请码到哪天。 */
export const companyAdminSub = (
  admin: Pick<CompanyAdmin, "phone" | "isBound" | "invitation">,
): string => {
  if (admin.isBound) return `${admin.phone}，已绑定微信`;
  const invitation = admin.invitation;
  if (invitation === null || invitation.status === "REVOKED")
    return `${admin.phone}，还没绑定微信`;
  if (invitation.status === "EXPIRED") return `${admin.phone}，邀请码已过期`;
  return `${admin.phone}，等他用邀请码绑定，${formatChinaDate(invitation.expiresAt).slice(5)} 前有效`;
};

// “进入公司”打开的是公司管理员的那些页面，每个都带上 companyId。补卡审批、打卡安排、
// 信用规则不按公司分，不放进来。
const COMPANY_PAGES: readonly string[] = [
  "/pages/company-projects/index",
  "/pages/company-people/index",
  "/pages/company-admins/index",
  "/pages/project-health/index",
  "/pages/transfer-approvals/index",
  "/pages/company-reports/index",
  "/pages/audit-log/index",
  "/pages/company-settings/index",
  "/pages/create-project/index",
];

/** 进入一家公司：和公司管理员一样的宫格，链接里带着这家公司。 */
export const companyEntries = (companyId: string): readonly Feature[] =>
  COMPANY_PAGES.flatMap((url) =>
    FEATURES.companyAdmin
      .filter((feature) => feature.url === url)
      .map((feature) => ({
        ...feature,
        url: `${feature.url}?companyId=${encodeURIComponent(companyId)}`,
      })),
  );

/** 表单里的公司资料，输入框用的都是字符串。 */
export type CompanyDraft = { readonly [key in keyof CompanyForm]: string };

export const EMPTY_COMPANY_DRAFT: CompanyDraft = {
  address: "",
  contactName: "",
  contactPhone: "",
  creditCode: "",
  name: "",
  shortName: "",
};

export const companyDraftOf = (company: PlatformCompanyDetail): CompanyDraft => ({
  address: company.address ?? "",
  contactName: company.contactName ?? "",
  contactPhone: company.contactPhone ?? "",
  creditCode: company.creditCode ?? "",
  name: company.name,
  shortName: company.shortName ?? "",
});

/** 去掉两头空格，空着的写 null；信用代码统一大写。 */
export const companyFormOf = (draft: CompanyDraft): CompanyForm => {
  const text = (value: string): string | null => value.trim() || null;
  return {
    address: text(draft.address),
    contactName: text(draft.contactName),
    contactPhone: text(draft.contactPhone),
    creditCode: text(draft.creditCode)?.toUpperCase() ?? null,
    name: draft.name.trim(),
    shortName: text(draft.shortName),
  };
};

/** 和服务器同样的规矩先在手机上查一遍；没问题返回 null。 */
export const companyFormProblem = (form: CompanyForm): string | null => {
  if (form.name === "") return "请填写公司名称。";
  if (form.creditCode !== null && !/^[0-9A-HJ-NP-RTUW-Y]{18}$/.test(form.creditCode))
    return "统一社会信用代码是 18 位数字和大写字母，不含 I、O、S、V、Z，请核对。";
  if (form.contactPhone !== null && !/^(?:1\d{10}|0\d{2,3}-?\d{7,8})$/.test(form.contactPhone))
    return "联系电话请填手机号或带区号的座机。";
  return null;
};

/** 账号那一行的副行：最高身份（几项身份），手机号。 */
export const accountRowSub = (
  account: Pick<PlatformAccount, "highestRoleCode" | "phone" | "roleCount">,
): string => {
  const roles =
    account.highestRoleCode === null
      ? "还没有身份"
      : account.roleCount > 1
        ? `${displayProjectRole(account.highestRoleCode)}等 ${account.roleCount} 项身份`
        : displayProjectRole(account.highestRoleCode);
  return account.phone === null ? roles : `${roles}，${account.phone}`;
};

/** 只有停用的写状态，正常的不写，副行才放得下。 */
export const accountRowStatus = (
  account: Pick<PlatformAccount, "status">,
): { readonly kind: StatusKind; readonly text: string } | undefined =>
  account.status === "DISABLED" ? { kind: "bad", text: "已停用" } : undefined;

/** “11-18 10:20”；没登录过写“还没有”。 */
export const accountLastLogin = (account: Pick<PlatformAccount, "lastLoginAt">): string =>
  account.lastLoginAt === null ? "还没有" : auditTime(account.lastLoginAt);

/** 点一条身份去哪：公司任命打开平台里的公司详情；项目、班组身份打开他在那个项目的人员资料。 */
export type AccountRoleTarget =
  | { readonly kind: "company"; readonly companyId: string; readonly name: string }
  | { readonly kind: "page"; readonly url: string };

export const accountRoleTarget = (role: PlatformAccountRole): AccountRoleTarget | null => {
  if (role.source === "COMPANY_APPOINTMENT")
    return role.companyId === null ? null : { kind: "company", companyId: role.companyId, name: role.scopeName };
  if (role.source !== "PROJECT_MEMBERSHIP" || role.projectId === null) return null;
  const project = `projectId=${encodeURIComponent(role.projectId)}`;
  return role.memberId === null
    ? { kind: "page", url: `/pages/participants/index?${project}` }
    : { kind: "page", url: `/pages/person-form/index?${project}&memberId=${encodeURIComponent(role.memberId)}` };
};

/** “11-18 10:20”，按中国时间。 */
export const auditTime = (createdAt: string): string =>
  Number.isNaN(Date.parse(createdAt))
    ? ""
    : `${formatChinaDate(createdAt).slice(5)} ${formatChinaHm(createdAt)}`;
