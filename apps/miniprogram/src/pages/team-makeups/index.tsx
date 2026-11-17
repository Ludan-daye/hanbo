import { Picker, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import { useSessionGuard } from "../../hooks/use-session-guard";

import {
  Button,
  Field,
  ListItem,
  Notice,
  PageHeader,
  Screen,
  Segmented,
  StateView,
  Subtitle,
} from "../../components/ui/index";
import { usePageRefresh } from "../../hooks/use-page-refresh";

import {
  approveMakeup,
  fetchMakeupInbox,
  fetchReviewedMakeups,
  type InboxMakeup,
  rejectMakeup,
  type PendingMakeup,
} from "../../services/makeups";

import { workTimestamp } from "../../components/team-work-fields";
import { formatChinaHm } from "../../services/time";
import { errorMessage } from "../../services/error-messages";

import "./index.scss";

const POINT_LABEL: Readonly<Record<PendingMakeup["pointCode"], string>> = {
  SEGMENT_1_END: "上午下班",
  SEGMENT_1_START: "上午上班",
  SEGMENT_2_END: "下午下班",
  SEGMENT_2_START: "下午上班",
};
type ReviewAction = (
  id: string,
  body: { readonly approvalReason: string },
) => Promise<unknown>;
const QUICK_REASONS: readonly string[] = [
  "情况属实",
  "已核实出勤",
  "与现场记录不符",
];
const ALL_SCOPES = "全部范围";
export default function TeamMakeups(): JSX.Element {
  useSessionGuard();

  const { revision, refresh } = usePageRefresh();

  const [tab, setTab] = useState<"PENDING" | "REVIEWED">("PENDING");
  const [items, setItems] = useState<readonly InboxMakeup[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const router = Taro.useRouter();
  const requestedTeamName: string | null = router.params.teamName
    ? decodeURIComponent(router.params.teamName)
    : null;
  const [scope, setScope] = useState<string | null>(
    requestedTeamName === null ? ALL_SCOPES : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Readonly<Record<string, string>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setError(null);
    setItems(null);
    setNextCursor(null);
    const load = tab === "PENDING" ? fetchMakeupInbox : fetchReviewedMakeups;
    void load(null).then(
      (page) => {
        if (!cancelled) {
          setItems(page.items);
          setNextCursor(page.nextCursor);
        }
      },
      (cause) => {
        if (!cancelled)
          setError(errorMessage(cause, "无法读取审批列表"));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [revision, tab]);
  const review = async (
    id: string,
    action: ReviewAction,
    title: string,
  ): Promise<void> => {
    if (busy !== null) return;
    const typed = (reasons[id] ?? "").trim();
    const isReject = action === rejectMakeup;
    if (isReject && typed.length === 0) {
      await Taro.showToast({ icon: "none", title: "驳回请填写原因" });
      return;
    }
    const approvalReason = typed.length > 0 ? typed : "情况属实";
    const confirmation = await Taro.showModal({
      title,
      content: `审批意见：${approvalReason}`,
      confirmText: isReject ? "确认驳回" : "确认通过",
      confirmColor: isReject ? "#c33845" : "#0066d6",
    });
    if (!confirmation.confirm) return;
    setBusy(id);
    setError(null);
    try {
      await action(id, { approvalReason });
      setItems((rows) => (rows ?? []).filter((row) => row.id !== id));
      setOpenId(null);
      await Taro.showToast({ icon: "success", title: "已处理" });
    } catch (cause) {
      setError(errorMessage(cause, "审批未完成，请重试"));
    } finally {
      setBusy(null);
    }
  };
  const label = (item: InboxMakeup): string =>
    `${item.projectName} · ${item.teamName ?? "项目直属"}`;
  const scopes = [ALL_SCOPES, ...new Set((items ?? []).map(label))];
  const requestedItem: InboxMakeup | undefined =
    requestedTeamName === null
      ? undefined
      : // 班组范围名称的格式为“项目 / 班组”，与工作范围接口保持一致。
        (items ?? []).find(
          (item) =>
            `${item.projectName} / ${item.teamName}` === requestedTeamName ||
            item.teamName === requestedTeamName,
        );
  const requestedScope: string | null =
    requestedItem === undefined ? null : label(requestedItem);
  const activeScope: string =
    scope !== null && scopes.includes(scope)
      ? scope
      : (requestedScope ?? ALL_SCOPES);
  const visibleItems: readonly InboxMakeup[] = (items ?? []).filter(
    (item) => activeScope === ALL_SCOPES || label(item) === activeScope,
  );
  const loadMore = async (): Promise<void> => {
    if (nextCursor === null || busy !== null) return;
    setBusy("page");
    setError(null);
    try {
      const page = await (
        tab === "PENDING" ? fetchMakeupInbox : fetchReviewedMakeups
      )(nextCursor);
      setItems((rows) => [...(rows ?? []), ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (cause) {
      setError(errorMessage(cause, "读取下一页失败"));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Screen>
      <PageHeader title="补卡审批" />
      <View>
        <Segmented
          options={[
            { label: "待审批", value: "PENDING" },
            { label: "我已处理", value: "REVIEWED" },
          ]}
          value={tab}
          onChange={(value: "PENDING" | "REVIEWED") => {
            if (busy === null) setTab(value);
          }}
        />
        <Picker
          mode="selector"
          range={scopes}
          value={scopes.indexOf(activeScope)}
          onChange={(event) => setScope(scopes[Number(event.detail.value)])}
        >
          <ListItem
            primary={activeScope}
            secondary="按项目／班组筛选已加载的申请"
            chip="选择"
          />
        </Picker>
        <Notice>
          {tab === "PENDING"
            ? "核实出勤后审批，结果同步考勤。"
            : "本人审批记录"}
        </Notice>
        <View className="report-section-title">
          {tab === "PENDING" ? "待处理申请" : "已处理记录"} ·{" "}
          {visibleItems.length}
          {activeScope === ALL_SCOPES ? "" : ` / ${items?.length ?? 0}`} 条
        </View>
        {items === null && error === null ? (
          <StateView title="正在读取审批列表…" />
        ) : null}
        {items === null && error ? (
          <StateView title="审批列表读取失败" sub={error} onRetry={refresh} />
        ) : null}
        {items !== null && error ? <Notice tone="error">{error}</Notice> : null}
        {items?.length === 0 && nextCursor === null ? (
          <StateView
            title={tab === "PENDING" ? "全部处理完毕" : "暂无处理记录"}
            sub={
              tab === "PENDING"
                ? "目前没有待审批的补卡申请。"
                : "处理补卡后，可在这里查看结果。"
            }
          />
        ) : null}
        {items?.length === 0 && nextCursor !== null ? (
          <StateView title="当前页无记录" sub="请继续加载后续申请。" />
        ) : null}
        {items !== null && items.length > 0 && visibleItems.length === 0 ? (
          <StateView
            title="该范围暂无记录"
            sub="切换到“全部范围”查看其它项目或班组。"
          />
        ) : null}
        {visibleItems.map((item) => {
            const name = item.displayName ?? "待完善姓名";
            return (
              <View key={item.id} className="form-card">
                <ListItem
                  primary={name}
                  secondary={`${item.attendanceDate} · ${item.pointLabel ?? POINT_LABEL[item.pointCode] ?? item.pointCode} · ${formatChinaHm(item.requestedOccurredAt)}`}
                  chip={
                    {
                      PENDING: "待审批",
                      APPROVED: "已通过",
                      REJECTED: "已驳回",
                    }[item.status]
                  }
                  onClick={() => {
                    if (busy === null)
                      setOpenId(openId === item.id ? null : item.id);
                  }}
                />
                <Subtitle>{label(item)}</Subtitle>
                <Subtitle>申请原因：{item.reason}</Subtitle>
                {item.status !== "PENDING" ? (
                  <>
                    <Subtitle>审批意见：{item.approvalReason}</Subtitle>
                    <Subtitle>
                      处理时间：
                      {item.approvedAt === null
                        ? "未记录"
                        : workTimestamp(item.approvedAt)}
                    </Subtitle>
                  </>
                ) : openId === item.id ? (
                  <View>
                    <View className="makeup-quick-reasons">
                      {QUICK_REASONS.map((reason) => (
                        <Button
                          key={reason}
                          variant="text"
                          disabled={busy !== null}
                          onClick={() => {
                            setReasons((previous) => ({
                              ...previous,
                              [item.id]: reason,
                            }));
                          }}
                        >
                          {reason}
                        </Button>
                      ))}
                    </View>
                    <Field
                      value={reasons[item.id] ?? ""}
                      placeholder="审批意见（通过可留空，驳回必填）"
                      onInput={(value) => {
                        setReasons((previous) => ({
                          ...previous,
                          [item.id]: value,
                        }));
                      }}
                    />
                    <View className="action-row">
                      <Button
                        loading={busy === item.id}
                        disabled={busy !== null}
                        onClick={() => {
                          void review(
                            item.id,
                            approveMakeup,
                            "通过补卡",
                          );
                        }}
                      >
                        通过申请
                      </Button>
                      <Button
                        variant="danger"
                        disabled={
                          busy !== null ||
                          (reasons[item.id] ?? "").trim().length === 0
                        }
                        onClick={() => {
                          void review(
                            item.id,
                            rejectMakeup,
                            "驳回补卡",
                          );
                        }}
                      >
                        驳回申请
                      </Button>
                    </View>
                  </View>
                ) : (
                  <Button
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() => {
                      setOpenId(item.id);
                    }}
                  >
                    查看并审批
                  </Button>
                )}
              </View>
            );
        })}
        {nextCursor !== null ? (
          <Button
            variant="outline"
            loading={busy === "page"}
            onClick={() => {
              void loadMore();
            }}
          >
            加载更多
          </Button>
        ) : null}
      </View>
    </Screen>
  );
}
