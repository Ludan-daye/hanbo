import { displayProjectRole } from "../../routing/features";
import type { TransferRequest } from "../../services/transfers";
import { formatChinaDate } from "../../services/time";

// 调人申请页要写的几行字，不碰界面，方便单测。

/** “从 城市更新 调到 滨江花园一期”。 */
export const transferRoute = (
  row: Pick<TransferRequest, "sourceProjectName" | "targetProjectName">,
): string => `从 ${row.sourceProjectName} 调到 ${row.targetProjectName}`;

/**
 * 调走还是兼任。等处理时说同意后会怎样；办完了用过去时说结果：
 * 同意的调走“已调走，原项目于某天办退场”（进场前一天），没同意的说人还在原项目。
 */
export const transferModeText = (
  row: Pick<TransferRequest, "mode" | "sourceProjectName"> &
    Partial<Pick<TransferRequest, "enteredAt" | "status">>,
): string => {
  const move = row.mode === "MOVE";
  if (row.status === "APPROVED")
    return move
      ? `已调走，${row.sourceProjectName}${row.enteredAt ? `于 ${formatChinaDate(new Date(Date.parse(row.enteredAt) - 86_400_000).toISOString())} ` : ""}办退场`
      : `已兼任，${row.sourceProjectName}的身份照旧`;
  if (row.status === "REJECTED")
    return `未同意，仍在${row.sourceProjectName}（申请的是${move ? "调走" : "兼任"}）`;
  return move
    ? `调走：同意后在${row.sourceProjectName}办退场`
    : `兼任：${row.sourceProjectName}的身份照旧`;
};

/** 公司管理员处理时写的话：同意时是备注，未同意时是理由。没写就是 null。 */
export const transferReviewReason = (
  row: Pick<TransferRequest, "reviewReason" | "status">,
): string | null =>
  row.reviewReason
    ? `${row.status === "REJECTED" ? "未同意的理由" : "同意时的备注"}：${row.reviewReason}`
    : null;

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
  return `${asked}，${row.reviewedByName ?? "公司管理员"} ${formatChinaDate(row.reviewedAt)} ${row.status === "APPROVED" ? "同意" : "未同意"}`;
};
