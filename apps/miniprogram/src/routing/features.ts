import type { PanelKey } from "./roleHome";
import type { IconName } from "../components/ui/icon";

export type Feature = {
  readonly title: string;
  readonly sub: string;
  readonly icon: IconName;
  readonly url: string;
};
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
  icon: "invite",
  url: "/pages/my-makeups/index",
};
const APPROVALS: Feature = { title: "补卡审批", sub: "处理授权范围内下级的申请", icon: "check", url: "/pages/team-makeups/index" };
export const PANEL_LABELS: Readonly<Record<PanelKey, string>> = {
  worker: "普通工人",
  teamLeader: "班组长",
  projectAdmin: "项目管理员",
  companyAdmin: "公司管理员",
  systemAdmin: "超级管理员",
  none: "待分配角色",
};
export const FEATURES: Readonly<Record<PanelKey, readonly Feature[]>> = {
  worker: [MY_PROJECTS, RECORDS, MAKEUPS],
  teamLeader: [
    { title: "打卡安排", sub: "设置本班组下级的打卡要求", icon: "calendar", url: "/pages/schedules/index" },
    {
      title: "补卡审批",
      sub: "处理本班组的补卡申请",
      icon: "check",
      url: "/pages/team-makeups/index",
    },
    {
      title: "团队考勤",
      sub: "掌握班组每日出勤",
      icon: "chart",
      url: "/pages/team-attendance/index",
    },
    MY_PROJECTS,
    RECORDS,
    MAKEUPS,
  ],
  projectAdmin: [
    APPROVALS,
    {
      title: "项目人员",
      sub: "人员资料、工种与班组",
      icon: "people",
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
      icon: "invite",
      url: "/pages/invitation/index",
    },
    {
      title: "班组管理",
      sub: "创建班组、分配成员与管理邀请",
      icon: "building",
      url: "/pages/project-management/index",
    },
    {
      title: "打卡安排",
      sub: "设置下级打卡次数与时间",
      icon: "calendar",
      url: "/pages/schedules/index",
    },
    {
      title: "项目设置",
      sub: "管理项目状态与考勤位置",
      icon: "settings",
      url: "/pages/project-detail/index",
    },
    MY_PROJECTS,
    RECORDS,
    MAKEUPS,
  ],
  companyAdmin: [
    APPROVALS,
    { title: "打卡安排", sub: "设置授权项目下级的打卡要求", icon: "calendar", url: "/pages/schedules/index" },
    {
      title: "公司项目",
      sub: "查看在建与筹备中的项目",
      icon: "building",
      url: "/pages/company-projects/index",
    },
    {
      title: "公司人员",
      sub: "跨项目人员与班组总览",
      icon: "people",
      url: "/pages/company-people/index",
    },
    {
      title: "新建项目",
      sub: "设置项目与考勤范围",
      icon: "invite",
      url: "/pages/create-project/index",
    },
    {
      title: "公司报表",
      sub: "汇总公司的出勤与工时",
      icon: "chart",
      url: "/pages/company-reports/index",
    },
  ],
  systemAdmin: [
    APPROVALS,
    { title: "打卡安排", sub: "设置授权范围内下级的打卡要求", icon: "calendar", url: "/pages/schedules/index" },
    {
      title: "平台管理",
      sub: "公司、账号权限与平台设置",
      icon: "shield",
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
