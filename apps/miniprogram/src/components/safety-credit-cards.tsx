import { View } from "@tarojs/components";
import { useState } from "react";
import type {
  SafetyCreditPolicyView,
  SafetyViolationView,
} from "@construction/domain";
import { Button, CardMeta, CardTitle, Notice } from "./ui/index";
import { workTimestamp } from "./team-work-fields";
import { previewSafetyEvidence } from "../services/safety-credit";
import { errorMessage } from "../services/error-messages";

export const safetyStatusLabel = (
  status: SafetyViolationView["status"],
): string =>
  ({
    PENDING: "待审核",
    CONFIRMED: "已确认",
    REJECTED: "已驳回",
    REVOKED: "已撤销",
  })[status];
const SEVERITY = { GENERAL: "一般", SERIOUS: "严重", MAJOR: "重大" } as const;

/** 计分规则：一段灰字说明，直接放在页面上。 */
export const SafetyPolicySummary = ({
  policies,
}: {
  readonly policies: readonly SafetyCreditPolicyView[];
}): JSX.Element => {
  const day: string = new Date(Date.now() + 8 * 3600000)
    .toISOString()
    .slice(0, 10);
  const policy = policies.filter((row) => row.startsOn <= day).at(-1);
  return (
    <Notice>
      初始 100 分，跨公司累计。
      {policy
        ? `一般扣 ${policy.generalPoints}，严重扣 ${policy.seriousPoints}，重大扣 ${policy.majorPoints}。连续 ${policy.recoveryWorkdays} 个用工日无违规，恢复 ${policy.recoveryPoints} 分。`
        : ""}
    </Notice>
  );
};

/** 一条违规记录的内容：放在 Card 里，操作按钮由所在页面接在后面。 */
export const SafetyViolationCard = ({
  row,
}: {
  readonly row: SafetyViolationView;
}): JSX.Element => {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  return (
    <>
      <CardTitle
        value={row.status === "CONFIRMED" ? `\u2212${row.points}` : undefined}
        tone="bad"
        status={
          row.status === "CONFIRMED"
            ? undefined
            : {
                text:
                  row.status === "PENDING"
                    ? `待审核，拟扣 ${row.points} 分`
                    : `${safetyStatusLabel(row.status)}，不扣分`,
                kind: row.status === "PENDING" ? "warn" : "idle",
              }
        }
      >
        {row.category}
      </CardTitle>
      <CardMeta>
        {SEVERITY[row.severity]}，{workTimestamp(row.occurredAt)}
        {row.status === "CONFIRMED" ? "，已确认" : ""}
      </CardMeta>
      <View className="work-content">{row.description}</View>
      {row.reviewReason && <CardMeta>审核意见：{row.reviewReason}</CardMeta>}
      {row.decisions.length > 1 &&
        row.decisions.map((decision, index) => (
          <CardMeta key={`${decision.createdAt}-${index}`}>
            {workTimestamp(decision.createdAt)}{" "}
            {decision.action === "CONFIRM"
              ? "确认"
              : decision.action === "REJECT"
                ? "驳回"
                : "撤销"}
            ：{decision.reason}
          </CardMeta>
        ))}
      {row.appeals.map((appeal) => (
        <CardMeta key={appeal.id}>
          申诉
          {appeal.status === "PENDING"
            ? "待处理"
            : appeal.status === "ACCEPTED"
              ? "已通过"
              : "已驳回"}
          ：{appeal.reason}
          {appeal.reviewReason ? `（${appeal.reviewReason}）` : ""}
        </CardMeta>
      ))}
      {row.evidenceObjectKeys.map((key, index) => (
        <Button
          key={key}
          variant="text"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setError(null);
            void previewSafetyEvidence(row.id, index)
              .catch((cause: unknown) =>
                setError(errorMessage(cause, "照片读取失败")),
              )
              .finally(() => setBusy(false));
          }}
        >
          {row.evidenceObjectKeys.length > 1
            ? `凭证照片 ${index + 1}`
            : "凭证照片"}
        </Button>
      ))}
      {error && <Notice tone="error">{error}</Notice>}
    </>
  );
};
