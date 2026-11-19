import type { SafetyBriefing, SafetyIssue } from "@construction/domain";

type Member = {
  readonly memberId: string;
  readonly displayName: string | null;
};

/** 在场工人里还没确认这条交底的人。 */
export const unconfirmedNames = (
  briefing: Pick<SafetyBriefing, "acknowledgements">,
  members: readonly Member[],
): readonly string[] =>
  members
    .filter(
      (person) =>
        !briefing.acknowledgements.some(
          (ack) => ack.memberId === person.memberId,
        ),
    )
    .map((person) => person.displayName ?? "姓名待补录");

/**
 * 一行的右侧放得下十个字左右：放得下就直接写名字，
 * 放不下只写人数，名单另外列出来（listed 为真）。
 */
export const namesInRow = (
  names: readonly string[],
): { readonly value: string; readonly listed: boolean } => {
  const text = names.join("、");
  return text.length <= 10
    ? { value: text, listed: false }
    : { value: `${names.length} 人`, listed: true };
};

/** 行标题只显示一行。说明写得长或者分了行，展开时要在下面放全文。 */
export const needsFullText = (text: string): boolean =>
  text.length > 12 || text.includes("\n");

export const severityStatus = (
  severity: SafetyIssue["severity"],
): { readonly kind: "bad" | "warn"; readonly text: string } =>
  severity === "SERIOUS"
    ? { kind: "bad", text: "严重" }
    : { kind: "warn", text: "一般" };

/**
 * 分出还没整改的和已经整改的，并决定展开哪一条：
 * 点过的那条；没点过或者那条已经不在了，就是第一条。
 */
export const arrangeIssues = (
  issues: readonly SafetyIssue[],
  openedId: string | null,
): {
  readonly waiting: readonly SafetyIssue[];
  readonly done: readonly SafetyIssue[];
  readonly active: SafetyIssue | null;
} => {
  const waiting = issues.filter((issue) => !issue.resolvedAt);
  const done = issues.filter((issue) => Boolean(issue.resolvedAt));
  return {
    waiting,
    done,
    active:
      waiting.find((issue) => issue.id === openedId) ?? waiting[0] ?? null,
  };
};
