import type { SafetyCreditBoard, SafetyCreditRank } from "@construction/domain";

/** 页面顶上那句结论：本班平均多少分，有几条违规还在等审核。 */
export const creditHeadline = (
  board: Pick<SafetyCreditBoard, "workers" | "violations">,
): { readonly title: string; readonly sub: string } => {
  const pending = board.violations.filter(
    (row) => row.status === "PENDING",
  ).length;
  const sub =
    pending > 0 ? `${pending} 条违规等项目管理员审核` : "没有等审核的违规";
  if (board.workers.length === 0) return { title: "本班还没有工人", sub };
  const total = board.workers.reduce((sum, row) => sum + row.score, 0);
  return {
    title: `本班平均 ${Math.round(total / board.workers.length)} 分`,
    sub,
  };
};

/** 每个人名字下面的一行：违规几次，恢复了几分。 */
export const creditSub = (
  row: Pick<SafetyCreditRank, "confirmedViolationCount" | "recoveryPoints">,
): string => {
  const count =
    row.confirmedViolationCount > 0
      ? `累计 ${row.confirmedViolationCount} 次`
      : "没有违规";
  return row.recoveryPoints > 0
    ? `${count}，已恢复 ${row.recoveryPoints} 分`
    : count;
};
