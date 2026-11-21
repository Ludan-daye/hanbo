import { Input, Picker, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import { useSessionGuard } from "../../hooks/use-session-guard";

import {
  Button,
  Card,
  CardActions,
  CardMeta,
  CardTitle,
  Chips,
  FormRow,
  Notice,
  PageHeader,
  Row,
  Screen,
  SectionTitle,
  Segmented,
  Sheet,
  Stamp,
  StateView,
} from "../../components/ui/index";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSession } from "../../store/session";

import {
  approveMakeup,
  fetchMakeupInbox,
  fetchReviewedMakeups,
  type InboxMakeup,
  rejectMakeup,
} from "../../services/makeups";

import { workTimestamp } from "../../components/team-work-fields";
import { formatChinaHm } from "../../services/time";
import { errorMessage } from "../../services/error-messages";
import {
  ALL_SCOPES,
  arrangePending,
  inScope,
  makeupDay,
  pointName,
  projectScope,
  scopeLabel,
} from "./makeup-view";

import "./index.scss";

type ReviewAction = (
  id: string,
  body: { readonly approvalReason: string },
) => Promise<unknown>;
const QUICK_REASONS: readonly string[] = [
  "情况属实",
  "已核实出勤",
  "与现场记录不符",
];
const QUICK_OPTIONS = QUICK_REASONS.map((reason) => ({
  value: reason,
  label: reason,
}));
// 公司管理员的收件箱分两类：默认只看只有公司级能批的（2026-11-21 Q2）。
const MINE_OPTIONS = [
  { value: "MINE", label: "需要你批" },
  { value: "ALL", label: "全部" },
];
const personName = (item: InboxMakeup): string =>
  item.displayName ?? "待完善姓名";

/** 补的是哪天的哪张卡、补到几点。 */
const RequestLine = ({ item }: { readonly item: InboxMakeup }): JSX.Element => (
  <CardMeta>
    {makeupDay(item.attendanceDate)} {pointName(item)}，补卡时间{" "}
    <Text className="num">{formatChinaHm(item.requestedOccurredAt)}</Text>
  </CardMeta>
);

/** 处理过的申请：通过的落章存档，驳回的把原因留在卡片上。 */
const ReviewedCard = ({
  item,
}: {
  readonly item: InboxMakeup;
}): JSX.Element => {
  const approved = item.status === "APPROVED";
  const opinion = `审批意见：${item.approvalReason ?? "没有填写"}`;
  return (
    <Card gap stamped={approved}>
      <CardTitle
        status={approved ? undefined : { kind: "bad", text: "已驳回" }}
      >
        {personName(item)}
      </CardTitle>
      <RequestLine item={item} />
      <CardMeta>{scopeLabel(item)}</CardMeta>
      <CardMeta>申请原因：{item.reason}</CardMeta>
      {approved ? (
        <CardMeta>{opinion}</CardMeta>
      ) : (
        <View className="team-makeups__text">{opinion}</View>
      )}
      <CardMeta>
        {item.approvedAt === null
          ? "处理时间没有记录"
          : `${workTimestamp(item.approvedAt)} 处理`}
      </CardMeta>
      {approved ? (
        <Stamp
          text="已通过"
          sub={
            item.approvedAt === null
              ? undefined
              : workTimestamp(item.approvedAt).slice(0, 5)
          }
        />
      ) : null}
    </Card>
  );
};

export default function TeamMakeups(): JSX.Element {
  useSessionGuard();

  const { revision, refresh } = usePageRefresh();
  const { state } = useSession();

  const [tab, setTab] = useState<"PENDING" | "REVIEWED">("PENDING");
  const [items, setItems] = useState<readonly InboxMakeup[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const router = Taro.useRouter();
  const requestedTeamName: string | null = router.params.teamName
    ? decodeURIComponent(router.params.teamName)
    : null;
  const requestedProjectId: string | null = router.params.projectId
    ? decodeURIComponent(router.params.projectId)
    : null;
  // 从项目进来时看这个项目的全部；从公司进来默认“需要你批”，链接可带 onlyMine=false。
  const companyLevel: boolean =
    requestedProjectId === null &&
    (state.me?.roles.assignments ?? []).some(
      (assignment) => assignment.roleCode === "COMPANY_ADMIN",
    );
  const [onlyMine, setOnlyMine] = useState<boolean>(
    router.params.onlyMine !== "false",
  );
  const mine: boolean = companyLevel && onlyMine && tab === "PENDING";
  const [scope, setScope] = useState<string | null>(
    requestedTeamName === null && requestedProjectId === null
      ? ALL_SCOPES
      : null,
  );
  const [error, setError] = useState<string | null>(null);
  /** 出错的是“加载更多”：原因写在那个按钮旁边，而不是展开的那条申请下面。 */
  const [pageFailed, setPageFailed] = useState<boolean>(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Readonly<Record<string, string>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setError(null);
    setItems(null);
    setNextCursor(null);
    const load =
      tab === "PENDING"
        ? (cursor: string | null, projectId: string | null) =>
            fetchMakeupInbox(cursor, projectId, mine)
        : fetchReviewedMakeups;
    void load(null, requestedProjectId).then(
      (page) => {
        if (!cancelled) {
          setItems(page.items);
          setNextCursor(page.nextCursor);
        }
      },
      (cause) => {
        if (!cancelled) setError(errorMessage(cause, "无法读取审批列表"));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [revision, tab, requestedProjectId, mine]);
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
      confirmColor: isReject ? "#D7261E" : "#000000",
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
      setPageFailed(false);
      setError(errorMessage(cause, "审批未完成，请重试"));
    } finally {
      setBusy(null);
    }
  };
  const forProject = projectScope(items ?? [], requestedProjectId);
  const scopes = [
    ALL_SCOPES,
    ...(forProject === null ? [] : [forProject.label]),
    ...new Set((items ?? []).map(scopeLabel)),
  ];
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
    requestedItem === undefined
      ? (forProject?.label ?? null)
      : scopeLabel(requestedItem);
  const activeScope: string =
    scope !== null && scopes.includes(scope)
      ? scope
      : (requestedScope ?? ALL_SCOPES);
  const visibleItems: readonly InboxMakeup[] = (items ?? []).filter((item) =>
    inScope(item, activeScope, forProject),
  );
  const loadMore = async (): Promise<void> => {
    if (nextCursor === null || busy !== null) return;
    setBusy("page");
    setError(null);
    try {
      const page =
        tab === "PENDING"
          ? await fetchMakeupInbox(nextCursor, requestedProjectId, mine)
          : await fetchReviewedMakeups(nextCursor, requestedProjectId);
      setItems((rows) => [...(rows ?? []), ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (cause) {
      setPageFailed(true);
      setError(errorMessage(cause, "读取下一页失败"));
    } finally {
      setBusy(null);
    }
  };
  // 待审批的一次只展开一条，其余收成一行：屏上始终只有一个黑按钮。
  const { before, open, after } = arrangePending(
    visibleItems.filter((item) => item.status === "PENDING"),
    openId,
  );
  const reviewed = visibleItems.filter((item) => item.status !== "PENDING");
  const openReason: string = open === null ? "" : (reasons[open.id] ?? "");
  const errorAtCard: boolean = error !== null && open !== null && !pageFailed;
  const writeReason = (id: string, value: string): void => {
    setReasons((previous) => ({ ...previous, [id]: value }));
  };
  const collapsed = (item: InboxMakeup): JSX.Element => (
    <Row
      key={item.id}
      hazard
      title={personName(item)}
      sub={`${makeupDay(item.attendanceDate)} ${pointName(item)}，${formatChinaHm(item.requestedOccurredAt)}`}
      status={{ kind: "warn", text: "待审批" }}
      onClick={() => {
        if (busy === null) setOpenId(item.id);
      }}
    />
  );
  return (
    <Screen header={<PageHeader title="补卡审批" />}>
      <Segmented
        options={[
          {
            label:
              tab === "PENDING" && items !== null && items.length > 0
                ? `待审批 ${items.length}${nextCursor !== null ? "+" : ""}`
                : "待审批",
            value: "PENDING",
          },
          { label: "我已处理", value: "REVIEWED" },
        ]}
        value={tab}
        onChange={(value: "PENDING" | "REVIEWED") => {
          if (busy === null) setTab(value);
        }}
      />
      {companyLevel && tab === "PENDING" ? (
        <Chips
          options={MINE_OPTIONS}
          selected={[onlyMine ? "MINE" : "ALL"]}
          onToggle={(value) => {
            if (busy === null) setOnlyMine(value === "MINE");
          }}
        />
      ) : null}
      {scopes.length > 2 ? (
        <Picker
          mode="selector"
          range={scopes}
          value={scopes.indexOf(activeScope)}
          onChange={(event) => setScope(scopes[Number(event.detail.value)])}
        >
          <Sheet gap>
            <FormRow label="范围" value={activeScope} chevron />
          </Sheet>
        </Picker>
      ) : null}
      {items === null && error === null ? (
        <StateView kind="loading" title="正在读取审批列表…" />
      ) : null}
      {items === null && error ? (
        <StateView
          kind="error"
          title="审批列表没读到"
          sub={error}
          onRetry={refresh}
        />
      ) : null}
      {items?.length === 0 && nextCursor === null ? (
        <StateView
          kind="empty"
          title={tab === "PENDING" ? "都处理完了" : "还没有处理过的申请"}
          sub={
            tab === "PENDING"
              ? mine
                ? "只有你能批的申请都处理完了。其他申请班组长和项目管理员就能批，在“全部”里。"
                : "现在没有等你审批的补卡申请。"
              : "你审批过的补卡申请会留在这里。"
          }
        />
      ) : null}
      {items?.length === 0 && nextCursor !== null ? (
        <StateView kind="empty" title="这一页没有申请" sub="继续加载后面的。" />
      ) : null}
      {items !== null && items.length > 0 && visibleItems.length === 0 ? (
        <StateView
          kind="empty"
          title="这个范围没有申请"
          sub="把范围换成“全部范围”，看其他项目或班组的。"
        />
      ) : null}
      {activeScope !== ALL_SCOPES && visibleItems.length > 0 ? (
        <SectionTitle>{`${activeScope}，${visibleItems.length} 条`}</SectionTitle>
      ) : null}
      {before.length > 0 ? <Sheet gap>{before.map(collapsed)}</Sheet> : null}
      {open !== null ? (
        <View key={open.id} className="m-fade">
          <Card gap>
            <CardTitle status={{ kind: "warn", text: "待审批" }}>
              {personName(open)}
            </CardTitle>
            <RequestLine item={open} />
            <CardMeta>{scopeLabel(open)}</CardMeta>
            {companyLevel && open.onlyYou === true ? (
              <CardMeta>项目里没有更高职级的人能批，只能由你处理。</CardMeta>
            ) : null}
            <View className="team-makeups__text">{open.reason}</View>
            <View className="team-makeups__quick">
              <Chips
                onSheet
                options={QUICK_OPTIONS}
                selected={[openReason]}
                onToggle={(reason) => {
                  if (busy !== null) return;
                  writeReason(open.id, openReason === reason ? "" : reason);
                }}
              />
            </View>
            <Input
              className="team-makeups__input"
              value={openReason}
              placeholder="写审批意见，驳回必须写原因"
              placeholderClass="team-makeups__placeholder"
              maxlength={140}
              onInput={(event) => writeReason(open.id, event.detail.value)}
            />
            <CardActions>
              <Button
                loading={busy === open.id}
                disabled={busy !== null}
                onClick={() => {
                  void review(open.id, approveMakeup, "通过补卡");
                }}
              >
                {busy === open.id ? "处理中…" : "通过"}
              </Button>
              <View className="team-makeups__reject">
                <Button
                  variant="text"
                  disabled={busy !== null || openReason.trim().length === 0}
                  onClick={() => {
                    void review(open.id, rejectMakeup, "驳回补卡");
                  }}
                >
                  驳回
                </Button>
              </View>
            </CardActions>
          </Card>
          {errorAtCard ? <Notice tone="error">{error}</Notice> : null}
        </View>
      ) : null}
      {after.length > 0 ? <Sheet gap>{after.map(collapsed)}</Sheet> : null}
      {reviewed.map((item) => (
        <ReviewedCard key={item.id} item={item} />
      ))}
      {items !== null && error !== null && !errorAtCard ? (
        <Notice tone="error">{error}</Notice>
      ) : null}
      {nextCursor !== null ? (
        <Button
          variant="outline"
          wide
          loading={busy === "page"}
          onClick={() => {
            void loadMore();
          }}
        >
          {busy === "page" ? "加载中…" : "加载更多"}
        </Button>
      ) : null}
      {open !== null ? (
        <Notice>通过后考勤会重新计算。不能审批自己的申请。</Notice>
      ) : null}
    </Screen>
  );
}
