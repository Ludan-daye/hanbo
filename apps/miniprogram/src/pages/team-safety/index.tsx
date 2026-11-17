import { Picker } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import type { SafetyBriefing, SafetyIssue } from "@construction/domain";
import {
  Button,
  Field,
  ListItem,
  Notice,
  PageHeader,
  Screen,
  Section,
  Segmented,
  StateView,
  Subtitle,
} from "../../components/ui/index";
import { WorkDate, WorkNotes } from "../../components/team-work-fields";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { useManagedTeamId } from "../../hooks/use-management-scope";
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

type Tab = "BRIEFING" | "OPEN" | "ISSUE";
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
  const [briefings, setBriefings] = useState<readonly SafetyBriefing[] | null>(
    null,
  );
  const [issues, setIssues] = useState<readonly SafetyIssue[]>([]);
  const [openIssues, setOpenIssues] = useState<readonly SafetyIssue[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [members, setMembers] = useState<readonly ProjectParticipant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [creating, setCreating] = useState<boolean>(false);
  const [title, setTitle] = useState<string>("");
  const [content, setContent] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [memberId, setMemberId] = useState<string | null>(null);
  const [severity, setSeverity] = useState<"GENERAL" | "SERIOUS">("GENERAL");
  const [resolving, setResolving] = useState<string | null>(null);
  const [resolution, setResolution] = useState<string>("");
  const [memberSearch, setMemberSearch] = useState<string>("");
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
        if (active)
          setError(errorMessage(cause, "安全记录读取失败"));
      },
    );
    return () => {
      active = false;
    };
  }, [teamId, date, revision]);
  const perform = async (action: () => Promise<void>): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause: unknown) {
      const message = errorMessage(cause, "操作失败，请重试");
      setError(message);
      await Taro.showToast({ icon: "none", title: message });
    } finally {
      setBusy(false);
    }
  };
  const reuseLatestBriefing = (): Promise<void> =>
    perform(async () => {
      if (teamId === null) return;
      const previous = await fetchTeamBriefings(teamId, previousDay(date));
      const latest = previous[previous.length - 1];
      if (latest === undefined) {
        await Taro.showToast({ icon: "none", title: "前一天没有交底记录" });
        return;
      }
      setTitle(latest.title);
      setContent(latest.content);
    });
  if (teamId === null)
    return (
      <Screen>
        <PageHeader title="班组安全" />
        <StateView title="请先选择负责的班组" />
      </Screen>
    );
  return (
    <Screen>
      <PageHeader title="班组安全" />
      <Button
        variant="outline"
        onClick={() => {
          void Taro.navigateTo({
            url: `/pages/safety-credit/index?teamId=${encodeURIComponent(teamId)}`,
          });
        }}
      >
        安全信用
      </Button>
      <WorkDate value={date} onChange={setDate} />
      <Segmented
        options={[
          { label: "安全交底", value: "BRIEFING" },
          { label: "待整改", value: "OPEN" },
          { label: "按日记录", value: "ISSUE" },
        ]}
        value={tab}
        onChange={(value: Tab) => {
          setTab(value);
          setCreating(false);
        }}
      />
      {error && <Notice tone="error">{error}</Notice>}
      <Button
        variant="outline"
        disabled={tab === "BRIEFING" && date < today}
        onClick={() => setCreating(!creating)}
      >
        {creating
          ? "收起"
          : tab === "BRIEFING"
            ? date < today
              ? "往日交底不可补发"
              : "＋ 发布安全交底"
            : "＋ 记录隐患"}
      </Button>
      {creating &&
        (tab === "BRIEFING" ? (
          <Section
            title={`发布 ${date} 交底`}
            sub="发布后不可修改，补充内容需另发。"
          >
            <Field
              label="交底标题"
              value={title}
              onInput={setTitle}
              placeholder="例如：今日高处作业注意事项"
              maxLength={80}
            />
            <WorkNotes label="交底内容" value={content} onChange={setContent} />
            <Button
              variant="text"
              disabled={busy}
              onClick={() => {
                void reuseLatestBriefing();
              }}
            >
              套用前一天交底
            </Button>
            <Button
              loading={busy}
              disabled={busy || !title.trim() || !content.trim()}
              onClick={() => {
                void perform(async () => {
                  if (!title.trim() || !content.trim())
                    throw new Error("请填写标题和交底内容。");
                  if (date < today)
                    throw new Error("交底只能发布给今天或之后的日期。");
                  const confirmation = await Taro.showModal({
                    title: `发布 ${date} 安全交底`,
                    content: `《${title.trim()}》发布后不可修改，本班工人打卡前须确认。`,
                    confirmText: "确认发布",
                  });
                  if (!confirmation.confirm) return;
                  await publishTeamBriefing(teamId, {
                    workDate: date,
                    title,
                    content,
                  });
                  setCreating(false);
                  setTitle("");
                  setContent("");
                  refresh();
                  await Taro.showToast({ icon: "success", title: "已发布" });
                });
              }}
            >
              发布给本班工人
            </Button>
          </Section>
        ) : (
          <Section title="记录隐患">
            {members.length > 10 && (
              <Field
                value={memberSearch}
                placeholder="搜索姓名或手机号后再选择"
                onInput={setMemberSearch}
              />
            )}
            <Picker
              mode="selector"
              range={[
                "班组现场（不关联个人）",
                ...pickableMembers.map(
                  (person) => person.displayName ?? "姓名待补录",
                ),
              ]}
              value={
                pickableMembers.findIndex(
                  (person) => person.memberId === memberId,
                ) + 1
              }
              onChange={(event) =>
                setMemberId(
                  Number(event.detail.value) === 0
                    ? null
                    : pickableMembers[Number(event.detail.value) - 1]!.memberId,
                )
              }
            >
              <ListItem
                primary="关联人员"
                chip={
                  members.find((person) => person.memberId === memberId)
                    ?.displayName ?? "班组现场"
                }
              />
            </Picker>
            <Segmented
              options={[
                { label: "一般隐患", value: "GENERAL" },
                { label: "严重隐患", value: "SERIOUS" },
              ]}
              value={severity}
              onChange={(value: "GENERAL" | "SERIOUS") => setSeverity(value)}
            />
            <WorkNotes
              label="发现的问题与要求"
              value={description}
              onChange={setDescription}
            />
            <Button
              loading={busy}
              disabled={busy || !description.trim()}
              onClick={() => {
                void perform(async () => {
                  if (!description.trim()) throw new Error("请填写隐患内容。");
                  await recordSafetyIssue(teamId, {
                    workDate: date,
                    memberId,
                    description,
                    severity,
                  });
                  setCreating(false);
                  setDescription("");
                  setMemberId(null);
                  refresh();
                  await Taro.showToast({ icon: "success", title: "已记录" });
                });
              }}
            >
              保存隐患
            </Button>
          </Section>
        ))}
      {briefings === null ? (
        <StateView
          title={error ? "安全记录读取失败" : "正在读取安全记录…"}
          kind={error ? "error" : "loading"}
          onRetry={refresh}
        />
      ) : tab === "BRIEFING" ? (
        <>
          {briefings.length === 0 && <StateView title="当天暂无交底" />}
          {briefings.map((briefing) => (
            <Section
              key={briefing.id}
              title={briefing.title}
              sub={`已确认 ${briefing.acknowledgements.length} 人`}
            >
              <Subtitle>{briefing.content}</Subtitle>
              <ListItem
                primary="已确认"
                secondary={
                  briefing.acknowledgements.map((ack) => ack.name).join("、") ||
                  "暂无"
                }
              />
              <ListItem
                primary="在场工人待确认"
                secondary={
                  members
                    .filter(
                      (person) =>
                        !briefing.acknowledgements.some(
                          (ack) => ack.memberId === person.memberId,
                        ),
                    )
                    .map((person) => person.displayName ?? "姓名待补录")
                    .join("、") || "无"
                }
              />
            </Section>
          ))}
        </>
      ) : (
        <>
          {tab === "OPEN" && (
            <Notice>待整改不受日期限制；新记录使用所选日期。</Notice>
          )}
          {(tab === "OPEN" ? openIssues : issues).length === 0 && (
            <StateView
              title={tab === "OPEN" ? "暂无待整改隐患" : "当天暂无隐患记录"}
            />
          )}
          {(tab === "OPEN" ? openIssues : issues).map((issue) => (
            <Section
              key={issue.id}
              title={issue.memberName ?? "班组现场"}
              sub={`${issue.workDate} · ${issue.severity === "SERIOUS" ? "严重隐患" : "一般隐患"} · ${issue.resolvedAt ? "已整改" : "待整改"}`}
            >
              <Subtitle>{issue.description}</Subtitle>
              {issue.resolvedAt ? (
                <ListItem
                  primary="整改结果"
                  secondary={issue.resolution ?? ""}
                />
              ) : (
                <Button
                  variant="outline"
                  onClick={() => {
                    setResolving(issue.id);
                    setResolution("");
                  }}
                >
                  登记整改结果
                </Button>
              )}
              {resolving === issue.id && (
                <>
                  <WorkNotes
                    label="整改措施与核查结果"
                    value={resolution}
                    onChange={setResolution}
                  />
                  <Button
                    loading={busy}
                    disabled={busy || !resolution.trim()}
                    onClick={() => {
                      void perform(async () => {
                        if (!resolution.trim())
                          throw new Error("请填写整改结果。");
                        const confirm = await Taro.showModal({
                          title: "确认整改完成",
                          content: "核实整改后确认，关闭记录保留。",
                        });
                        if (confirm.confirm) {
                          await resolveSafetyIssue(
                            teamId,
                            issue.id,
                            resolution,
                          );
                          setResolving(null);
                          refresh();
                        }
                      });
                    }}
                  >
                    确认整改并关闭
                  </Button>
                </>
              )}
            </Section>
          ))}
          {tab === "OPEN" && nextCursor !== null && (
            <Button
              variant="outline"
              loading={busy}
              onClick={() => {
                void perform(async () => {
                  const page = await fetchOpenSafetyIssues(teamId, nextCursor);
                  setOpenIssues((current) => [...current, ...page.items]);
                  setNextCursor(page.nextCursor);
                });
              }}
            >
              加载更多待整改
            </Button>
          )}
        </>
      )}
    </Screen>
  );
}
