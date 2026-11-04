import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import type { TeamDailySummary } from "@construction/domain";
import {
  Button,
  ListItem,
  Notice,
  PageHeader,
  Screen,
  Section,
  StateView,
  StatCards,
  Subtitle,
} from "../../components/ui/index";
import {
  TaskDetails,
  WorkDate,
  workTimestamp,
} from "../../components/team-work-fields";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { useManagedTeamId } from "../../hooks/use-management-scope";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSession } from "../../store/session";
import {
  fetchTeamDailySummary,
  fetchSavedTeamDailySummary,
  saveTeamDailySummary,
} from "../../services/team-work";
import { chinaToday } from "../../services/time";

export default function TeamLog(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const teamId = useManagedTeamId(state.me);
  const { revision, refresh } = usePageRefresh();
  const [date, setDate] = useState<string>(chinaToday());
  const [data, setData] = useState<TeamDailySummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [saved, setSaved] = useState<TeamDailySummary | null>(null);
  useEffect(() => {
    if (teamId === null) return;
    let active: boolean = true;
    setData(null);
    setError(null);
    setSaved(null);
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
        if (active)
          setError(cause instanceof Error ? cause.message : "日报生成失败");
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
      setError(cause instanceof Error ? cause.message : "操作失败，请重试");
    } finally {
      setBusy(false);
    }
  };
  if (teamId === null)
    return (
      <Screen>
        <PageHeader title="班组日报" />
        <StateView title="请先选择负责的班组" />
      </Screen>
    );
  return (
    <Screen>
      <PageHeader title="班组日报" />
      <Subtitle>任务、考勤及安全汇总</Subtitle>
      <WorkDate value={date} onChange={setDate} />
      {error && <Notice>{error}</Notice>}
      {data === null ? (
        <StateView
          title={error ? "日报生成失败" : "正在汇总…"}
          onRetry={refresh}
        />
      ) : (
        <>
          {saved !== null && (
            <Section
              title={data === saved ? "已保存的日报" : "当前实时汇总"}
              sub={`最近保存：${workTimestamp(saved.generatedAt)}`}
            >
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  if (data === saved) refresh();
                  else setData(saved);
                }}
              >
                {data === saved ? "查看最新汇总" : "查看已保存内容"}
              </Button>
            </Section>
          )}
          <Section
            title={data.teamName}
            sub={`${data.projectName} · 更新于 ${workTimestamp(data.generatedAt)}`}
          >
            <StatCards
              items={[
                {
                  label: "任务完成",
                  value: `${data.completedTaskCount}/${data.taskCount - data.cancelledTaskCount}`,
                },
                { label: "实际出勤", value: `${data.actualAttendedDays} 人日` },
                {
                  label: "实际工时",
                  value: `${(data.workedMinutes / 60).toFixed(1)} 小时`,
                },
              ]}
            />
            <ListItem
              primary="临时用工"
              secondary={`${data.temporaryWorkerCount} 人加入当天有效任务`}
            />
            <ListItem
              primary="考勤待核查"
              secondary={`缺卡 ${data.missingPunchCount} 人次`}
            />
            <ListItem
              primary="安全情况"
              secondary={`交底 ${data.briefingCount} 条 · 确认 ${data.acknowledgementCount} 人次 · 待整改 ${data.openIssueCount} 条 · 已整改 ${data.resolvedIssueCount} 条`}
            />
            <Subtitle>
              实际工时按考勤统计，不含计划时长，不作工资依据。
            </Subtitle>
          </Section>
          <Section title="人员出勤">
            {data.people.length === 0 ? (
              <Subtitle>当天无考勤汇总记录。</Subtitle>
            ) : (
              data.people.map((person, index) => (
                <ListItem
                  key={`${person.name}-${index}`}
                  primary={person.name}
                  secondary={person.flags.join(" / ") || "无异常标记"}
                  chip={`${(person.workedMinutes / 60).toFixed(1)} 小时`}
                />
              ))
            )}
          </Section>
          {data.tasks.map((task) => (
            <Section key={task.id} title="工作任务">
              <TaskDetails task={task} />
            </Section>
          ))}
          <Button
            loading={busy}
            onClick={() => {
              void perform(async () => {
                const result = await saveTeamDailySummary(teamId, date);
                setData(result);
                setSaved(result);
              });
            }}
          >
            {saved ? "重新汇总并保存日报" : "保存当前日报"}
          </Button>
          {saved !== null && data === saved && (
            <Notice>
              汇总已保存，补卡或整改后可重新生成。
            </Notice>
          )}
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              void perform(async () => {
                await Taro.setClipboardData({
                  data: `${data.workDate} ${data.projectName} / ${data.teamName}\n任务完成 ${data.completedTaskCount}/${data.taskCount - data.cancelledTaskCount}，取消 ${data.cancelledTaskCount}\n出勤 ${data.actualAttendedDays} 人日，实际 ${(data.workedMinutes / 60).toFixed(1)} 小时，缺卡 ${data.missingPunchCount} 人次\n临时任务参与 ${data.temporaryWorkerCount} 人\n交底 ${data.briefingCount} 条，确认 ${data.acknowledgementCount} 人次，待整改 ${data.openIssueCount} 条\n${data.tasks.map((task) => `• ${task.title}：${task.assignments.map((person) => person.name).join("、") || "待安排"}`).join("\n")}`,
                });
              });
            }}
          >
            复制汇报内容
          </Button>
        </>
      )}
    </Screen>
  );
}
