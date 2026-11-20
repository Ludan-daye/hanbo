import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import type { TeamDailySummary } from "@construction/domain";
import {
  BottomBar,
  Button,
  Card,
  Notice,
  Numbers,
  PageHeader,
  Row,
  Screen,
  SectionTitle,
  Segmented,
  Sheet,
  SignLine,
  SkeletonRows,
  StateView,
  Status,
} from "../../components/ui/index";
import {
  TaskDetails,
  WorkDate,
  workTimestamp,
} from "../../components/team-work-fields";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { useManagedTeamId } from "../../hooks/use-management-scope";
import { NoTeamScreen } from "../../components/team-site/index";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSession } from "../../store/session";
import {
  fetchTeamDailySummary,
  fetchSavedTeamDailySummary,
  saveTeamDailySummary,
} from "../../services/team-work";
import { chinaToday } from "../../services/time";
import { errorMessage } from "../../services/error-messages";
import {
  hoursNumber,
  logHeadline,
  peopleByException,
  personSub,
  reportText,
} from "./log-view";

import "./index.scss";

type Viewing = "live" | "saved";
type Doing = "save" | "copy";
export default function TeamLog(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const teamId = useManagedTeamId(state.me);
  const { revision, refresh } = usePageRefresh();
  const [date, setDate] = useState<string>(chinaToday());
  const [data, setData] = useState<TeamDailySummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doing, setDoing] = useState<Doing | null>(null);
  const [saved, setSaved] = useState<TeamDailySummary | null>(null);
  const [viewing, setViewing] = useState<Viewing>("live");
  const busy: boolean = doing !== null;
  useEffect(() => {
    if (teamId === null) return;
    let active: boolean = true;
    setData(null);
    setError(null);
    setSaved(null);
    setViewing("live");
    void Promise.all([
      fetchTeamDailySummary(teamId, date),
      fetchSavedTeamDailySummary(teamId, date),
    ]).then(
      ([result, snapshot]) => {
        if (active) {
          setData(result);
          setSaved(snapshot);
        }
      },
      (cause: unknown) => {
        if (active) setError(errorMessage(cause, "日报生成失败"));
      },
    );
    return () => {
      active = false;
    };
  }, [teamId, date, revision]);
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
      await Taro.showToast({ icon: "none", title: message });
    } finally {
      setDoing(null);
    }
  };
  const shown: TeamDailySummary | null =
    viewing === "saved" && saved !== null ? saved : data;
  if (teamId === null)
    return (
      <NoTeamScreen title="班组日报" me={state.me} />
    );
  if (shown === null || data === null)
    return (
      <Screen header={<PageHeader title="班组日报" />}>
        <WorkDate value={date} onChange={setDate} />
        {error ? (
          <StateView
            kind="error"
            title="日报没汇总出来"
            sub={error}
            onRetry={refresh}
          />
        ) : (
          <>
            <View className="sk team-log__sk-sign" />
            <SkeletonRows rows={3} gap />
          </>
        )}
      </Screen>
    );

  const headline = logHeadline(shown);
  const tasks = shown.tasks.filter((task) => task.status !== "CANCELLED");
  const cancelled = shown.tasks.filter((task) => task.status === "CANCELLED");
  return (
    <Screen header={<PageHeader title="班组日报" />}>
      <WorkDate value={date} onChange={setDate} />
      {saved !== null ? (
        <Segmented
          options={[
            { label: "最新汇总", value: "live" },
            { label: "已保存的", value: "saved" },
          ]}
          value={viewing}
          onChange={(value: Viewing) => {
            if (busy || value === viewing) return;
            // 回到实时汇总时重新读取，避免把刚保存的快照当作最新数据。
            if (value === "live") refresh();
            else setViewing("saved");
          }}
        />
      ) : null}
      <SignLine title={headline.title} sub={headline.sub} />
      <Notice>
        {shown.projectName}，{shown.teamName}，
        {workTimestamp(shown.generatedAt)}{" "}
        {viewing === "saved" ? "保存" : "汇总"}
        {saved !== null && viewing === "live"
          ? `。上次保存 ${workTimestamp(saved.generatedAt)}`
          : ""}
      </Notice>
      <Numbers
        gap
        items={[
          { label: "正常工时", value: hoursNumber(shown.normalMinutes) },
          { label: "加班工时", value: hoursNumber(shown.overtimeMinutes) },
          { label: "未分类", value: hoursNumber(shown.unclassifiedMinutes) },
        ]}
      />
      {shown.snapshotVersion === 1 ? (
        <Notice>这是旧版日报，工时没有分类，可以重新汇总。</Notice>
      ) : null}
      <Sheet gap>
        <Row
          title="安全交底"
          value={`${shown.briefingCount} 条，已确认 ${shown.acknowledgementCount} 人次`}
          mute
        />
        <Row
          title="隐患"
          sub={
            shown.openIssueCount > 0 && shown.resolvedIssueCount > 0
              ? `已整改 ${shown.resolvedIssueCount} 条`
              : undefined
          }
          status={
            shown.openIssueCount > 0
              ? { kind: "warn", text: `${shown.openIssueCount} 条待整改` }
              : shown.resolvedIssueCount > 0
                ? { kind: "ok", text: `已整改 ${shown.resolvedIssueCount} 条` }
                : undefined
          }
          value={
            shown.openIssueCount + shown.resolvedIssueCount === 0
              ? "没有"
              : undefined
          }
          mute
        />
        <Row
          title="已确认违规"
          value={
            shown.confirmedViolationCount === null
              ? "旧版日报没有记录"
              : `${shown.confirmedViolationCount} 次`
          }
          mute
        />
        <Row
          title="临时用工"
          sub="加入当天有效任务的人"
          value={`${shown.temporaryWorkerCount} 人`}
          mute
        />
      </Sheet>
      <SectionTitle>人员出勤</SectionTitle>
      {shown.people.length === 0 ? (
        <Notice>这一天没有考勤汇总记录。</Notice>
      ) : (
        <Sheet>
          {peopleByException(shown.people).map((person, index) => (
            <View key={`${person.name}-${index}`} className="team-log__person">
              <View className="team-log__avatar">
                {person.name.slice(0, 1)}
              </View>
              <View className="team-log__who">
                <View className="team-log__name">{person.name}</View>
                <View className="team-log__sub">{personSub(person)}</View>
              </View>
              <View className="team-log__right">
                {person.flags.length > 0 ? (
                  <Status kind="bad">{person.flags.join("、")}</Status>
                ) : (
                  <>
                    <Text className="num team-log__hours">
                      {hoursNumber(person.workedMinutes)}
                    </Text>
                    小时
                  </>
                )}
              </View>
            </View>
          ))}
        </Sheet>
      )}
      {tasks.length > 0 ? <SectionTitle>工作任务</SectionTitle> : null}
      {tasks.map((task, index) => (
        <Card key={task.id} gap={index > 0}>
          <TaskDetails task={task} />
        </Card>
      ))}
      {cancelled.length > 0 ? <SectionTitle>已取消的任务</SectionTitle> : null}
      {cancelled.map((task, index) => (
        <Card key={task.id} gap={index > 0}>
          <TaskDetails task={task} />
        </Card>
      ))}
      {saved !== null && viewing === "saved" ? (
        <Notice>
          这是保存下来的日报。补卡或整改之后，可以重新汇总再保存。
        </Notice>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      <BottomBar
        primary={
          doing === "save"
            ? "保存中…"
            : saved !== null
              ? "重新汇总并保存"
              : "保存日报"
        }
        busy={busy}
        onPrimary={() => {
          void perform("save", async () => {
            const result = await saveTeamDailySummary(teamId, date);
            setData(result);
            setSaved(result);
            setViewing("saved");
            await Taro.showToast({ icon: "success", title: "日报已保存" });
          });
        }}
      >
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            void perform("copy", async () => {
              await Taro.setClipboardData({ data: reportText(shown) });
              await Taro.showToast({ icon: "success", title: "已复制" });
            });
          }}
        >
          复制
        </Button>
      </BottomBar>
    </Screen>
  );
}
