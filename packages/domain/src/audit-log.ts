// Operation log: which audit actions belong to which filter, what each entry
// is about, and the plain Chinese sentence shown for it. Shared by the API
// and the mini program's demo backend so both say the same thing.

export type AuditCategory = "PEOPLE" | "TEAM" | "ATTENDANCE" | "SAFETY" | "PROJECT" | "COMPANY" | "PLATFORM";

export const AUDIT_CATEGORIES: readonly {
  readonly value: AuditCategory;
  readonly label: string;
}[] = [
  { value: "PEOPLE", label: "人员" },
  { value: "TEAM", label: "班组和任务" },
  { value: "ATTENDANCE", label: "考勤和补卡" },
  { value: "SAFETY", label: "安全" },
  { value: "PROJECT", label: "项目设置" },
  { value: "COMPANY", label: "公司" },
];

/**
 * Platform actions (system admin plan Q9): accounts, super admins and the safety credit
 * policy, which belong to no company, plus what the platform did to one company. Not in
 * AUDIT_CATEGORIES: the project and company logs never offer it, only the platform log does
 * (auditCategoriesFor).
 */
export const PLATFORM_CATEGORY: { readonly value: AuditCategory; readonly label: string } = {
  value: "PLATFORM",
  label: "平台",
};

/** Only in the company log: company-level actions (建项目、导出、离岗、默认规则、公司资料). */
export const COMPANY_ONLY_CATEGORIES: readonly AuditCategory[] = ["COMPANY"];

/** Which operation log is read: one project's, one company's, or the whole platform's (phase 4). */
export type AuditLogKind = "PROJECT" | "COMPANY" | "PLATFORM";

/** The type filter each log offers: 公司 from the company log up, 平台 only on the platform. */
export const auditCategoriesFor = (
  kind: AuditLogKind,
): readonly { readonly value: AuditCategory; readonly label: string }[] =>
  kind === "PROJECT"
    ? AUDIT_CATEGORIES.filter((item) => !COMPANY_ONLY_CATEGORIES.includes(item.value))
    : kind === "COMPANY"
      ? AUDIT_CATEGORIES
      : [...AUDIT_CATEGORIES, PLATFORM_CATEGORY];

/**
 * What the platform did to one company. The company's own log files these under 公司 (its
 * people should see who created, renamed or suspended it); the platform log files them under
 * 平台 with the other platform actions (Q9).
 */
const PLATFORM_COMPANY_ACTIONS: readonly string[] = [
  "COMPANY_CREATED",
  "COMPANY_UPDATED",
  "COMPANY_ADMIN_APPOINTED",
  "COMPANY_ADMIN_REVOKED",
  "COMPANY_ADMIN_INVITATION_ISSUED",
  "COMPANY_SUSPENDED",
  "COMPANY_RESUMED",
];

const CATEGORY_ACTIONS: Readonly<Record<AuditCategory, readonly string[]>> = {
  PEOPLE: [
    "project.member.create",
    "project.member.update",
    "project.member.reuse",
    "PERSONNEL_TRANSFER_REQUESTED",
    "PERSONNEL_TRANSFER_APPROVED",
    "PERSONNEL_TRANSFER_REJECTED",
    "WORKER_REGISTRATION_VERIFIED",
    "WORKER_REGISTRATION_VIEWED",
    "FACE_PROFILE_REVIEWED",
    "binding.invitation.create",
    "TEMPORARY_INVITATION_CREATED",
    "TEMPORARY_INVITATION_REVOKED",
    "TEMPORARY_INVITATION_ACCEPTED",
    "TEMPORARY_WORKER_EXIT_CONFIRMED",
  ],
  TEAM: [
    "team.update",
    "team.leader.cleared",
    "TEAM_TASK_CREATED",
    "TEAM_TASK_UPDATED",
    "TEAM_TASK_MEMBERS_ADDED",
    "TEAM_TASK_MEMBER_REMOVED",
    "TEAM_TASK_CLOSED",
    "TEAM_TASK_START_MAKEUP_REMINDED",
  ],
  ATTENDANCE: [
    "MAKEUP_APPROVED",
    "MAKEUP_REJECTED",
    "attendance.plan.save",
    "attendance.plan.inherit",
    "WORKTIME_RULE_SAVED",
    "report.export.requested",
    "report.export.downloaded",
  ],
  SAFETY: [
    "SAFETY_VIOLATION_REVIEWED",
    "SAFETY_APPEAL_REVIEWED",
    "TEAM_SAFETY_PUBLISHED",
    "TEAM_SAFETY_ISSUE_CREATED",
    "TEAM_SAFETY_ISSUE_RESOLVED",
  ],
  // 建项目 is a company action (company plan): it is only under COMPANY, so an entry's
  // category always matches the filter that finds it.
  PROJECT: ["project.update"],
  // Listed after the others, so auditCategoryOf keeps exports under ATTENDANCE;
  // the COMPANY filter still finds them.
  COMPANY: [
    "project.create",
    "report.export.requested",
    "report.export.downloaded",
    "PERSONNEL_OFFBOARDED",
    "COMPANY_DEFAULTS_SAVED",
    "COMPANY_PROFILE_UPDATED",
    // Platform actions on one company (system admin plan, phase 1).
    "COMPANY_CREATED",
    "COMPANY_UPDATED",
    "COMPANY_ADMIN_APPOINTED",
    "COMPANY_ADMIN_REVOKED",
    "COMPANY_ADMIN_INVITATION_ISSUED",
    // Phase 3: suspending makes the company read-only (Q5).
    "COMPANY_SUSPENDED",
    "COMPANY_RESUMED",
  ],
  PLATFORM: [
    "ACCOUNT_DISABLED",
    "ACCOUNT_ENABLED",
    "SYSTEM_ADMIN_GRANTED",
    "SYSTEM_ADMIN_REVOKED",
    // Phase 4: the one platform-wide policy (level-4 Q7).
    "SAFETY_POLICY_PUBLISHED",
    // Phase 5: the home announcement and the platform support phone (Q12).
    "PLATFORM_SETTINGS_UPDATED",
  ],
};

/** The actions a category filter keeps in the given log (project and company logs by default). */
export const auditActionsIn = (
  category: AuditCategory,
  kind: AuditLogKind = "COMPANY",
): readonly string[] => {
  if (kind !== "PLATFORM") return CATEGORY_ACTIONS[category];
  if (category === "PLATFORM") return [...CATEGORY_ACTIONS.PLATFORM, ...PLATFORM_COMPANY_ACTIONS];
  if (category === "COMPANY")
    return CATEGORY_ACTIONS.COMPANY.filter((action) => !PLATFORM_COMPANY_ACTIONS.includes(action));
  return CATEGORY_ACTIONS[category];
};

export const auditCategoryOf = (
  action: string,
  kind: AuditLogKind = "COMPANY",
): AuditCategory | null =>
  kind === "PLATFORM" && PLATFORM_COMPANY_ACTIONS.includes(action)
    ? "PLATFORM"
    : ((Object.keys(CATEGORY_ACTIONS) as AuditCategory[]).find((category) =>
        CATEGORY_ACTIONS[category].includes(action),
      ) ?? null);

/** What an entry is about, so its name can be looked up for the sentence. */
export type AuditTargetRef =
  | { readonly kind: "member"; readonly id: string }
  | {
      readonly kind: "profile";
      readonly participantType: "WORKER" | "MANAGER";
      readonly id: string;
    }
  | { readonly kind: "violation"; readonly id: string }
  | { readonly kind: "team"; readonly id: string }
  | { readonly kind: "task"; readonly id: string };

type Metadata = Readonly<Record<string, unknown>>;
const text = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;
const ownerType = (value: unknown): "WORKER" | "MANAGER" =>
  value === "MANAGER" ? "MANAGER" : "WORKER";

export const auditTargetRef = (entry: {
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly metadata: unknown;
}): AuditTargetRef | null => {
  const meta: Metadata =
    typeof entry.metadata === "object" && entry.metadata !== null
      ? (entry.metadata as Metadata)
      : {};
  const id = (value: unknown, make: (id: string) => AuditTargetRef) => {
    const found = text(value);
    return found === null ? null : make(found);
  };
  const member = (value: unknown) =>
    id(value, (found) => ({ kind: "member", id: found }));
  const team = (value: unknown) =>
    id(value, (found) => ({ kind: "team", id: found }));
  const task = (value: unknown) =>
    id(value, (found) => ({ kind: "task", id: found }));
  switch (entry.action) {
    case "project.member.create":
    case "project.member.update":
    case "project.member.reuse":
    case "TEMPORARY_WORKER_EXIT_CONFIRMED":
      return member(entry.entityId);
    case "WORKER_REGISTRATION_VERIFIED":
    case "WORKER_REGISTRATION_VIEWED":
      return member(meta.memberId);
    case "PERSONNEL_OFFBOARDED":
      return id(entry.entityId, (found) => ({
        kind: "profile",
        participantType: ownerType(meta.participantType),
        id: found,
      }));
    case "TEMPORARY_INVITATION_ACCEPTED":
      return task(meta.taskId);
    case "COMPANY_ADMIN_APPOINTED":
    case "COMPANY_ADMIN_REVOKED":
    case "COMPANY_ADMIN_INVITATION_ISSUED":
      return id(meta.managerProfileId, (found) => ({
        kind: "profile",
        participantType: "MANAGER",
        id: found,
      }));
    case "ACCOUNT_DISABLED":
    case "ACCOUNT_ENABLED":
      return id(meta.profileId, (found) => ({
        kind: "profile",
        participantType: ownerType(meta.participantType),
        id: found,
      }));
    case "SYSTEM_ADMIN_GRANTED":
    case "SYSTEM_ADMIN_REVOKED":
      return id(meta.managerProfileId, (found) => ({
        kind: "profile",
        participantType: "MANAGER",
        id: found,
      }));
    case "PERSONNEL_TRANSFER_APPROVED":
      return member(meta.createdMemberId);
    case "PERSONNEL_TRANSFER_REQUESTED":
      return id(meta.profileId, (found) => ({
        kind: "profile",
        participantType: ownerType(meta.participantType),
        id: found,
      }));
    case "MAKEUP_APPROVED":
    case "MAKEUP_REJECTED":
      return id(meta.participantId, (found) => ({
        kind: "profile",
        participantType: ownerType(meta.participantType),
        id: found,
      }));
    case "FACE_PROFILE_REVIEWED":
      return id(meta.ownerId, (found) => ({
        kind: "profile",
        participantType: ownerType(meta.ownerType),
        id: found,
      }));
    case "SAFETY_VIOLATION_REVIEWED":
      return id(entry.entityId, (found) => ({ kind: "violation", id: found }));
    case "SAFETY_APPEAL_REVIEWED":
      return id(meta.violationId, (found) => ({ kind: "violation", id: found }));
    case "team.update":
    case "team.leader.cleared":
      return team(entry.entityId);
    case "TEAM_SAFETY_PUBLISHED":
    case "TEAM_SAFETY_ISSUE_CREATED":
    case "TEAM_SAFETY_ISSUE_RESOLVED":
      return team(meta.teamId);
    case "TEAM_TASK_CREATED":
    case "TEAM_TASK_UPDATED":
    case "TEAM_TASK_MEMBERS_ADDED":
    case "TEAM_TASK_MEMBER_REMOVED":
    case "TEAM_TASK_CLOSED":
    case "TEAM_TASK_START_MAKEUP_REMINDED":
      return task(entry.entityId);
    case "TEMPORARY_INVITATION_CREATED":
    case "TEMPORARY_INVITATION_REVOKED":
      return task(meta.taskId);
    default:
      return null;
  }
};

/** Company fields named in a COMPANY_UPDATED entry's metadata.changed. */
const COMPANY_FIELD_NAMES: Readonly<Record<string, string>> = {
  address: "地址",
  contactName: "联系人",
  contactPhone: "联系电话",
  creditCode: "信用代码",
  name: "名称",
  shortName: "简称",
};

const PLATFORM_SETTING_NAMES: Readonly<Record<string, string>> = {
  announcement: "首页公告",
  supportPhone: "平台联系电话",
};

/**
 * One entry as a sentence: “王经理 批准了 张建国 的补卡申请”.
 * actor and target are display names (null when unknown); the time is shown
 * separately next to the sentence.
 */
export const auditSentence = (
  entry: { readonly action: string; readonly metadata: unknown },
  actor: string | null,
  target: string | null,
): string => {
  const meta: Metadata =
    typeof entry.metadata === "object" && entry.metadata !== null
      ? (entry.metadata as Metadata)
      : {};
  const who = actor ?? "系统";
  const person = target ?? "一名人员";
  const teamText = target === null ? "一个班组" : `班组“${target}”`;
  const taskText = target === null ? "一项任务" : `任务“${target}”`;
  const phrase = ((): string => {
    switch (entry.action) {
      case "MAKEUP_APPROVED":
        return `批准了 ${person} 的补卡申请`;
      case "MAKEUP_REJECTED":
        return `驳回了 ${person} 的补卡申请`;
      case "project.member.create":
        return `新增了人员 ${person}`;
      case "project.member.update":
        return meta.via === "OFFBOARD"
          ? `为离岗调整了 ${person} 在本项目的身份`
          : `修改了 ${person} 的人员资料`;
      case "project.member.reuse":
        return `从其他项目调入了 ${person}`;
      case "PERSONNEL_TRANSFER_REQUESTED":
        return `申请从其他项目调入 ${person}`;
      case "PERSONNEL_TRANSFER_APPROVED":
        return meta.mode === "MOVE"
          ? `同意了调入 ${person}，原项目办了退场`
          : `同意了调入 ${person} 的申请`;
      case "PERSONNEL_TRANSFER_REJECTED":
        return "拒绝了一条调人申请";
      case "WORKER_REGISTRATION_VERIFIED":
        return meta.status === "NEEDS_UPDATE"
          ? `要求 ${person} 更正用工资料`
          : `核实了 ${person} 的用工资料`;
      case "WORKER_REGISTRATION_VIEWED":
        return `查看了 ${person} 的用工资料`;
      case "PERSONNEL_OFFBOARDED": {
        const count = Array.isArray(meta.projectIds) ? meta.projectIds.length : 0;
        const where = count > 0 ? ` ${count} 个项目` : "本公司各项目";
        return meta.mode === "EXIT_ALL"
          ? `让 ${person} 在${where}办了退场`
          : `收回了 ${person} 在${where}的管理职务`;
      }
      case "COMPANY_DEFAULTS_SAVED":
        return "保存了公司默认的打卡安排和工时规则";
      case "COMPANY_PROFILE_UPDATED":
        return "修改了公司资料";
      case "COMPANY_CREATED": {
        const name = text(meta.name);
        return name === null ? "创建了公司" : `创建了公司“${name}”`;
      }
      case "COMPANY_UPDATED": {
        const fields = (Array.isArray(meta.changed) ? meta.changed : [])
          .map((key: unknown) => (typeof key === "string" ? COMPANY_FIELD_NAMES[key] : undefined))
          .filter((name): name is string => name !== undefined);
        return fields.length === 0 ? "修改了公司资料" : `修改了公司的${fields.join("、")}`;
      }
      case "COMPANY_SUSPENDED":
      case "COMPANY_RESUMED": {
        const verb = entry.action === "COMPANY_SUSPENDED" ? "暂停" : "恢复";
        const name = text(meta.name);
        return name === null ? `${verb}了公司` : `${verb}了公司“${name}”`;
      }
      case "COMPANY_ADMIN_APPOINTED":
        return meta.invited === true
          ? `任命 ${person} 为公司管理员，并生成了邀请码`
          : `任命 ${person} 为公司管理员`;
      case "COMPANY_ADMIN_REVOKED":
        return `撤销了 ${person} 的公司管理员身份`;
      case "COMPANY_ADMIN_INVITATION_ISSUED":
        return `重新给 ${person} 生成了公司管理员邀请码`;
      case "ACCOUNT_DISABLED":
        return `停用了 ${person} 的账号`;
      case "ACCOUNT_ENABLED":
        return `恢复了 ${person} 的账号`;
      case "SYSTEM_ADMIN_GRANTED":
        return `${meta.source === "cli" ? "在服务器上" : ""}把 ${person} 设为超级管理员`;
      case "SYSTEM_ADMIN_REVOKED":
        return `${meta.source === "cli" ? "在服务器上" : ""}撤销了 ${person} 的超级管理员身份`;
      case "SAFETY_POLICY_PUBLISHED": {
        const version = typeof meta.version === "number" ? meta.version : null;
        const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text(meta.startsOn) ?? "");
        return version === null
          ? "发布了新的安全信用规则"
          : `发布了第 ${version} 版安全信用规则${
              day === null ? "" : `，${day[1]}年${Number(day[2])}月${Number(day[3])}日起执行`
            }`;
      }
      case "PLATFORM_SETTINGS_UPDATED": {
        const fields = (Array.isArray(meta.changed) ? meta.changed : [])
          .map((key: unknown) => (typeof key === "string" ? PLATFORM_SETTING_NAMES[key] : undefined))
          .filter((name): name is string => name !== undefined);
        return fields.length === 0 ? "保存了平台设置" : `修改了${fields.join("、")}`;
      }
      case "auth.bind.worker":
      case "auth.bind.manager":
        return "用邀请码绑定了微信";
      case "worker.registration.submit":
        return "提交了用工资料";
      case "TEST_ACCOUNT_LOGIN":
        return "用测试账号直接登录";
      case "FACE_PROFILE_REVIEWED":
        return meta.decision === "REJECTED"
          ? `退回了 ${person} 的人脸底照`
          : `通过了 ${person} 的人脸底照`;
      case "binding.invitation.create":
        return "生成了绑定邀请码";
      case "TEMPORARY_INVITATION_CREATED":
        return `给${taskText}邀请了临时工`;
      case "TEMPORARY_INVITATION_REVOKED":
        return `作废了${taskText}的临时工邀请码`;
      case "TEMPORARY_INVITATION_ACCEPTED":
        return `用邀请码加入了${target === null ? "一项临时任务" : `临时任务“${target}”`}`;
      case "TEMPORARY_WORKER_EXIT_CONFIRMED":
        return `确认临时工 ${person} 退场`;
      case "team.update":
        return `修改了${teamText}的资料`;
      case "team.leader.cleared":
        return `取消了${teamText}的负责人`;
      case "TEAM_TASK_CREATED":
        return `安排了${taskText}`;
      case "TEAM_TASK_UPDATED":
        return `修改了${taskText}`;
      case "TEAM_TASK_MEMBERS_ADDED":
        return `给${taskText}加了人`;
      case "TEAM_TASK_MEMBER_REMOVED":
        return `从${taskText}撤下了一人`;
      case "TEAM_TASK_CLOSED":
        return meta.status === "CANCELLED"
          ? `取消了${taskText}`
          : `确认${taskText}已完成`;
      case "TEAM_TASK_START_MAKEUP_REMINDED":
        return `提醒${taskText}里漏打开工卡的临时工申请补卡`;
      case "TEAM_SAFETY_PUBLISHED":
        return `给${teamText}发布了安全交底`;
      case "TEAM_SAFETY_ISSUE_CREATED":
        return `登记了${teamText}的安全隐患`;
      case "TEAM_SAFETY_ISSUE_RESOLVED":
        return `整改了${teamText}的安全隐患`;
      case "SAFETY_VIOLATION_REVIEWED":
        return `复核了 ${person} 的违规记录`;
      case "SAFETY_APPEAL_REVIEWED":
        return meta.accepted === true
          ? `采纳了 ${person} 的违规申诉`
          : `驳回了 ${person} 的违规申诉`;
      case "attendance.plan.save":
        return "保存了打卡安排";
      case "attendance.plan.inherit":
        return "把打卡安排改回沿用上级";
      case "WORKTIME_RULE_SAVED":
        return "保存了工时规则";
      case "report.export.requested":
        return "导出了月度考勤 Excel";
      case "report.export.downloaded":
        return "下载了月度考勤 Excel";
      case "project.create":
        return "创建了项目";
      case "project.update":
        return "修改了项目设置";
      default:
        return "做了一项其他操作";
    }
  })();
  return `${who} ${phrase}`;
};
