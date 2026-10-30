import type { RoleCode } from "../services/auth.types";
import type { ProjectParticipant } from "../services/management.types";

export type PermissionCategory = "WORKER" | "MANAGEMENT";
export type ProjectPermissionRole = Extract<
  RoleCode,
  "WORKER" | "TEAM_LEADER" | "PROJECT_ADMIN"
>;
export type PermissionLevel = {
  readonly roleCode: RoleCode;
  readonly level: number;
  readonly label: string;
  readonly name: string;
  readonly category: PermissionCategory;
  readonly scope: string;
  readonly functions: string;
  readonly planned: string | null;
};

export const PERMISSION_LEVELS: readonly PermissionLevel[] = [
  {
    roleCode: "WORKER",
    level: 1,
    label: "一级 · 个人权限",
    name: "普通工人",
    category: "WORKER",
    scope: "本人",
    functions:
      "微信绑定、本人资料、人脸录入、定位与活体打卡、本人考勤、补卡申请",
    planned: "查看本人项目评分",
  },
  {
    roleCode: "TEAM_LEADER",
    level: 2,
    label: "二级 · 班组权限",
    name: "带班工人／班组长",
    category: "WORKER",
    scope: "被分配的班组",
    functions: "个人功能、班组人员、班组考勤、缺勤与异常、补卡审批",
    planned: null,
  },
  {
    roleCode: "PROJECT_ADMIN",
    level: 3,
    label: "三级 · 项目管理",
    name: "项目负责人／项目管理员",
    category: "MANAGEMENT",
    scope: "被分配的项目",
    functions:
      "项目人员、班组与班组长、邀请绑定、人脸底照审核、排班、考勤围栏、项目报表、人员评分、月度 Excel 导出",
    planned: null,
  },
  {
    roleCode: "COMPANY_ADMIN",
    level: 4,
    label: "四级 · 公司管理",
    name: "公司负责人／公司管理员",
    category: "MANAGEMENT",
    scope: "本公司及所属项目",
    functions: "公司项目、创建项目、跨项目人员复用、公司考勤汇总、项目评分、公司 Excel 汇总",
    planned: "分配项目管理员、人员历史评分",
  },
  {
    roleCode: "SYSTEM_ADMIN",
    level: 5,
    label: "五级 · 平台管理",
    name: "超级管理员",
    category: "MANAGEMENT",
    scope: "整个平台",
    functions: "平台管理界面预览",
    planned: "公司管理、账号状态、公司管理员分配、平台规则、操作审计",
  },
];

export const permissionLevel = (roleCode: RoleCode): PermissionLevel => {
  const level: PermissionLevel | undefined = PERMISSION_LEVELS.find(
    (entry) => entry.roleCode === roleCode,
  );
  if (level === undefined)
    throw new Error(`Unknown permission role: ${roleCode}`);
  return level;
};
export const permissionLabel = (roleCode: RoleCode | null): string =>
  roleCode === null ? "待分配权限" : permissionLevel(roleCode).label;
export const permissionCategoryLabel = (
  category: PermissionCategory,
): string => (category === "WORKER" ? "工人权限" : "管理人员权限");

export const participantPermissionRole = (
  person: Pick<ProjectParticipant, "participantType" | "projectRoleLabel">,
): ProjectPermissionRole => {
  if (
    person.projectRoleLabel === "TEAM_LEADER" ||
    person.projectRoleLabel === "PROJECT_ADMIN"
  )
    return person.projectRoleLabel;
  if (person.participantType === "WORKER" || person.projectRoleLabel === "WORKER") return "WORKER";
  throw new Error("人员权限配置无效，请联系管理员核对项目岗位。");
};
