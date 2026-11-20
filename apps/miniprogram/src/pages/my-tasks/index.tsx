import Taro, { usePullDownRefresh } from "@tarojs/taro";
import { View } from "@tarojs/components";
import { useEffect, useState } from "react";
import type { SafetyBriefing, TeamTask } from "@construction/domain";

import { TaskDetails, WorkDate } from "../../components/team-work-fields";
import {
  BottomBar,
  Button,
  Card,
  CardActions,
  CardMeta,
  Divider,
  FormInput,
  KV,
  Links,
  Notice,
  PageHeader,
  Screen,
  SectionTitle,
  Sheet,
  StateView,
  Status,
} from "../../components/ui/index";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { errorMessage } from "../../services/error-messages";
import {
  acknowledgeBriefing,
  fetchMyBriefings,
  fetchMyTasks,
  joinTemporaryTask,
} from "../../services/team-work";
import { chinaToday, formatChinaDate } from "../../services/time";
import { useSession } from "../../store/session";
import {
  canApplyFinishMakeup,
  canApplyStartMakeup,
  canPunchTask,
  startReminded,
  primaryTaskId,
  startedAtLabel,
  taskProgress,
} from "./task-view";

import "./index.scss";

/** 加入任务、确认交底没成功的原因。at 记着是哪一个操作，提示就显示在它旁边。 */
type Failure = { readonly at: string; readonly text: string };
const JOIN = "join";

const go = (url: string): void => {
  void Taro.navigateTo({ url });
};

/** 一项任务：基本情况、我的进度，加上现在能做的操作。 */
const TaskCard = ({
  task,
  date,
  isToday,
  primary,
  busy,
}: {
  readonly task: TeamTask;
  /** 正在看的那一天。 */
  readonly date: string;
  readonly isToday: boolean;
  /** 这一屏的黑按钮是不是给这项任务。 */
  readonly primary: boolean;
  readonly busy: boolean;
}): JSX.Element => {
  const mine = task.assignments.filter((person) => person.taskAttendanceOnly);
  const project = encodeURIComponent(task.projectId);
  // 该补开工卡的人不再显示现场开工打卡，免得补卡和现场卡各记一次。
  const puncher = mine.find(
    (person) =>
      canPunchTask(task, person, isToday) &&
      !canApplyStartMakeup(task, person, Date.now()),
  );
  // 开工补卡和完工补卡不会同时出现：一个要求没开工，一个要求已开工。
  const startMakeup = mine.some((person) =>
    canApplyStartMakeup(task, person, Date.now()),
  );
  const makeup =
    startMakeup ||
    mine.some((person) => canApplyFinishMakeup(task, person, isToday));
  const startDay = formatChinaDate(task.startsAt);
  const makeupUrl = startMakeup
    ? `/pages/submit-makeup/index?projectId=${project}&taskId=${encodeURIComponent(task.id)}&point=start&date=${startDay < chinaToday() ? startDay : chinaToday()}`
    : `/pages/submit-makeup/index?projectId=${project}&taskId=${encodeURIComponent(task.id)}`;
  const detail = task.status !== "CANCELLED";
  const detailButton = (variant: "outline" | "text"): JSX.Element => (
    <Button
      variant={variant}
      onClick={() => go(`/pages/my-project-detail/index?projectId=${project}`)}
    >
      项目详情
    </Button>
  );
  return (
    <Card gap>
      <TaskDetails task={task} />
      {mine.map((person) => {
        const progress = taskProgress(person);
        return (
          <View key={person.memberId}>
            <Divider />
            <KV label="我的进度">
              <Status kind={progress.kind}>{progress.text}</Status>
            </KV>
            {startReminded(person) ? (
              <KV label="开工">
                <Status kind="warn">漏打开工卡</Status>
              </KV>
            ) : (
              <KV
                label="开工"
                value={
                  person.startedAt
                    ? startedAtLabel(person.startedAt, date)
                    : "到现场后打卡"
                }
              />
            )}
            <KV
              label="记工"
              value={
                person.finishedAt
                  ? `${person.workedMinutes ?? 0} 分钟`
                  : "从开工算到完工"
              }
            />
            {person.exitConfirmedAt ? (
              <CardMeta>班组长已确认退场，记录保留。</CardMeta>
            ) : null}
            {startReminded(person) ? (
              <CardMeta>
                管理人员发现你没打开工卡。请申请开工补卡，审批通过后从实际开工时间算工。
              </CardMeta>
            ) : null}
          </View>
        );
      })}
      {puncher || makeup || detail ? (
        <CardActions>
          {puncher ? (
            <Button
              variant={primary ? "primary" : "outline"}
              disabled={busy}
              onClick={() =>
                go(
                  `/pages/punch/index?projectId=${project}&taskId=${encodeURIComponent(task.id)}`,
                )
              }
            >
              {puncher.startedAt ? "完工打卡" : "开工打卡"}
            </Button>
          ) : null}
          {makeup ? (
            <Button
              variant={puncher ? "text" : "outline"}
              onClick={() => go(makeupUrl)}
            >
              {startMakeup ? "申请开工补卡" : "申请完工补卡"}
            </Button>
          ) : null}
          {/* 一行放不下三个：打卡和补卡都在时，“项目详情”换到下一行。 */}
          {detail && !(puncher && makeup)
            ? detailButton(puncher || makeup ? "text" : "outline")
            : null}
        </CardActions>
      ) : null}
      {detail && puncher && makeup ? (
        <View className="my-tasks__more">{detailButton("text")}</View>
      ) : null}
    </Card>
  );
};

export default function MyTasks(): JSX.Element {
  useSessionGuard();
  const { refreshMe } = useSession();
  const { revision, refresh } = usePageRefresh();
  usePullDownRefresh(refresh);
  const [date, setDate] = useState<string>(chinaToday());
  const isToday = date === chinaToday();
  const [tasks, setTasks] = useState<readonly TeamTask[] | null>(null);
  const [briefings, setBriefings] = useState<readonly SafetyBriefing[]>([]);
  const [code, setCode] = useState<string>("");
  const [joining, setJoining] = useState<boolean>(false);
  // 正在提交的是哪一个操作；没有在提交时为 null。
  const [busyAt, setBusyAt] = useState<string | null>(null);
  const busy = busyAt !== null;
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  useEffect(() => {
    let active: boolean = true;
    setTasks(null);
    setError(null);
    setFailure(null);
    void Promise.all([fetchMyTasks(date), fetchMyBriefings(date)])
      .then(
        ([rows, notices]) => {
          if (active) {
            setTasks(rows);
            setBriefings(notices);
          }
        },
        (cause: unknown) => {
          if (active) setError(errorMessage(cause, "工作任务读取失败"));
        },
      )
      .finally(() => Taro.stopPullDownRefresh());
    return () => {
      active = false;
    };
  }, [date, revision]);
  const perform = async (
    at: string,
    action: () => Promise<void>,
  ): Promise<void> => {
    if (busy) return;
    setBusyAt(at);
    setFailure(null);
    try {
      await action();
    } catch (cause: unknown) {
      setFailure({ at, text: errorMessage(cause, "操作失败，请重试") });
    } finally {
      setBusyAt(null);
    }
  };
  const showJoin = (open: boolean): void => {
    setFailure(null);
    setJoining(open);
  };

  // 输入邀请码是单独的一屏：这样加入任务的黑按钮不会和任务卡片上的撞在一起。
  if (joining)
    return (
      <Screen
        header={
          <PageHeader title="加入临时任务" onBack={() => showJoin(false)} />
        }
      >
        <Sheet gap>
          <FormInput
            label="邀请码"
            required
            value={code}
            type="number"
            maxLength={6}
            placeholder="六位数字"
            disabled={busy}
            error={failure?.at === JOIN}
            onInput={setCode}
          />
        </Sheet>
        <Notice>邀请码是班组长发给你本人的，只能自己用。</Notice>
        {failure?.at === JOIN ? (
          <Notice tone="error">{failure.text}</Notice>
        ) : null}
        <BottomBar
          primary={busy ? "加入中…" : "加入任务"}
          busy={busy}
          onPrimary={() => {
            void perform(JOIN, async () => {
              if (!/^\d{6}$/.test(code))
                throw new Error("请输入六位数字邀请码。");
              await joinTemporaryTask(code);
              await refreshMe();
              setCode("");
              setJoining(false);
              refresh();
              await Taro.showToast({
                icon: "success",
                title: "已加入任务",
              });
            });
          }}
        />
      </Screen>
    );

  const primaryId = tasks === null ? null : primaryTaskId(tasks, isToday);
  return (
    <Screen header={<PageHeader title="我的任务" />}>
      <WorkDate value={date} onChange={setDate} />
      {tasks === null ? (
        error ? (
          <StateView
            kind="error"
            title="任务没读到"
            sub={error}
            onRetry={refresh}
          />
        ) : (
          <StateView title="正在读取任务…" />
        )
      ) : (
        <>
          {tasks.length === 0 ? (
            <StateView
              kind="empty"
              title="这一天没有任务"
              sub="按排班打卡的项目在“我的项目”里。"
              retryLabel="去我的项目"
              onRetry={() => go("/pages/my-projects/index")}
            />
          ) : null}
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              date={date}
              isToday={isToday}
              primary={task.id === primaryId}
              busy={busy}
            />
          ))}
          {briefings.length > 0 ? <SectionTitle>安全交底</SectionTitle> : null}
          {briefings.map((briefing, index) => (
            <View key={briefing.id}>
              <Card gap={index > 0}>
                <View className="my-tasks__briefing-title">
                  {briefing.title}
                </View>
                <View className="my-tasks__briefing-text">
                  {briefing.content}
                </View>
                <CardMeta>
                  {briefing.projectName}，{briefing.teamName}
                </CardMeta>
                <CardActions>
                  {briefing.acknowledged ? (
                    <Status kind="ok">已确认</Status>
                  ) : (
                    <Button
                      variant="outline"
                      loading={busyAt === briefing.id}
                      disabled={busy}
                      onClick={() => {
                        void perform(briefing.id, async () => {
                          await acknowledgeBriefing(briefing.id);
                          refresh();
                        });
                      }}
                    >
                      {busyAt === briefing.id ? "确认中…" : "已阅读并理解"}
                    </Button>
                  )}
                </CardActions>
              </Card>
              {failure?.at === briefing.id ? (
                <Notice tone="error">{failure.text}</Notice>
              ) : null}
            </View>
          ))}
        </>
      )}
      <Links>
        <Button variant="text" onClick={() => showJoin(true)}>
          输入邀请码，加入临时任务
        </Button>
      </Links>
    </Screen>
  );
}
