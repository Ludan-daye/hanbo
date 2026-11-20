import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import type { SafetyBriefing, SafetyIssue } from "@construction/domain";
import {
  BottomBar,
  Notice,
  PageHeader,
  Row,
  Screen,
  Segmented,
  Sheet,
  StateView,
} from "../../components/ui/index";
import { WorkDate, workDateLabel } from "../../components/team-work-fields";
import { useLeaveGuard } from "../../hooks/use-leave-guard";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { useManagedTeamId } from "../../hooks/use-management-scope";
import { NoTeamScreen } from "../../components/team-site/index";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSession } from "../../store/session";
import { fetchTeamParticipants } from "../../services/management";
import type { ProjectParticipant } from "../../services/management.types";
import {
  fetchTeamBriefings,
  fetchSafetyIssues,
  fetchOpenSafetyIssues,
  publishTeamBriefing,
  recordSafetyIssue,
  resolveSafetyIssue,
} from "../../services/team-work";
import { chinaToday } from "../../services/time";
import { errorMessage } from "../../services/error-messages";
import { arrangeIssues } from "./safety-view";
import { BriefingCards } from "./views/briefings";
import { IssuesView } from "./views/issues";
import { PublishView } from "./views/publish";
import { RecordView } from "./views/record";

import "./index.scss";

type Tab = "BRIEFING" | "OPEN" | "ISSUE";
/** 同一个页面路径里的三个视图：列表、发布交底、记录隐患。 */
type ViewName = "list" | "publish" | "record";
type Doing = "publish" | "reuse" | "record" | "resolve" | "more";
const SITE = "班组现场（不关联个人）";
const previousDay = (value: string): string =>
  new Date(Date.parse(`${value}T00:00:00Z`) - 86400_000)
    .toISOString()
    .slice(0, 10);
export default function TeamSafety(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const teamId = useManagedTeamId(state.me);
  const { revision, refresh } = usePageRefresh();
  const [date, setDate] = useState<string>(chinaToday());
  const [tab, setTab] = useState<Tab>("BRIEFING");
  const [view, setView] = useState<ViewName>("list");
  const [briefings, setBriefings] = useState<readonly SafetyBriefing[] | null>(
    null,
  );
  const [issues, setIssues] = useState<readonly SafetyIssue[]>([]);
  const [openIssues, setOpenIssues] = useState<readonly SafetyIssue[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [members, setMembers] = useState<readonly ProjectParticipant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [doing, setDoing] = useState<Doing | null>(null);
  /** 上一次出错的是哪个操作：决定出错说明放在哪个按钮旁边。 */
  const [failed, setFailed] = useState<Doing | null>(null);
  const [title, setTitle] = useState<string>("");
  const [content, setContent] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [memberId, setMemberId] = useState<string | null>(null);
  const [severity, setSeverity] = useState<"GENERAL" | "SERIOUS">("GENERAL");
  const [resolving, setResolving] = useState<string | null>(null);
  const [resolution, setResolution] = useState<string>("");
  const [memberSearch, setMemberSearch] = useState<string>("");
  // 记录隐患的“发现日期”自己存一份：改它不影响列表看的是哪一天。
  const [recordDate, setRecordDate] = useState<string>(date);
  const busy: boolean = doing !== null;
  // 发布、记录是同一页里的子视图：系统返回会关掉整页，填了东西先问一下。
  useLeaveGuard(
    view === "publish" && (title.trim() !== "" || content.trim() !== "")
      ? "交底还没发布，离开后填的内容不保留。"
      : view === "record" && description.trim() !== ""
        ? "隐患还没保存，离开后填的内容不保留。"
        : null,
  );
  const today: string = chinaToday();
  const pickableMembers: readonly ProjectParticipant[] = members.filter(
    (person) =>
      memberSearch.trim().length === 0 ||
      (person.displayName ?? "").includes(memberSearch.trim()) ||
      person.phone.includes(memberSearch.trim()),
  );
  useEffect(() => {
    if (teamId === null) return;
    let active: boolean = true;
    setBriefings(null);
    setError(null);
    void Promise.all([
      fetchTeamBriefings(teamId, date),
      fetchSafetyIssues(teamId, date),
      fetchOpenSafetyIssues(teamId, null),
      fetchTeamParticipants(teamId),
    ]).then(
      ([rows, problems, pending, people]) => {
        if (active) {
          setBriefings(rows);
          setIssues(problems);
          setOpenIssues(pending.items);
          setNextCursor(pending.nextCursor);
          setMembers(
            people.filter(
              (person) =>
                person.status === "ACTIVE" &&
                person.participantType === "WORKER",
            ),
          );
        }
      },
      (cause: unknown) => {
        if (active) setError(errorMessage(cause, "安全记录读取失败"));
      },
    );
    return () => {
      active = false;
    };
  }, [teamId, date, revision]);
  // 换了视图就回到顶上：同一个页面里切换，滚动位置不会自己复位。
  useEffect(() => {
    void Taro.pageScrollTo({ scrollTop: 0, duration: 0 });
  }, [view]);
  const perform = async (
    kind: Doing,
    action: () => Promise<void>,
  ): Promise<void> => {
    if (busy) return;
    setDoing(kind);
    setError(null);
    try {
      await action();
    } catch (cause: unknown) {
      const message = errorMessage(cause, "操作失败，请重试");
      setError(message);
      setFailed(kind);
      await Taro.showToast({ icon: "none", title: message });
    } finally {
      setDoing(null);
    }
  };
  if (teamId === null)
    return (
      <NoTeamScreen title="班组安全" me={state.me} />
    );

  const openView = (next: ViewName): void => {
    if (busy) return;
    setError(null);
    if (next === "record") setRecordDate(date);
    setView(next);
  };
  const backToList = (): void => openView("list");
  const reuseLatestBriefing = (): Promise<void> =>
    perform("reuse", async () => {
      const previous = await fetchTeamBriefings(teamId, previousDay(date));
      const latest = previous[previous.length - 1];
      if (latest === undefined) {
        await Taro.showToast({ icon: "none", title: "前一天没有交底记录" });
        return;
      }
      setTitle(latest.title);
      setContent(latest.content);
    });
  const publish = (): Promise<void> =>
    perform("publish", async () => {
      if (!title.trim() || !content.trim())
        throw new Error("请填写标题和交底内容。");
      if (date < today) throw new Error("交底只能发布给今天或之后的日期。");
      const confirmation = await Taro.showModal({
        title: `发布${workDateLabel(date)}的交底`,
        content: `《${title.trim()}》发出去就不能改，本班工人打卡前都要确认。`,
        confirmText: "发布",
      });
      if (!confirmation.confirm) return;
      await publishTeamBriefing(teamId, {
        workDate: date,
        title,
        content,
      });
      setView("list");
      setTitle("");
      setContent("");
      refresh();
      await Taro.showToast({ icon: "success", title: "已发布" });
    });
  const record = (): Promise<void> =>
    perform("record", async () => {
      if (!description.trim()) throw new Error("请填写隐患内容。");
      await recordSafetyIssue(teamId, {
        workDate: recordDate,
        memberId,
        description,
        severity,
      });
      setView("list");
      setDescription("");
      setMemberId(null);
      refresh();
      await Taro.showToast({ icon: "success", title: "已记录" });
    });

  if (view === "publish")
    return (
      <Screen header={<PageHeader title="发布交底" onBack={backToList} />}>
        <PublishView
          teamName={
            members.find((person) => person.teamName)?.teamName ??
            briefings?.[0]?.teamName ??
            null
          }
          date={date}
          title={title}
          content={content}
          error={error}
          busy={busy}
          publishing={doing === "publish"}
          reusing={doing === "reuse"}
          onTitle={setTitle}
          onContent={setContent}
          onReuse={() => {
            void reuseLatestBriefing();
          }}
          onPublish={() => {
            void publish();
          }}
        />
      </Screen>
    );
  if (view === "record")
    return (
      <Screen header={<PageHeader title="记录隐患" onBack={backToList} />}>
        <RecordView
          search={members.length > 10 ? memberSearch : null}
          people={[
            SITE,
            ...pickableMembers.map(
              (person) => person.displayName ?? "姓名待补录",
            ),
          ]}
          personIndex={
            pickableMembers.findIndex(
              (person) => person.memberId === memberId,
            ) + 1
          }
          personName={
            members.find((person) => person.memberId === memberId)
              ?.displayName ?? "班组现场"
          }
          severity={severity}
          date={recordDate}
          description={description}
          error={error}
          busy={busy}
          saving={doing === "record"}
          onSearch={setMemberSearch}
          onPerson={(index) =>
            setMemberId(
              index === 0 ? null : pickableMembers[index - 1]!.memberId,
            )
          }
          onSeverity={setSeverity}
          onDate={setRecordDate}
          onDescription={setDescription}
          onSave={() => {
            void record();
          }}
        />
      </Screen>
    );

  // 待整改不分日期；按日记录里没整改的也能直接登记结果。
  const { waiting, done, active } = arrangeIssues(
    tab === "OPEN" ? openIssues : issues,
    resolving,
  );
  // 写了一半的整改结果只属于写它时展开的那一条，列表变了也不会串到别的隐患上。
  const draft: string =
    active !== null && resolving === active.id ? resolution : "";
  const resolve = (): Promise<void> =>
    perform("resolve", async () => {
      if (active === null) return;
      if (!draft.trim()) throw new Error("请填写整改结果。");
      const confirm = await Taro.showModal({
        title: "确认整改完成",
        content: "请先核实已经整改。关闭后这条记录仍然保留。",
        confirmText: "确认关闭",
      });
      if (confirm.confirm) {
        await resolveSafetyIssue(teamId, active.id, draft);
        setResolving(null);
        setResolution("");
        refresh();
      }
    });
  const loadMore = (): Promise<void> =>
    perform("more", async () => {
      const page = await fetchOpenSafetyIssues(teamId, nextCursor);
      setOpenIssues((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
    });
  return (
    <Screen header={<PageHeader title="班组安全" />}>
      <Segmented
        options={[
          { label: "安全交底", value: "BRIEFING" },
          {
            label:
              openIssues.length > 0
                ? `待整改 ${openIssues.length}${nextCursor !== null ? "+" : ""}`
                : "待整改",
            value: "OPEN",
          },
          { label: "按日记录", value: "ISSUE" },
        ]}
        value={tab}
        onChange={(value: Tab) => {
          setTab(value);
          setResolving(null);
          setResolution("");
        }}
      />
      {tab === "OPEN" ? (
        <Notice>没整改的隐患不分日期都在这里，整改完登记结果才会关闭。</Notice>
      ) : (
        <WorkDate value={date} onChange={setDate} />
      )}
      {briefings === null ? (
        error ? (
          <StateView
            kind="error"
            title="安全记录没读到"
            sub={error}
            onRetry={refresh}
          />
        ) : (
          <StateView kind="loading" title="正在读取安全记录…" />
        )
      ) : tab === "BRIEFING" ? (
        <>
          {briefings.length === 0 ? (
            <StateView
              kind="empty"
              title={
                date < today
                  ? "这一天没有交底"
                  : date === today
                    ? "今天还没发交底"
                    : "这一天还没发交底"
              }
              sub={date < today ? undefined : "工人打卡前要先确认当天的交底。"}
            />
          ) : (
            <BriefingCards briefings={briefings} members={members} />
          )}
          {error ? <Notice tone="error">{error}</Notice> : null}
        </>
      ) : (
        <IssuesView
          waiting={waiting}
          done={done}
          active={active}
          draft={draft}
          error={error}
          moreFailed={failed === "more"}
          busy={busy}
          closing={doing === "resolve"}
          hasMore={tab === "OPEN" && nextCursor !== null}
          loadingMore={doing === "more"}
          emptyTitle={
            tab === "OPEN" ? "没有待整改的隐患" : "这一天没有隐患记录"
          }
          onOpen={(id) => {
            if (busy) return;
            setResolving(id);
            setResolution("");
          }}
          onDraft={(value) => {
            if (active === null) return;
            setResolving(active.id);
            setResolution(value);
          }}
          onResolve={() => {
            void resolve();
          }}
          onMore={() => {
            void loadMore();
          }}
          onRecord={() => openView("record")}
        />
      )}
      {tab === "BRIEFING" ? (
        <>
          <Sheet gap>
            <Row
              title="安全信用"
              icon="star"
              chevron
              onClick={() => {
                void Taro.navigateTo({
                  url: `/pages/safety-credit/index?teamId=${encodeURIComponent(teamId)}`,
                });
              }}
            />
          </Sheet>
          {date < today ? (
            <Notice>往日的交底只能看，不能补发。</Notice>
          ) : (
            <BottomBar
              primary="发布安全交底"
              onPrimary={() => openView("publish")}
            />
          )}
        </>
      ) : null}
    </Screen>
  );
}
