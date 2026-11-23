import { View } from "@tarojs/components";
import Taro, { usePullDownRefresh } from "@tarojs/taro";
import { useEffect, useState } from "react";

import { API_BASE_URL, FRONTEND_DEMO } from "../../config/env";
import { CompanySuspendedNotice } from "../company-suspended-notice";
import { useAccountProfile } from "../../hooks/use-account-profile";
import { useCachedRead } from "../../hooks/use-cached-read";
import { useMyProjectAttendance } from "../../hooks/use-my-project-attendance";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { displayProjectRole } from "../../routing/features";
import { fetchMyFace, type MyFace } from "../../services/face";
import {
  fetchMyAttendanceDays,
  fetchMyAttendanceRecords,
  fetchMyMakeups,
} from "../../services/me";
import {
  chinaToday,
  formatChinaDate,
  formatChinaHm,
} from "../../services/time";
import { fetchAppSettings, type SystemSettings } from "../../services/workflows";
import {
  summarizeWorkerMonth,
  type WorkerMonthSummary,
} from "../../services/worker-home";
import {
  workerFaceBlocker,
  workerHomeReminders,
  workerCanUseDemoFace,
} from "../../services/worker-home-reminders";
import {
  resolveWorkerHomeSelection,
  summarizeOtherWorkerProjects,
  workerHomeNextPoint,
  workerHomeStorageKey,
  type WorkerHomePreference,
} from "../../services/worker-home-selection";
import {
  pointStatus,
  workerHomeSign,
  type WorkerHomeSignAction,
} from "../../services/worker-home-sign";
import {
  hasAttendanceToday,
  projectAttendanceProgress,
  projectPunchUrl,
  type ProjectAttendance,
} from "../../services/project-attendance";
import {
  AppHeader,
  BottomNav,
  Button,
  Notice,
  Numbers,
  Row,
  Screen,
  SectionTitle,
  Sheet,
  Sign,
  SignButton,
  SignClock,
  SignNote,
  SignText,
  SkeletonRows,
  SkeletonSign,
} from "../ui";

const go = (url: string): void => {
  void Taro.navigateTo({ url });
};
const MONTH_RECORDS = "/pages/my-records/index?range=MONTH";
const readPreference = (key: string): WorkerHomePreference => {
  try {
    const stored: unknown = Taro.getStorageSync(key);
    if (stored && typeof stored === "object") {
      if (
        "projectId" in stored &&
        typeof stored.projectId === "string" &&
        stored.projectId
      )
        return { projectId: stored.projectId };
      if ("requireSelection" in stored && stored.requireSelection === true)
        return { requireSelection: true };
    }
  } catch {
    /* An unavailable local store must not prevent selecting a project. */
  }
  return null;
};

/** 选项目时每个项目后面的一句话：最该知道的是今天还有没有卡要打。 */
const choiceStatus = (entry: ProjectAttendance, now: string): string => {
  if (entry.status === "error") return "安排没读到";
  if (summarizeOtherWorkerProjects([entry], null).abnormalProjects > 0)
    return "有异常要核对";
  const point = workerHomeNextPoint(entry, now);
  if (point) return `${point.label} ${point.scheduledTime}`;
  return hasAttendanceToday(entry) ? "今天打完了" : "今天不用打卡";
};

export const WorkerHome = ({
  userId,
}: {
  readonly userId: string;
}): JSX.Element => {
  const { revision, refresh } = usePageRefresh();
  const {
    profile: account,
    error: accountError,
    refresh: refreshAccount,
  } = useAccountProfile();
  usePullDownRefresh(() => {
    refresh();
    refreshAccount();
  });
  const { entries, loading, refreshing, error } = useMyProjectAttendance(
    revision,
    refresh,
  );
  const storageKey = workerHomeStorageKey({
    userId,
    dataMode: FRONTEND_DEMO ? "demo" : "http",
    apiBaseUrl: API_BASE_URL,
  });
  const [preference, setPreference] = useState<WorkerHomePreference>(() =>
    readPreference(storageKey),
  );
  const [choosing, setChoosing] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [now, setNow] = useState(() => new Date().toISOString());
  const to = chinaToday();
  const from = `${to.slice(0, 7)}-01`;
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date().toISOString()), 30_000);
    return () => clearInterval(timer);
  }, []);
  // 这几样都先用上次的数据显示，再去核对；键里带用户编号。
  const face = useCachedRead<MyFace>(
    `${userId}:my-face`,
    fetchMyFace,
    revision,
    "人脸档案没读到，请重试。",
  );
  const month = useCachedRead<WorkerMonthSummary>(
    `${userId}:worker-month:${from}:${to}`,
    async () => {
      const [days, records, makeups] = await Promise.all([
        fetchMyAttendanceDays(from, to),
        fetchMyAttendanceRecords(from, to),
        fetchMyMakeups(),
      ]);
      return summarizeWorkerMonth(days, records, makeups, from, to);
    },
    revision,
    "本月考勤没读到，请重试。",
  );
  const settings = useCachedRead<SystemSettings>(
    FRONTEND_DEMO ? `${userId}:app-settings` : null,
    fetchAppSettings,
    revision,
    "公告没读到，请重试。",
  );

  useEffect(() => {
    if (!loading && !refreshing) Taro.stopPullDownRefresh();
  }, [loading, refreshing]);
  // 这次没读到但手里有上次的数据时，照常显示，另外说明一声。
  const usable = !loading && (error === null || entries.length > 0);
  const selection = usable
    ? resolveWorkerHomeSelection(entries, preference, now)
    : null;
  const projectId = selection?.projectId ?? null;
  const current =
    entries.find((entry) => entry.project.projectId === projectId) ?? null;
  const invalid =
    selection?.reason === "invalid" ||
    (preference !== null && "requireSelection" in preference);
  const savePreference = (value: WorkerHomePreference): void => {
    setPreference(value);
    try {
      Taro.setStorageSync(storageKey, value);
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  };
  useEffect(() => {
    if (selection?.reason === "invalid" || selection?.reason === "single")
      savePreference(selection.preference);
  }, [selection?.reason, projectId, storageKey]);
  const other = summarizeOtherWorkerProjects(entries, projectId, to);
  const next = current ? workerHomeNextPoint(current, now) : null;
  const faceBlocker = workerFaceBlocker(face.data, FRONTEND_DEMO);
  const demoFace = workerCanUseDemoFace(face.data, FRONTEND_DEMO);
  const blocker = demoFace ? null : faceBlocker;
  const choose = (id: string): void => {
    savePreference({ projectId: id });
    setChoosing(false);
  };
  const retry = (): void => {
    refresh();
    refreshAccount();
  };
  const act = (action: WorkerHomeSignAction): void => {
    if ("retry" in action) retry();
    else go(action.url);
  };
  const pickProject = usable && entries.length > 0 && (!current || choosing);
  const sign = usable ? workerHomeSign({ entry: current, blocker, now }) : null;
  const blockedBySign =
    sign?.kind === "text" && blocker !== null && sign.title === blocker.title;
  // 标牌已经在说底照的事，下面就不再重复；待审批是等别人，不算“等你处理”。
  const todos = workerHomeReminders(
    account,
    face.data,
    month.data,
    FRONTEND_DEMO,
  ).filter(
    (item) => item.id !== "pending" && !(item.id === "face" && blockedBySign),
  );
  const pendingMakeups = month.data?.pendingMakeups ?? 0;
  const showToday =
    current !== null &&
    !pickProject &&
    hasAttendanceToday(current) &&
    current.today.attendanceDate === to &&
    (sign?.kind === "text" ||
      projectAttendanceProgress(current).completed > 0);
  const problem =
    (error !== null && entries.length > 0 ? error : null) ??
    accountError ??
    face.error ??
    month.error ??
    settings.error;

  return (
    <Screen
      appearance="sign"
      header={
        <AppHeader
          appearance="sign"
          title={current?.project.projectName ?? "瀚渤智慧工地"}
          onSwitch={
            entries.length > 1 && !pickProject
              ? () => setChoosing(true)
              : undefined
          }
        />
      }
    >
      <View data-project-id={projectId ?? ""}>
        <CompanySuspendedNotice />
        {loading ? (
          <SkeletonSign tall />
        ) : !usable ? (
          <Sign>
            <SignText title="项目没读到" sub={error ?? "请重试。"} />
            <SignButton onClick={retry}>重新读取</SignButton>
          </Sign>
        ) : pickProject ? (
          <>
            <SectionTitle
              action={current ? "取消" : undefined}
              onAction={() => setChoosing(false)}
            >
              选择项目
            </SectionTitle>
            {invalid ? (
              <Notice>原来的项目已经不在了，重新选一个。</Notice>
            ) : null}
            <Sheet>
              {entries.map((entry) => (
                <Row
                  key={entry.project.projectId}
                  title={entry.project.projectName}
                  sub={entry.project.teamName ?? "未分配班组"}
                  value={choiceStatus(entry, now)}
                  mute={entry.project.projectId !== projectId}
                  chevron
                  onClick={() => choose(entry.project.projectId)}
                />
              ))}
            </Sheet>
          </>
        ) : sign?.kind === "punch" ? (
          <Sign>
            <SignClock
              title={sign.card}
              note={sign.before}
              time={formatChinaHm(now)}
            />
            <SignButton
              // 打卡资格还没确认时先置灰；确认失败不拦，打卡页会再核对一次。
              busy={face.loading}
              onClick={() => go(projectPunchUrl(sign.projectId))}
            >
              {demoFace && faceBlocker ? "模拟打卡" : "打卡"}
            </SignButton>
            {current ? (
              <SignNote>
                {`${current.project.teamName ?? "项目直属"}，${displayProjectRole(current.project.projectRoleLabel)}`}
              </SignNote>
            ) : null}
          </Sign>
        ) : sign ? (
          <Sign>
            <SignText title={sign.title} sub={sign.sub} />
            {sign.action ? (
              <SignButton onClick={() => act(sign.action!)}>
                {sign.action.label}
              </SignButton>
            ) : null}
          </Sign>
        ) : null}
      </View>

      {showToday && current?.status === "ready" ? (
        <>
          <SectionTitle>今天</SectionTitle>
          <Sheet>
            {current.today.points.map((point) => (
              <Row
                key={point.pointCode}
                title={point.label}
                titleNum={point.scheduledTime}
                status={pointStatus(
                  point,
                  next,
                  blocker !== null,
                  current.today.attendanceDate === formatChinaDate(now)
                    ? now
                    : undefined,
                )}
              />
            ))}
          </Sheet>
        </>
      ) : null}

      <SectionTitle action="考勤记录" onAction={() => go(MONTH_RECORDS)}>
        本月
      </SectionTitle>
      {month.data ? (
        <Numbers
          items={[
            {
              value: String(month.data.attendedDays),
              unit: "天",
              label: "出勤",
              onClick: () => go(MONTH_RECORDS),
            },
            {
              value: (month.data.workedMinutes / 60).toFixed(1),
              label: "工时",
              onClick: () => go(MONTH_RECORDS),
            },
            {
              value: String(month.data.missingDays),
              unit: "天",
              label: "缺卡",
              tone: month.data.missingDays > 0 ? "bad" : undefined,
              onClick: () => go(MONTH_RECORDS),
            },
          ]}
        />
      ) : month.loading ? (
        <SkeletonRows rows={1} />
      ) : null}

      <Sheet gap>
        {todos.map((item) => (
          <Row
            key={item.id}
            title={item.title}
            hazard
            chevron
            onClick={() => go(item.url)}
          />
        ))}
        {!pickProject &&
        current &&
        (other.pendingProjects > 0 || other.unknownProjects > 0) ? (
          <Row
            title={
              other.pendingProjects > 0
                ? `另外 ${other.pendingProjects} 个项目还有卡要打`
                : "其他项目的安排没读到"
            }
            hazard
            chevron
            onClick={() => setChoosing(true)}
          />
        ) : null}
        <Row
          title="我的任务"
          chevron
          onClick={() => go("/pages/my-tasks/index")}
        />
        {pendingMakeups > 0 ? (
          <Row
            title="补卡申请"
            status={{ kind: "warn", text: `${pendingMakeups} 条待审批` }}
            chevron
            onClick={() => go("/pages/my-makeups/index")}
          />
        ) : null}
      </Sheet>

      {settings.data?.announcement ? (
        <Notice>公告：{settings.data.announcement}</Notice>
      ) : null}
      {storageError ? (
        <Notice>项目换好了，但这次没能记住，下次打开可能要再选一次。</Notice>
      ) : null}
      {problem ? (
        <>
          <Notice tone="error">
            有些信息没读到
            <View className="ui-notice__sub">{problem}</View>
          </Notice>
          <Button variant="outline" onClick={retry}>
            重新读取
          </Button>
        </>
      ) : null}
      <BottomNav active="home" appearance="sign" />
    </Screen>
  );
};
