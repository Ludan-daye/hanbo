import { useState } from "react";
import type {
  SafetyCreditPolicyView,
  SafetyViolationView,
} from "@construction/domain";
import { Button, ListItem, Notice, Section, Subtitle } from "./ui/index";
import { workTimestamp } from "./team-work-fields";
import { previewSafetyEvidence } from "../services/safety-credit";

export const safetyStatusLabel = (
  status: SafetyViolationView["status"],
): string =>
  ({
    PENDING: "待审核",
    CONFIRMED: "已确认",
    REJECTED: "已驳回",
    REVOKED: "已撤销",
  })[status];
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
    <Section title="计分规则">
      <Subtitle>初始 100 分，跨公司累计</Subtitle>
      {policy && (
        <>
          <Subtitle>
            一般 −{policy.generalPoints} · 严重 −{policy.seriousPoints} · 重大 −
            {policy.majorPoints}
          </Subtitle>
          <Subtitle>
            连续 {policy.recoveryWorkdays} 个用工日无违规恢复{" "}
            {policy.recoveryPoints} 分
          </Subtitle>
        </>
      )}
    </Section>
  );
};
export const SafetyViolationCard = ({
  row,
}: {
  readonly row: SafetyViolationView;
}): JSX.Element => {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  return (
    <>
      <ListItem
        primary={`${row.category} · ${safetyStatusLabel(row.status)}`}
        secondary={`${{ GENERAL: "一般", SERIOUS: "严重", MAJOR: "重大" }[row.severity]} · ${workTimestamp(row.occurredAt)}`}
        chip={
          row.status === "CONFIRMED"
            ? `−${row.points} 分`
            : row.status === "PENDING"
              ? `拟扣 ${row.points} 分`
              : "不扣分"
        }
      />
      <Subtitle>{row.description}</Subtitle>
      {row.reviewReason && <Subtitle>审核意见：{row.reviewReason}</Subtitle>}
      {row.decisions.length > 1 &&
        row.decisions.map((decision, index) => (
          <Subtitle key={`${decision.createdAt}-${index}`}>
            {workTimestamp(decision.createdAt)} ·{" "}
            {decision.action === "CONFIRM"
              ? "确认"
              : decision.action === "REJECT"
                ? "驳回"
                : "撤销"}
            ：{decision.reason}
          </Subtitle>
        ))}
      {row.appeals.map((appeal) => (
        <Subtitle key={appeal.id}>
          申诉
          {appeal.status === "PENDING"
            ? "待处理"
            : appeal.status === "ACCEPTED"
              ? "已通过"
              : "已驳回"}
          ：{appeal.reason}
          {appeal.reviewReason ? ` · ${appeal.reviewReason}` : ""}
        </Subtitle>
      ))}
      {row.evidenceObjectKeys.map((key, index) => (
        <Button
          key={key}
          loading={busy}
          variant="outline"
          onClick={() => {
            setBusy(true);
            setError(null);
            void previewSafetyEvidence(row.id, index)
              .catch((cause: unknown) =>
                setError(
                  cause instanceof Error ? cause.message : "照片读取失败",
                ),
              )
              .finally(() => setBusy(false));
          }}
        >
          凭证照片 {index + 1}
        </Button>
      ))}
      {error && <Notice>{error}</Notice>}
    </>
  );
};
