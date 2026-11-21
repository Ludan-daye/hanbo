import type { ManagedParticipant, ProjectStatus } from "../../services/management.types";

// 复用人员页要写的字，不碰界面，方便单测。

/**
 * 候选人在原项目的情况。原项目完工或停工了，人还挂着也不算“在场”：
 * 已退场的照写已退场，其余写原项目已完工／原项目停工；原项目进行中时按他本人的状态写。
 */
export const sourceStatus = (
  status: ManagedParticipant["status"],
  projectStatus?: ProjectStatus,
): string =>
  status === "EXITED"
    ? "原项目已退场"
    : projectStatus === "COMPLETED"
      ? "原项目已完工"
      : projectStatus === "SUSPENDED"
        ? "原项目停工"
        : status === "SUSPENDED"
          ? "原项目暂停"
          : "原项目在场";
