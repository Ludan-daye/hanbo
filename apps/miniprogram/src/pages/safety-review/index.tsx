import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import type {
  SafetyCreditBoard,
  SafetyViolationView,
} from "@construction/domain";
import {
  Button,
  ListItem,
  Notice,
  PageHeader,
  Screen,
  Section,
  Segmented,
  StateView,
} from "../../components/ui/index";
import { SafetyViolationCard } from "../../components/safety-credit-cards";
import { WorkNotes } from "../../components/team-work-fields";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { useManagedProjectId } from "../../hooks/use-management-scope";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSession } from "../../store/session";
import {
  fetchProjectSafetyCredit,
  reviewSafetyAppeal,
  reviewSafetyViolation,
} from "../../services/safety-credit";
import { errorMessage } from "../../services/error-messages";

type ReviewTab = "PENDING" | "APPEAL" | "ALL";
export default function SafetyReview(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const projectId = useManagedProjectId(state.me);
  const { revision, refresh } = usePageRefresh();
  const [board, setBoard] = useState<SafetyCreditBoard | null>(null);
  const [tab, setTab] = useState<ReviewTab>("PENDING");
  const [selected, setSelected] = useState<string | null>(null);
  const [reason, setReason] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  useEffect(() => {
    if (projectId === null) return;
    let active = true;
    setError(null);
    void fetchProjectSafetyCredit(projectId).then(
      (value) => {
        if (active) setBoard(value);
      },
      (cause: unknown) => {
        if (active)
          setError(errorMessage(cause, "安全记录读取失败"));
      },
    );
    return () => {
      active = false;
    };
  }, [projectId, revision]);
  const perform = async (
    action: () => Promise<void>,
    confirmation: {
      readonly title: string;
      readonly content: string;
      readonly danger?: boolean;
    },
  ): Promise<void> => {
    if (busy) return;
    if (!reason.trim()) {
      setError("请填写审核意见");
      return;
    }
    const result = await Taro.showModal({
      title: confirmation.title,
      content: `${confirmation.content}\n审核意见：${reason.trim()}`,
      confirmText: "确认",
      confirmColor: confirmation.danger ? "#c33845" : "#0066d6",
    });
    if (!result.confirm) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      setSelected(null);
      setReason("");
      refresh();
      await Taro.showToast({ icon: "success", title: "已处理" });
    } catch (cause: unknown) {
      const message = errorMessage(cause, "审核失败");
      setError(message);
      await Taro.showToast({ icon: "none", title: message });
    } finally {
      setBusy(false);
    }
  };
  const reasonMissing: boolean = reason.trim().length === 0;
  const visible = (row: SafetyViolationView): boolean =>
    tab === "ALL" ||
    (tab === "PENDING"
      ? row.status === "PENDING"
      : row.appeals.some((appeal) => appeal.status === "PENDING"));
  if (projectId === null)
    return (
      <Screen>
        <PageHeader title="安全审核" />
        <StateView title="请先选择项目" />
      </Screen>
    );
  return (
    <Screen>
      <PageHeader title="安全审核" />
      {error && board !== null && <Notice tone="error">{error}</Notice>}
      <Segmented
        options={[
          { value: "PENDING", label: "待审核" },
          { value: "APPEAL", label: "申诉" },
          { value: "ALL", label: "全部" },
        ]}
        value={tab}
        onChange={(value: ReviewTab) => setTab(value)}
      />
      {board === null ? (
        error ? (
          <StateView title="安全记录读取失败" sub={error} onRetry={refresh} />
        ) : (
          <StateView title="正在读取安全记录…" />
        )
      ) : (
        <>
          {board.violations.filter(visible).length === 0 && (
            <StateView title="暂无记录" />
          )}
          {board.violations.filter(visible).map((row) => (
            <Section
              key={row.id}
              title={
                board.workers.find((person) => person.workerId === row.workerId)
                  ?.name ?? "历史人员"
              }
            >
              <SafetyViolationCard row={row} />
              {(row.status === "PENDING" || row.status === "CONFIRMED") && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelected(selected === row.id ? null : row.id);
                    setReason("");
                  }}
                >
                  处理记录
                </Button>
              )}
              {selected === row.id && (
                <>
                  <WorkNotes
                    label="审核意见"
                    value={reason}
                    onChange={setReason}
                  />
                  {row.status === "PENDING" ? (
                    <>
                      <Button
                        loading={busy}
                        disabled={busy || reasonMissing}
                        onClick={() => {
                          void perform(
                            () =>
                              reviewSafetyViolation(
                                projectId,
                                row.id,
                                "CONFIRM",
                                reason,
                              ),
                            {
                              title: "确认违规",
                              content: "确认后按规则扣分，工人可申诉。",
                              danger: true,
                            },
                          );
                        }}
                      >
                        确认违规
                      </Button>
                      <Button
                        loading={busy}
                        disabled={busy || reasonMissing}
                        variant="outline"
                        onClick={() => {
                          void perform(
                            () =>
                              reviewSafetyViolation(
                                projectId,
                                row.id,
                                "REJECT",
                                reason,
                              ),
                            {
                              title: "驳回记录",
                              content: "驳回后不扣分，记录保留。",
                            },
                          );
                        }}
                      >
                        驳回记录
                      </Button>
                    </>
                  ) : row.appeals.some(
                      (appeal) => appeal.status === "PENDING",
                    ) ? (
                    row.appeals
                      .filter((appeal) => appeal.status === "PENDING")
                      .map((appeal) => (
                        <Section key={appeal.id} title="申诉处理">
                          <Button
                            loading={busy}
                            disabled={busy || reasonMissing}
                            onClick={() => {
                              void perform(
                                () =>
                                  reviewSafetyAppeal(
                                    projectId,
                                    row.id,
                                    appeal.id,
                                    true,
                                    reason,
                                  ),
                                {
                                  title: "通过申诉",
                                  content: "撤销该违规并恢复扣分。",
                                },
                              );
                            }}
                          >
                            通过申诉并撤销
                          </Button>
                          <Button
                            loading={busy}
                            disabled={busy || reasonMissing}
                            variant="outline"
                            onClick={() => {
                              void perform(
                                () =>
                                  reviewSafetyAppeal(
                                    projectId,
                                    row.id,
                                    appeal.id,
                                    false,
                                    reason,
                                  ),
                                {
                                  title: "驳回申诉",
                                  content: "维持原违规记录与扣分。",
                                  danger: true,
                                },
                              );
                            }}
                          >
                            驳回申诉
                          </Button>
                        </Section>
                      ))
                  ) : (
                    <Button
                      loading={busy}
                      disabled={busy || reasonMissing}
                      variant="danger"
                      onClick={() => {
                        void perform(
                          () =>
                            reviewSafetyViolation(
                              projectId,
                              row.id,
                              "REVOKE",
                              reason,
                            ),
                          {
                            title: "撤销违规",
                            content: "撤销后恢复扣分，操作留痕。",
                            danger: true,
                          },
                        );
                      }}
                    >
                      撤销违规
                    </Button>
                  )}
                </>
              )}
            </Section>
          ))}
          {tab === "ALL" && (
            <Section title="违规次数排行">
              {board.workers.map((row) => (
                <ListItem
                  key={row.memberId}
                  primary={`${row.rank}. ${row.name}`}
                  secondary={`${row.confirmedViolationCount} 次`}
                  chip={`${row.score} 分`}
                />
              ))}
            </Section>
          )}
        </>
      )}
    </Screen>
  );
}
