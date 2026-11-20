import { displayProjectRole } from "../../routing/features";
import type { TransferRequest } from "../../services/transfers";
import { formatChinaDate } from "../../services/time";

// 调人申请页要写的几行字，不碰界面，方便单测。

/** “从 城市更新 调到 滨江花园一期”。 */
export const transferRoute = (
  row: Pick<TransferRequest, "sourceProjectName" | "targetProjectName">,
): string => `从 ${row.sourceProjectName} 调到 ${row.targetProjectName}`;

/** 在新项目的岗位：身份或岗位名，加上班组。 */
export const transferPost = (
  row: Pick<TransferRequest, "projectRoleLabel" | "teamName">,
): string =>
  [displayProjectRole(row.projectRoleLabel), row.teamName ?? "不分班组"].join("，");

/** 谁什么时候申请的；办完的再写谁处理的。 */
export const transferWho = (
  row: Pick<
    TransferRequest,
    "requestedByName" | "createdAt" | "reviewedByName" | "reviewedAt" | "status"
  >,
): string => {
  const asked = `${row.requestedByName ?? "项目管理员"} ${formatChinaDate(row.createdAt)} 申请`;
  if (row.status === "PENDING" || row.reviewedAt === null) return asked;
  return `${asked}，${row.reviewedByName ?? "公司管理员"} ${formatChinaDate(row.reviewedAt)} ${row.status === "APPROVED" ? "同意" : "没同意"}`;
};
