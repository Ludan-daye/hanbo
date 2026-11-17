import { useEffect, useState } from "react";
import type { MySafetyCredit } from "@construction/domain";
import {
  Button,
  ListItem,
  Notice,
  PageHeader,
  Screen,
  Section,
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

export default function MySafety(): JSX.Element {
  useSessionGuard();
  const { revision, refresh } = usePageRefresh();
  const [data, setData] = useState<MySafetyCredit | null>(null);
  const [error, setError] = useState<string | null>(null);
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
        if (active)
          setError(cause instanceof Error ? cause.message : "安全信用读取失败");
      },
    );
    return () => {
      active = false;
    };
  }, [revision]);
  return (
    <Screen appearance="worker">
      <PageHeader title="我的安全信用" />
      {error && <Notice>{error}</Notice>}
      {data === null ? (
        <StateView title="读取中" />
      ) : (
        <>
          <Section title={`${data.summary.score} 分`}>
            <ListItem
              primary="累计违规"
              chip={`${data.summary.confirmedViolationCount} 次`}
            />
            <ListItem
              primary="已恢复"
              chip={`${data.summary.recoveryPoints} 分`}
            />
            <ListItem
              primary="当前无违规用工日"
              chip={`${data.summary.recoveryWorkdays} 天`}
            />
          </Section>
          <SafetyPolicySummary policies={data.policies} />
          {data.violations.length === 0 && <StateView title="暂无违规记录" />}
          {data.violations.map((row) => (
            <Section key={row.id} title="违规记录">
              <SafetyViolationCard row={row} />
              {row.status === "CONFIRMED" &&
                !row.appeals.some((appeal) => appeal.status === "PENDING") && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelected(selected === row.id ? null : row.id);
                      setReason("");
                    }}
                  >
                    {selected === row.id ? "收起申诉" : "申请复核"}
                  </Button>
                )}
              {selected === row.id && (
                <>
                  <WorkNotes
                    label="申诉原因"
                    value={reason}
                    onChange={setReason}
                  />
                  <Button
                    loading={busy}
                    onClick={() => {
                      if (busy) return;
                      if (!reason.trim()) {
                        setError("请填写申诉原因");
                        return;
                      }
                      setBusy(true);
                      setError(null);
                      void appealSafetyViolation(row.id, reason)
                        .then(
                          () => {
                            setSelected(null);
                            setReason("");
                            refresh();
                          },
                          (cause: unknown) =>
                            setError(
                              cause instanceof Error
                                ? cause.message
                                : "申诉提交失败",
                            ),
                        )
                        .finally(() => setBusy(false));
                    }}
                  >
                    提交申诉
                  </Button>
                </>
              )}
            </Section>
          ))}
        </>
      )}
    </Screen>
  );
}
