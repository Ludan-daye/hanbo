import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import type { SafetyBriefing, TeamTask } from "@construction/domain";
import {
  Button,
  Field,
  Notice,
  PageHeader,
  Screen,
  Section,
  StateView,
  Subtitle,
} from "../../components/ui/index";
import { TaskDetails, WorkDate } from "../../components/team-work-fields";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSession } from "../../store/session";
import {
  acknowledgeBriefing,
  fetchMyBriefings,
  fetchMyTasks,
  joinTemporaryTask,
} from "../../services/team-work";
import { chinaToday } from "../../services/time";

export default function MyTasks(): JSX.Element {
  useSessionGuard();
  const { refreshMe } = useSession();
  const { revision, refresh } = usePageRefresh();
  const [date, setDate] = useState<string>(chinaToday());
  const [tasks, setTasks] = useState<readonly TeamTask[] | null>(null);
  const [briefings, setBriefings] = useState<readonly SafetyBriefing[]>([]);
  const [code, setCode] = useState<string>("");
  const [joining, setJoining] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active: boolean = true;
    setTasks(null);
    setError(null);
    void Promise.all([fetchMyTasks(date), fetchMyBriefings(date)]).then(
      ([rows, notices]) => {
        if (active) {
          setTasks(rows);
          setBriefings(notices);
        }
      },
      (cause: unknown) => {
        if (active)
          setError(cause instanceof Error ? cause.message : "工作任务读取失败");
      },
    );
    return () => {
      active = false;
    };
  }, [date, revision]);
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
  return (
    <Screen>
      <PageHeader title="我的任务" />
      <Subtitle>工作安排与安全交底</Subtitle>
      <Button variant="outline" onClick={() => setJoining(!joining)}>
        {joining ? "收起邀请码" : "六位邀请码入场"}
      </Button>
      {joining && (
        <Section
          title="加入临时任务"
          sub="使用本人专属邀请码"
        >
          <Field
            label="六位邀请码"
            value={code}
            onInput={setCode}
            type="number"
            maxLength={6}
            placeholder="请输入六位数字"
          />
          <Button
            loading={busy}
            onClick={() => {
              void perform(async () => {
                if (!/^\d{6}$/.test(code))
                  throw new Error("请输入六位数字邀请码。");
                await joinTemporaryTask(code);
                await refreshMe();
                setCode("");
                setJoining(false);
                refresh();
                await Taro.showToast({ icon: "success", title: "已加入任务" });
              });
            }}
          >
            确认加入
          </Button>
        </Section>
      )}
      <WorkDate value={date} onChange={setDate} />
      {error && <Notice>{error}</Notice>}
      {tasks === null ? (
        <StateView
          title={error ? "任务加载失败" : "正在读取任务…"}
          onRetry={refresh}
        />
      ) : (
        <>
          {briefings.map((briefing) => (
            <Section
              key={briefing.id}
              title={briefing.title}
              sub={`${briefing.projectName} · ${briefing.teamName}`}
            >
              <Subtitle>{briefing.content}</Subtitle>
              <Button
                variant="outline"
                disabled={briefing.acknowledged || busy}
                onClick={() => {
                  void perform(async () => {
                    const confirm = await Taro.showModal({
                      title: "确认安全交底",
                      content: "理解作业要求后确认；有疑问请联系班组长。",
                    });
                    if (confirm.confirm) {
                      await acknowledgeBriefing(briefing.id);
                      refresh();
                    }
                  });
                }}
              >
                {briefing.acknowledged ? "已阅读并确认" : "我已阅读并理解"}
              </Button>
            </Section>
          ))}
          {tasks.length === 0 && (
            <StateView
              title="当天暂无工作任务"
              sub="常规打卡入口：我的项目。"
            />
          )}
          {tasks.map((task) => (
            <Section key={task.id} title="工作任务">
              <TaskDetails task={task} />
              {task.assignments
                .filter((person) => person.taskAttendanceOnly)
                .map((person) => (
                  <Section
                    key={person.memberId}
                    title={
                      person.finishedAt
                        ? "已完工"
                        : person.startedAt
                          ? "作业中"
                          : "待开工"
                    }
                  >
                    <Subtitle>
                      {person.startedAt
                        ? `开工：${new Date(person.startedAt).toLocaleString()}`
                        : "到现场后开始打卡"}
                    </Subtitle>
                    <Subtitle>
                      {person.finishedAt
                        ? `实际用工 ${person.workedMinutes ?? 0} 分钟`
                        : "按开工、完工记录计时"}
                    </Subtitle>
                    {person.exitConfirmedAt && (
                      <Subtitle>班组长已确认退场，记录保留。</Subtitle>
                    )}
                    {task.status === "OPEN" &&
                      !person.finishedAt &&
                      !person.exitConfirmedAt && (
                        <Button
                          disabled={busy}
                          onClick={() => {
                            void Taro.navigateTo({
                              url: `/pages/punch/index?projectId=${encodeURIComponent(task.projectId)}&taskId=${encodeURIComponent(task.id)}`,
                            });
                          }}
                        >
                          {person.startedAt ? "完工打卡" : "开工打卡"}
                        </Button>
                      )}
                    {task.status === "OPEN" &&
                      person.startedAt &&
                      !person.finishedAt && (
                        <Button
                          variant="outline"
                          onClick={() => {
                            void Taro.navigateTo({
                              url: `/pages/submit-makeup/index?projectId=${encodeURIComponent(task.projectId)}&taskId=${encodeURIComponent(task.id)}`,
                            });
                          }}
                        >
                          申请完工补卡
                        </Button>
                      )}
                  </Section>
                ))}
              {task.status !== "CANCELLED" && (
                <Button
                  variant="outline"
                  onClick={() => {
                    void Taro.navigateTo({
                      url: `/pages/my-project-detail/index?projectId=${encodeURIComponent(task.projectId)}`,
                    });
                  }}
                >
                  查看项目与打卡要求
                </Button>
              )}
            </Section>
          ))}
        </>
      )}
    </Screen>
  );
}
