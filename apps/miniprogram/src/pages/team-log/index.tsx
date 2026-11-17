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
import { errorMessage } from "../../services/error-messages";

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
  const [viewing, setViewing] = useState<"live" | "saved">("live");
  const hours = (minutes: number): string => `${(minutes / 60).toFixed(1)} 小时`;
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
        if (active)
          setError(errorMessage(cause, "日报生成失败"));
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
  const shown: TeamDailySummary | null =
    viewing === "saved" && saved !== null ? saved : data;
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
      {error && <Notice tone="error">{error}</Notice>}
      {shown === null || data === null ? (
        <StateView
          title={error ? "日报生成失败" : "正在汇总…"}
          kind={error ? "error" : "loading"}
          onRetry={refresh}
        />
      ) : (
        <>
          {saved !== null && (
            <Section
              title={viewing === "saved" ? "已保存的日报" : "当前实时汇总"}
              sub={`最近保存：${workTimestamp(saved.generatedAt)}`}
            >
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  // 回到实时汇总时重新读取，避免把刚保存的快照当作最新数据。
                  if (viewing === "saved") refresh();
                  else setViewing("saved");
                }}
              >
                {viewing === "saved" ? "查看最新汇总" : "查看已保存内容"}
              </Button>
            </Section>
          )}
          <Section
            title={shown.teamName}
            sub={`${shown.projectName} · 更新于 ${workTimestamp(shown.generatedAt)}`}
          >
            <StatCards
              items={[
                {
                  label: "任务完成",
                  value:
                    shown.taskCount - shown.cancelledTaskCount === 0
                      ? "暂无任务"
                      : `${shown.completedTaskCount}/${shown.taskCount - shown.cancelledTaskCount}`,
                },
                { label: "实际出勤", value: `${shown.actualAttendedDays} 人` },
                { label: "正常工时", value: hours(shown.normalMinutes) },
                { label: "加班工时", value: hours(shown.overtimeMinutes) },
                { label: "未分类", value: hours(shown.unclassifiedMinutes) },
                { label: "实际工时", value: hours(shown.workedMinutes) },
              ]}
            />
            <ListItem
              primary="临时用工"
              secondary={`${shown.temporaryWorkerCount} 人加入当天有效任务`}
            />
            <ListItem
              primary="考勤待核查"
              secondary={`缺卡 ${shown.missingPunchCount} 人次`}
            />
            <ListItem
              primary="安全情况"
              secondary={`交底 ${shown.briefingCount} 条 · 确认 ${shown.acknowledgementCount} 人次 · 待整改 ${shown.openIssueCount} 条 · 已整改 ${shown.resolvedIssueCount} 条`}
            />
            <ListItem
              primary="已确认违规"
              secondary={
                shown.confirmedViolationCount === null
                  ? "旧版日报未记录"
                  : `${shown.confirmedViolationCount} 次`
              }
            />
            {shown.snapshotVersion === 1 && (
              <Notice>旧版日报工时未分类，可重新汇总。</Notice>
            )}
          </Section>
          <Section title="人员出勤">
            {shown.people.length === 0 ? (
              <Subtitle>当天无考勤汇总记录。</Subtitle>
            ) : (
              shown.people.map((person, index) => (
                <ListItem
                  key={`${person.name}-${index}`}
                  primary={person.name}
                  secondary={`正常 ${hours(person.normalMinutes)} · 加班 ${hours(person.overtimeMinutes)} · 未分类 ${hours(person.unclassifiedMinutes)}${person.safetyCreditScore === null ? "" : ` · 信用 ${person.safetyCreditScore}`} · ${person.flags.join(" / ") || "无异常"}`}
                  chip={hours(person.workedMinutes)}
                  tone={person.flags.length > 0 ? "danger" : undefined}
                />
              ))
            )}
          </Section>
          {shown.tasks.filter((task) => task.status !== "CANCELLED").length >
            0 && (
            <Section title="工作任务">
              {shown.tasks
                .filter((task) => task.status !== "CANCELLED")
                .map((task) => (
                  <TaskDetails key={task.id} task={task} />
                ))}
            </Section>
          )}
          {shown.tasks.some((task) => task.status === "CANCELLED") && (
            <Section title="已取消任务">
              {shown.tasks
                .filter((task) => task.status === "CANCELLED")
                .map((task) => (
                  <TaskDetails key={task.id} task={task} />
                ))}
            </Section>
          )}
          <Button
            loading={busy}
            onClick={() => {
              void perform(async () => {
                const result = await saveTeamDailySummary(teamId, date);
                setData(result);
                setSaved(result);
                setViewing("saved");
                await Taro.showToast({ icon: "success", title: "日报已保存" });
              });
            }}
          >
            {saved ? "重新汇总并保存日报" : "保存当前日报"}
          </Button>
          {saved !== null && viewing === "saved" && (
            <Notice tone="success">汇总已保存，补卡或整改后可重新生成。</Notice>
          )}
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              void perform(async () => {
                await Taro.setClipboardData({
                  data: `${shown.workDate} ${shown.projectName} / ${shown.teamName}\n任务完成 ${shown.completedTaskCount}/${shown.taskCount - shown.cancelledTaskCount}，取消 ${shown.cancelledTaskCount}\n出勤 ${shown.actualAttendedDays} 人，实际 ${hours(shown.workedMinutes)}，缺卡 ${shown.missingPunchCount} 人次\n正常 ${hours(shown.normalMinutes)}，加班 ${hours(shown.overtimeMinutes)}，未分类 ${hours(shown.unclassifiedMinutes)}\n临时任务参与 ${shown.temporaryWorkerCount} 人\n交底 ${shown.briefingCount} 条，确认 ${shown.acknowledgementCount} 人次，待整改 ${shown.openIssueCount} 条\n${shown.tasks.filter((task) => task.status !== "CANCELLED").map((task) => `• ${task.title}：${task.assignments.map((person) => person.name).join("、") || "待安排"}`).join("\n")}`,
                });
                await Taro.showToast({ icon: "success", title: "已复制" });
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
