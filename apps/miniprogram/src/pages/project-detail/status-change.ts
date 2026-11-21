import type { ProjectStatus } from "../../services/management.types";

// 项目设置里改状态时的确认框，不碰界面，方便单测。

export type StatusConfirm = {
  readonly title: string;
  readonly content: string;
  readonly confirmText: string;
};

/**
 * 从别的状态改成“已暂停”或“已完工”要先确认：这两种状态下不能打卡，
 * 首页和日报不算应到，排班只能看不能改，用工资料、底照也不算待办。
 * 改回进行中、筹备中，或者状态没变，不用问（返回 null）。
 */
export const statusChangeConfirm = (
  from: ProjectStatus,
  to: ProjectStatus,
): StatusConfirm | null => {
  if (from === to || (to !== "SUSPENDED" && to !== "COMPLETED")) return null;
  const effect =
    "保存后项目里的人不能再打卡，公司首页和日报不再算这个项目的应到人数，排班只能看不能改，用工资料和底照也不再算待办。已有的考勤记录都保留。";
  return to === "COMPLETED"
    ? {
        title: "项目改为已完工？",
        content: `${effect}以后要恢复，可以把状态改回进行中。`,
        confirmText: "改为已完工",
      }
    : {
        title: "项目改为已暂停？",
        content: `${effect}复工时把状态改回进行中。`,
        confirmText: "改为已暂停",
      };
};
