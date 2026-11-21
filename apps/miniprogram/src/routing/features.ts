import type { PanelKey } from "./roleHome";
import type { LineIconName } from "../components/ui/line-icon";

export type Feature = {
  readonly title: string;
  readonly sub: string;
  readonly icon: LineIconName;
  readonly url: string;
};
// 本人的事（项目、任务、考勤、补卡）只放在 worker 这一组：工人在首页和“我的”里用，
// 管理人员在“我的”里用。其余各组是工作台的内容，只放管理的事。
const MY_PROJECTS: Feature = {
  title: "我的项目",
  sub: "按项目查看安排与打卡",
  icon: "building",
  url: "/pages/my-projects/index",
};
const RECORDS: Feature = {
  title: "我的考勤",
  sub: "查看每日打卡与出勤",
  icon: "calendar",
  url: "/pages/my-records/index",
};
const MAKEUPS: Feature = {
  title: "补卡申请",
  sub: "提交申请、查看处理进度",
  icon: "doc",
  url: "/pages/my-makeups/index",
};
const APPROVALS: Feature = { title: "补卡审批", sub: "处理授权范围内下级的申请", icon: "check", url: "/pages/team-makeups/index" };
const SAFETY_REVIEW: Feature = { title: "违规复核", sub: "违规记录与信用申诉", icon: "shield", url: "/pages/safety-review/index" };
export const PANEL_LABELS: Readonly<Record<PanelKey, string>> = {
  worker: "普通工人",
  teamLeader: "班组长",
  projectAdmin: "项目管理员",
  companyAdmin: "公司管理员",
  systemAdmin: "超级管理员",
  none: "待分配角色",
};
export const FEATURES: Readonly<Record<PanelKey, readonly Feature[]>> = {
  worker: [MY_PROJECTS, { title: "我的任务", sub: "工作安排、安全交底与临时邀请", icon: "task", url: "/pages/my-tasks/index" }, RECORDS, MAKEUPS],
  teamLeader: [
    { title: "工作安排", sub: "安排工人，邀请临时工", icon: "task", url: "/pages/team-work/index" },
    { title: "班组安全", sub: "安全交底和隐患整改", icon: "shield", url: "/pages/team-safety/index" },
    { title: "班组日报", sub: "自动汇总出勤和工作", icon: "doc", url: "/pages/team-log/index" },
    { title: "打卡安排", sub: "设置本班组的打卡要求", icon: "clock", url: "/pages/schedules/index" },
    {
      title: "补卡审批",
      sub: "处理本班组的补卡申请",
      icon: "check",
      url: "/pages/team-makeups/index",
    },
    {
      title: "班组考勤",
      sub: "日报、周报和月报",
      icon: "chart",
      url: "/pages/team-attendance/index",
    },
  ],
  projectAdmin: [
    APPROVALS,
    SAFETY_REVIEW,
    { title: "底照审核", sub: "审核成员提交的人脸底照", icon: "face", url: "/pages/face-review/index" },
    { title: "工时规则", sub: "项目类型、午休与加班时段", icon: "clock", url: "/pages/project-worktime/index" },
    {
      title: "项目人员",
      sub: "人员资料、工种与班组",
      icon: "users",
      url: "/pages/participants/index",
    },
    {
      title: "考勤报表",
      sub: "日、周、月考勤汇总",
      icon: "chart",
      url: "/pages/reports/index",
    },
    {
      title: "邀请绑定",
      sub: "为项目成员生成邀请码",
      icon: "key",
      url: "/pages/invitation/index",
    },
    {
      title: "班组管理",
      sub: "创建班组、分配成员与管理邀请",
      icon: "grid",
      url: "/pages/project-management/index",
    },
    {
      title: "班组现场",
      sub: "替组长安排工作、交底、看日报、登记违规",
      icon: "task",
      url: "/pages/team-site/index",
    },
    {
      title: "打卡安排",
      sub: "设置下级打卡次数与时间",
      icon: "calendar",
      url: "/pages/schedules/index",
    },
    {
      title: "操作记录",
      sub: "谁在什么时候做了什么",
      icon: "doc",
      url: "/pages/audit-log/index",
    },
    {
      title: "项目设置",
      sub: "管理项目状态与考勤位置",
      icon: "gear",
      url: "/pages/project-detail/index",
    },
  ],
  companyAdmin: [
    APPROVALS,
    { title: "打卡安排", sub: "设置授权项目下级的打卡要求", icon: "clock", url: "/pages/schedules/index" },
    {
      title: "公司项目",
      sub: "查看在建与筹备中的项目",
      icon: "building",
      url: "/pages/company-projects/index",
    },
    {
      title: "调人申请",
      sub: "项目之间调人，由你同意",
      icon: "users",
      url: "/pages/transfer-approvals/index",
    },
    {
      title: "项目负责人",
      sub: "各项目的管理员，任免和离岗",
      icon: "users",
      url: "/pages/company-admins/index",
    },
    {
      title: "公司设置",
      sub: "新项目默认的打卡和工时，公司资料",
      icon: "gear",
      url: "/pages/company-settings/index",
    },
    { title: "信用规则", sub: "扣分与恢复标准（只读）", icon: "star", url: "/pages/safety-policy/index" },
    {
      title: "公司人员",
      sub: "跨项目人员与班组总览",
      icon: "users",
      url: "/pages/company-people/index",
    },
    {
      title: "新建项目",
      sub: "设置项目与考勤范围",
      icon: "plus",
      url: "/pages/create-project/index",
    },
    {
      title: "公司报表",
      sub: "汇总公司的出勤与工时",
      icon: "chart",
      url: "/pages/company-reports/index",
    },
    {
      title: "操作记录",
      sub: "各项目里谁在什么时候做了什么",
      icon: "doc",
      url: "/pages/audit-log/index",
    },
  ],
  systemAdmin: [
    APPROVALS,
    { title: "信用规则", sub: "扣分与恢复标准", icon: "star", url: "/pages/safety-policy/index" },
    { title: "打卡安排", sub: "设置授权范围内下级的打卡要求", icon: "clock", url: "/pages/schedules/index" },
    {
      title: "平台管理",
      sub: "公司、账号权限与平台设置",
      icon: "gear",
      url: "/pages/system-management/index",
    },
  ],
  none: [],
};

const PROJECT_ROLE_LABELS: Readonly<Record<string, string>> = {
  TEAM_LEADER: "班组长",
  PROJECT_ADMIN: "项目管理员",
  COMPANY_ADMIN: "公司管理员",
  SYSTEM_ADMIN: "超级管理员",
  WORKER: "普通工人",
};
export const displayProjectRole = (value: string): string =>
  PROJECT_ROLE_LABELS[value] ?? value;
