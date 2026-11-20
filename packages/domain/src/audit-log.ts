// Operation log: which audit actions belong to which filter, what each entry
// is about, and the plain Chinese sentence shown for it. Shared by the API
// and the mini program's demo backend so both say the same thing.

export type AuditCategory = "PEOPLE" | "TEAM" | "ATTENDANCE" | "SAFETY" | "PROJECT";

export const AUDIT_CATEGORIES: readonly {
  readonly value: AuditCategory;
  readonly label: string;
}[] = [
  { value: "PEOPLE", label: "人员" },
  { value: "TEAM", label: "班组和任务" },
  { value: "ATTENDANCE", label: "考勤和补卡" },
  { value: "SAFETY", label: "安全" },
  { value: "PROJECT", label: "项目设置" },
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
  PROJECT: ["project.create", "project.update"],
};

/** The actions a category filter keeps. */
export const auditActionsIn = (category: AuditCategory): readonly string[] =>
  CATEGORY_ACTIONS[category];

export const auditCategoryOf = (action: string): AuditCategory | null =>
  (Object.keys(CATEGORY_ACTIONS) as AuditCategory[]).find((category) =>
    CATEGORY_ACTIONS[category].includes(action),
  ) ?? null;

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
      return member(meta.memberId);
    case "TEMPORARY_INVITATION_ACCEPTED":
      return task(meta.taskId);
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
        return `修改了 ${person} 的人员资料`;
      case "project.member.reuse":
        return `从其他项目调入了 ${person}`;
      case "PERSONNEL_TRANSFER_REQUESTED":
        return `申请从其他项目调入 ${person}`;
      case "PERSONNEL_TRANSFER_APPROVED":
        return `同意了调入 ${person} 的申请`;
      case "PERSONNEL_TRANSFER_REJECTED":
        return "拒绝了一条调人申请";
      case "WORKER_REGISTRATION_VERIFIED":
        return meta.status === "NEEDS_UPDATE"
          ? `要求 ${person} 更正用工资料`
          : `核实了 ${person} 的用工资料`;
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
