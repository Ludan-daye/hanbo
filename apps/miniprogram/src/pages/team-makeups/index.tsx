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
export default function TeamMakeups(): JSX.Element {
  useSessionGuard();

  const { revision, refresh } = usePageRefresh();

  const [tab, setTab] = useState<"PENDING" | "REVIEWED">("PENDING");
  const [items, setItems] = useState<readonly InboxMakeup[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [scope, setScope] = useState<string>("全部范围");
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Readonly<Record<string, string>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setError(null);
    setItems(null);
    setNextCursor(null);
    setOpenId(null);
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
          setError(cause instanceof Error ? cause.message : "无法读取审批列表");
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
    const approvalReason = (reasons[id] ?? "").trim();
    if (approvalReason.length === 0) {
      await Taro.showToast({ icon: "none", title: "请填写审批意见" });
      return;
    }
    const confirmation = await Taro.showModal({
      title,
      content: `审批意见：${approvalReason}`,
      confirmText: "确认处理",
      confirmColor: "#2675ed",
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
      setError(cause instanceof Error ? cause.message : "审批未完成，请重试");
    } finally {
      setBusy(null);
    }
  };
  const label = (item: InboxMakeup): string =>
    `${item.projectName} · ${item.teamName ?? "项目直属"}`;
  const scopes = ["全部范围", ...new Set((items ?? []).map(label))];
  const activeScope = scopes.includes(scope) ? scope : "全部范围";
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
      setError(cause instanceof Error ? cause.message : "读取下一页失败");
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
          {items?.length ?? 0} 条
        </View>
        {items === null && error === null ? (
          <StateView title="加载中…" />
        ) : null}
        {error ? (
          <StateView title="操作未完成" sub={error} onRetry={refresh} />
        ) : null}
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
        {(items ?? [])
          .filter(
            (item) => activeScope === "全部范围" || label(item) === activeScope,
          )
          .map((item) => {
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
                    <Field
                      value={reasons[item.id] ?? ""}
                      placeholder="填写审批意见（必填）"
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
                        disabled={
                          busy !== null ||
                          (reasons[item.id] ?? "").trim().length === 0
                        }
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
