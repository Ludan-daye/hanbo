import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import type {
  SafetyCreditBoard,
  SafetyViolationView,
} from "@construction/domain";

import {
  SafetyViolationCard,
  safetyStatusLabel,
} from "../../components/safety-credit-cards";
import { workTimestamp } from "../../components/team-work-fields";
import {
  BottomBar,
  Button,
  Card,
  FormArea,
  Notice,
  PageHeader,
  Row,
  Screen,
  SectionTitle,
  Segmented,
  Sheet,
  StateView,
} from "../../components/ui/index";
import { useManagedProjectId } from "../../hooks/use-management-scope";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { errorMessage } from "../../services/error-messages";
import {
  fetchProjectSafetyCredit,
  reviewSafetyAppeal,
  reviewSafetyViolation,
} from "../../services/safety-credit";
import { useSession } from "../../store/session";

type ReviewTab = "PENDING" | "APPEAL" | "ALL";
const SEVERITY = { GENERAL: "一般", SERIOUS: "严重", MAJOR: "重大" } as const;
const EMPTY: Readonly<Record<ReviewTab, string>> = {
  PENDING: "没有等你复核的违规",
  APPEAL: "没有等你处理的申诉",
  ALL: "还没有违规记录",
};
const hasPendingAppeal = (row: SafetyViolationView): boolean =>
  row.appeals.some((appeal) => appeal.status === "PENDING");
/** 收起成一行时右边写什么。waiting 是等你处理的，这一行带警戒条；办完的是灰字。 */
const rowState = (
  row: SafetyViolationView,
): { readonly waiting: boolean; readonly text: string } =>
  row.status === "PENDING"
    ? { waiting: true, text: "待审核" }
    : hasPendingAppeal(row)
      ? { waiting: true, text: "申诉待处理" }
      : { waiting: false, text: safetyStatusLabel(row.status) };

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
        if (active) setError(errorMessage(cause, "安全记录读取失败"));
      },
    );
    return () => {
      active = false;
    };
  }, [projectId, revision]);
  const visible = (row: SafetyViolationView): boolean =>
    tab === "ALL" ||
    (tab === "PENDING" ? row.status === "PENDING" : hasPendingAppeal(row));
  const nameOf = (row: SafetyViolationView): string =>
    board?.workers.find((person) => person.workerId === row.workerId)?.name ??
    "历史人员";
  const rows = (board?.violations ?? []).filter(visible);
  // 一次只展开一条：点过哪条展开哪条，没点过就展开第一条。屏上始终只有一个黑按钮。
  const openIndex = Math.max(
    0,
    rows.findIndex((row) => row.id === selected),
  );
  const open: SafetyViolationView | null = rows[openIndex] ?? null;
  const openId = open?.id ?? null;
  // 意见是写给眼前这一条的：换了一条（点了别的、切了标签、刷新后这条没了），意见清空。
  useEffect(() => {
    setReason("");
  }, [openId]);
  const perform = async (
    action: () => Promise<void>,
    confirmation: {
      readonly title: string;
      readonly content: string;
      readonly danger?: boolean;
    },
  ): Promise<void> => {
    if (busy || open === null) return;
    if (!reason.trim()) {
      setError("请填写审核意见");
      return;
    }
    const result = await Taro.showModal({
      title: confirmation.title,
      content: `${nameOf(open)}，${open.category}\n${confirmation.content}\n审核意见：${reason.trim()}`,
      confirmText: confirmation.title,
      confirmColor: confirmation.danger ? "#D7261E" : "#000000",
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

  const header = <PageHeader title="违规复核" />;
  if (projectId === null)
    return (
      <Screen header={header}>
        <StateView
          kind="empty"
          title="还没有选项目"
          sub="请从工作台或公司项目进来。"
        />
      </Screen>
    );
  if (board === null)
    return (
      <Screen header={header}>
        {error ? (
          <StateView
            kind="error"
            title="违规记录没读到"
            sub={error}
            onRetry={refresh}
          />
        ) : (
          <StateView title="正在读取违规记录" />
        )}
      </Screen>
    );

  const pendingCount = board.violations.filter(
    (row) => row.status === "PENDING",
  ).length;
  const appealCount = board.violations.filter(hasPendingAppeal).length;
  const appeal = open?.appeals.find((item) => item.status === "PENDING");
  const mode: "review" | "appeal" | "revoke" | null =
    open === null
      ? null
      : open.status === "PENDING"
        ? "review"
        : open.status !== "CONFIRMED"
          ? null
          : appeal
            ? "appeal"
            : "revoke";
  const collapsed = (
    list: readonly SafetyViolationView[],
  ): JSX.Element | null =>
    list.length === 0 ? null : (
      <Sheet gap>
        {list.map((row) => {
          const { waiting, text } = rowState(row);
          return (
            <Row
              key={row.id}
              title={nameOf(row)}
              sub={`${row.category}，${SEVERITY[row.severity]}，${workTimestamp(row.occurredAt)}`}
              value={text}
              mute={!waiting}
              hazard={waiting}
              chevron
              onClick={() => {
                if (busy) return;
                setSelected(row.id);
                setReason("");
                setError(null);
              }}
            />
          );
        })}
      </Sheet>
    );

  return (
    <Screen header={header}>
      <Segmented
        options={[
          {
            value: "PENDING",
            label: pendingCount > 0 ? `待审核 ${pendingCount}` : "待审核",
          },
          {
            value: "APPEAL",
            label: appealCount > 0 ? `申诉 ${appealCount}` : "申诉",
          },
          { value: "ALL", label: "全部" },
        ]}
        value={tab}
        onChange={(value: ReviewTab) => setTab(value)}
      />
      {open === null ? (
        <>
          <StateView kind="empty" title={EMPTY[tab]} />
          {error ? <Notice tone="error">{error}</Notice> : null}
        </>
      ) : (
        <>
          {collapsed(rows.slice(0, openIndex))}
          <SectionTitle>{nameOf(open)}</SectionTitle>
          <View key={open.id} className="m-fade">
            <Card>
              <SafetyViolationCard row={open} />
            </Card>
            {mode !== null ? (
              <>
                <Sheet gap>
                  <FormArea
                    label="审核意见"
                    required
                    value={reason}
                    placeholder="写清依据"
                    maxLength={2000}
                    disabled={busy}
                    onInput={setReason}
                  />
                </Sheet>
                <Notice>
                  {mode === "review"
                    ? "确认后按规则扣分，工人可以申诉。驳回不扣分，记录保留。"
                    : mode === "appeal"
                      ? "通过申诉会撤销这条违规并恢复扣分。驳回申诉则维持原来的扣分。"
                      : "撤销后恢复扣分，这次操作会留下记录。"}
                </Notice>
              </>
            ) : null}
          </View>
          {error ? <Notice tone="error">{error}</Notice> : null}
          {collapsed(rows.slice(openIndex + 1))}
        </>
      )}
      {tab === "ALL" && board.workers.length > 0 ? (
        <>
          <SectionTitle>违规次数</SectionTitle>
          <Sheet>
            {board.workers.map((row) => (
              <Row
                key={row.memberId}
                avatar={String(row.rank)}
                title={row.name}
                sub={`已确认违规 ${row.confirmedViolationCount} 次`}
              >
                <View>
                  <Text className="num">{row.score}</Text> 分
                </View>
              </Row>
            ))}
          </Sheet>
        </>
      ) : null}

      {open !== null && mode === "review" ? (
        <BottomBar
          primary={busy ? "处理中…" : "确认违规"}
          busy={busy}
          disabled={reasonMissing}
          onPrimary={() => {
            void perform(
              () =>
                reviewSafetyViolation(projectId, open.id, "CONFIRM", reason),
              {
                title: "确认违规",
                content: "确认后按规则扣分，工人可申诉。",
                danger: true,
              },
            );
          }}
        >
          <Button
            variant="text"
            disabled={busy || reasonMissing}
            onClick={() => {
              void perform(
                () =>
                  reviewSafetyViolation(projectId, open.id, "REJECT", reason),
                { title: "驳回记录", content: "驳回后不扣分，记录保留。" },
              );
            }}
          >
            驳回
          </Button>
        </BottomBar>
      ) : null}
      {open !== null && mode === "appeal" && appeal ? (
        <BottomBar
          primary={busy ? "处理中…" : "通过申诉并撤销"}
          busy={busy}
          disabled={reasonMissing}
          onPrimary={() => {
            void perform(
              () =>
                reviewSafetyAppeal(projectId, open.id, appeal.id, true, reason),
              { title: "通过申诉", content: "撤销该违规并恢复扣分。" },
            );
          }}
        >
          <Button
            variant="text"
            disabled={busy || reasonMissing}
            onClick={() => {
              void perform(
                () =>
                  reviewSafetyAppeal(
                    projectId,
                    open.id,
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
        </BottomBar>
      ) : null}
      {open !== null && mode === "revoke" ? (
        <BottomBar>
          <Button
            variant="danger"
            wide
            loading={busy}
            disabled={busy || reasonMissing}
            onClick={() => {
              void perform(
                () =>
                  reviewSafetyViolation(projectId, open.id, "REVOKE", reason),
                {
                  title: "撤销违规",
                  content: "撤销后恢复扣分，操作留痕。",
                  danger: true,
                },
              );
            }}
          >
            {busy ? "处理中…" : "撤销违规"}
          </Button>
        </BottomBar>
      ) : null}
    </Screen>
  );
}
