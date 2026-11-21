import type { TeamLeaderChange } from "../../services/workflows";
import { formatChinaDate, formatChinaHm } from "../../services/time";

const when = (iso: string): string => {
  const [, month, day] = formatChinaDate(iso).split("-");
  return `${Number(month)}月${Number(day)}日 ${formatChinaHm(iso)}`;
};

/**
 * 负责人变更的一行：标题说从谁换成谁，副行说什么时候、谁办的；
 * 人员调动自动取消的，副行说清原因。
 */
export const leaderChangeLine = (
  change: TeamLeaderChange,
): { readonly title: string; readonly sub: string } => {
  const before = change.previousLeaderName;
  const after = change.leaderName;
  const title =
    before !== null && after !== null
      ? `${before} 换成 ${after}`
      : after !== null
        ? `指定 ${after}`
        : before !== null
          ? `取消 ${before}`
          : "取消负责人";
  const cause =
    change.reason === "MEMBER_INACTIVE"
      ? "负责人暂停或退场，自动取消"
      : change.reason === "MEMBER_TRANSFERRED"
        ? "负责人换了班组或不再担任，自动取消"
        : change.reason === "MEMBER_OFFBOARDED"
          ? "负责人离岗，收回管理职务，自动取消"
          : null;
  const by = change.changedByName ? `${change.changedByName} 办理` : null;
  return {
    title,
    sub: [when(change.changedAt), cause ?? by].filter(Boolean).join("，"),
  };
};
