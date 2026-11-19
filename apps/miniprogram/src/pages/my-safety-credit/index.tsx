import { View } from "@tarojs/components";
import { useEffect, useState } from "react";
import type { MySafetyCredit } from "@construction/domain";
import {
  Button,
  Card,
  CardActions,
  Notice,
  PageHeader,
  Screen,
  SectionTitle,
  SignLine,
  SkeletonRows,
  StateView,
} from "../../components/ui/index";
import {
  SafetyPolicySummary,
  SafetyViolationCard,
} from "../../components/safety-credit-cards";
import { WorkNotes } from "../../components/team-work-fields";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import {
  appealSafetyViolation,
  fetchMySafetyCredit,
} from "../../services/safety-credit";
import { errorMessage } from "../../services/error-messages";

import "./index.scss";

/** 标牌上分数旁边的一句话：违规几次、恢复了几分、已经连续多少个用工日没有违规。 */
const summaryLine = (summary: MySafetyCredit["summary"]): string =>
  [
    `累计违规 ${summary.confirmedViolationCount} 次`,
    summary.recoveryPoints > 0 ? `已恢复 ${summary.recoveryPoints} 分` : "",
    `已连续 ${summary.recoveryWorkdays} 个用工日无违规`,
  ]
    .filter(Boolean)
    .join("，");

export default function MySafety(): JSX.Element {
  useSessionGuard();
  const { revision, refresh } = usePageRefresh();
  const [data, setData] = useState<MySafetyCredit | null>(null);
  // 读取出的错和申诉表单出的错分开放：前者在页面顶上，后者在提交按钮旁边。
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [reason, setReason] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  useEffect(() => {
    let active = true;
    setError(null);
    void fetchMySafetyCredit().then(
      (value) => {
        if (active) setData(value);
      },
      (cause: unknown) => {
        if (active) setError(errorMessage(cause, "安全信用读取失败"));
      },
    );
    return () => {
      active = false;
    };
  }, [revision]);
  const submitAppeal = (violationId: string): void => {
    if (busy) return;
    if (!reason.trim()) {
      setFormError("请填写申诉原因");
      return;
    }
    setBusy(true);
    setFormError(null);
    void appealSafetyViolation(violationId, reason)
      .then(
        () => {
          setSelected(null);
          setReason("");
          refresh();
        },
        (cause: unknown) => setFormError(errorMessage(cause, "申诉提交失败")),
      )
      .finally(() => setBusy(false));
  };

  return (
    <Screen header={<PageHeader title="安全信用" />}>
      {data === null ? (
        error ? (
          <StateView
            kind="error"
            title="安全信用没读到"
            sub={error}
            onRetry={refresh}
          />
        ) : (
          <>
            <View className="safety-credit__sk sk" />
            <SkeletonRows rows={3} gap />
          </>
        )
      ) : (
        <>
          <SignLine
            title="安全信用分"
            sub={summaryLine(data.summary)}
            value={String(data.summary.score)}
          />
          {error ? (
            <>
              <Notice tone="error">
                最新的数据没读到，现在显示的是上一次的
                <View className="ui-notice__sub">{error}</View>
              </Notice>
              <Button variant="text" onClick={refresh}>
                重新读取
              </Button>
            </>
          ) : null}
          <SafetyPolicySummary policies={data.policies} />
          <SectionTitle>违规记录</SectionTitle>
          {data.violations.length === 0 ? (
            <StateView kind="empty" title="没有违规记录" />
          ) : null}
          {data.violations.map((row, index) => {
            const open = selected === row.id;
            return (
              <View key={row.id}>
                <Card gap={index > 0}>
                  <SafetyViolationCard row={row} />
                  {row.status === "CONFIRMED" &&
                  !row.appeals.some((appeal) => appeal.status === "PENDING") ? (
                    <CardActions>
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          setSelected(open ? null : row.id);
                          setReason("");
                          setFormError(null);
                        }}
                      >
                        {open ? "收起申诉" : "申请复核"}
                      </Button>
                    </CardActions>
                  ) : null}
                </Card>
                {open ? (
                  <View className="m-fade">
                    <WorkNotes
                      label="申诉原因"
                      value={reason}
                      onChange={setReason}
                    />
                    {formError ? (
                      <Notice tone="error">{formError}</Notice>
                    ) : null}
                    <Button loading={busy} onClick={() => submitAppeal(row.id)}>
                      {busy ? "提交中" : "提交申诉"}
                    </Button>
                  </View>
                ) : null}
              </View>
            );
          })}
        </>
      )}
    </Screen>
  );
}
