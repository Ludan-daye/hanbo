import { Button as NativeButton, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";

import { API_BASE_URL, FRONTEND_DEMO } from "../../config/env";
import { useAccountProfile } from "../../hooks/use-account-profile";
import { useMyProjectAttendance } from "../../hooks/use-my-project-attendance";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { fetchMyFace, type MyFace } from "../../services/face";
import {
  fetchMyAttendanceDays,
  fetchMyAttendanceRecords,
  fetchMyMakeups,
} from "../../services/me";
import { chinaDateLabel, chinaToday } from "../../services/time";
import { fetchAppSettings } from "../../services/workflows";
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
  hasAttendanceToday,
  myProjectDetailUrl,
  projectAttendanceProgress,
  projectPunchUrl,
  type ProjectAttendance,
} from "../../services/project-attendance";
import { AppHeader, AppIcon, BottomNav, Button, Screen } from "../ui";
import "./index.scss";

const go = (url: string): void => {
  void Taro.navigateTo({ url });
};
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
const problem = (reason: unknown, fallback: string): string =>
  reason instanceof Error ? reason.message : fallback;
const projectRecordUrl = (id: string): string =>
  `/pages/my-records/index?projectId=${encodeURIComponent(id)}&range=TODAY`;

const ProjectChoice = ({
  entry,
  now,
  onSelect,
  selected,
}: {
  readonly entry: ProjectAttendance;
  readonly now: string;
  readonly onSelect: () => void;
  readonly selected: boolean;
}): JSX.Element => {
  const point = workerHomeNextPoint(entry, now);
  const issues = summarizeOtherWorkerProjects([entry], null);
  const status =
    entry.status === "error"
      ? "安排待确认"
      : issues.abnormalProjects
        ? "有异常待核对"
        : (point?.label ??
          (hasAttendanceToday(entry) ? "今日已完成" : "今日无需打卡"));
  return (
    <NativeButton
      className={`worker-choice${selected ? " worker-choice--selected" : ""}`}
      onClick={onSelect}
    >
      <View className="worker-choice__main">
        <View className="worker-choice__name">{entry.project.projectName}</View>
        <View className="worker-muted">
          {entry.project.teamName ?? "未分配班组"}
        </View>
      </View>
      <View className="worker-choice__task">
        {point ? (
          <View className="worker-choice__time">{point.scheduledTime}</View>
        ) : null}
        <View>{status}</View>
      </View>
    </NativeButton>
  );
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
  const { entries, loading, error } = useMyProjectAttendance(revision, refresh);
  const storageKey = workerHomeStorageKey({
    userId,
    dataMode: FRONTEND_DEMO ? "demo" : "http",
    apiBaseUrl: API_BASE_URL,
  });
  const [preference, setPreference] = useState<WorkerHomePreference>(() =>
    readPreference(storageKey),
  );
  const [choosing, setChoosing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [face, setFace] = useState<MyFace | null>(null);
  const [faceError, setFaceError] = useState<string | null>(null);
  const [month, setMonth] = useState<WorkerMonthSummary | null>(null);
  const [monthError, setMonthError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [announcementError, setAnnouncementError] = useState(false);
  const [now, setNow] = useState(() => new Date().toISOString());
  const to = chinaToday();
  const from = `${to.slice(0, 7)}-01`;
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date().toISOString()), 30_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    let cancelled = false;
    setFace(null);
    setFaceError(null);
    setMonth(null);
    setMonthError(null);
    void fetchMyFace().then(
      (result) => {
        if (!cancelled) setFace(result);
      },
      (cause) => {
        if (!cancelled) setFaceError(problem(cause, "人脸档案读取失败"));
      },
    );
    void Promise.all([
      fetchMyAttendanceDays(from, to),
      fetchMyAttendanceRecords(from, to),
      fetchMyMakeups(),
    ]).then(
      ([days, records, makeups]) => {
        if (!cancelled)
          setMonth(summarizeWorkerMonth(days, records, makeups, from, to));
      },
      (cause) => {
        if (!cancelled) setMonthError(problem(cause, "考勤提醒读取失败"));
      },
    );
    if (FRONTEND_DEMO) {
      setAnnouncementError(false);
      void fetchAppSettings().then(
        (settings) => {
          if (!cancelled) setAnnouncement(settings.announcement ?? "");
        },
        () => {
          if (!cancelled) setAnnouncementError(true);
        },
      );
    }
    return () => {
      cancelled = true;
    };
  }, [revision, from, to, userId]);

  const selection =
    !loading && error === null
      ? resolveWorkerHomeSelection(entries, preference)
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
  const blocker = workerFaceBlocker(face, FRONTEND_DEMO);
  const demoFace = workerCanUseDemoFace(face, FRONTEND_DEMO);
  const reminders = workerHomeReminders(account, face, month, FRONTEND_DEMO);
  const readingReminders =
    (!month && !monthError) ||
    (!face && !faceError) ||
    (!account && !accountError);
  const remindersUnavailable = Boolean(
    monthError || faceError || accountError || announcementError,
  );
  const choose = (id: string): void => {
    savePreference({ projectId: id });
    setChoosing(false);
  };
  const retry = (): void => {
    refresh();
    refreshAccount();
  };
  const staleDate =
    current?.status === "ready" && current.today.attendanceDate !== to;
  const currentAbnormal = current
    ? summarizeOtherWorkerProjects([current], null).abnormalProjects > 0
    : false;
  const progress =
    current?.status === "ready" ? projectAttendanceProgress(current) : null;

  const renderTask = (): JSX.Element => {
    if (loading)
      return (
        <View className="worker-task__state">
          <View className="worker-task__title">正在读取今日项目…</View>
          <View className="worker-muted">请稍候</View>
        </View>
      );
    if (error)
      return (
        <View className="worker-task__state">
          <View className="worker-task__title">项目读取失败</View>
          <View className="worker-muted">{error}</View>
          <Button appearance="worker" onClick={retry}>
            重新加载
          </Button>
        </View>
      );
    if (entries.length === 0)
      return (
        <View className="worker-task__state">
          <View className="worker-task__title">还没有加入项目</View>
          <View className="worker-muted">请联系管理员分配项目、班组。</View>
          <Button appearance="worker" onClick={retry}>
            刷新项目
          </Button>
        </View>
      );
    if (!current || choosing)
      return (
        <>
          <View className="worker-task__selection-head">
            <View className="worker-task__label">
              {invalid ? "请重新选择项目" : "选择打卡项目"}
            </View>
            {current ? (
              <NativeButton
                className="worker-text-button"
                onClick={() => setChoosing(false)}
              >
                取消
              </NativeButton>
            ) : null}
          </View>
          {invalid ? (
            <View className="worker-muted">
              原项目已失效，请重新选择。
            </View>
          ) : null}
          <View className="worker-project-choices">
            {entries.map((entry) => (
              <ProjectChoice
                key={entry.project.projectId}
                entry={entry}
                now={now}
                selected={entry.project.projectId === projectId}
                onSelect={() => choose(entry.project.projectId)}
              />
            ))}
          </View>
        </>
      );
    return (
      <>
        <View className="worker-task__label">今日打卡</View>
        <View className="worker-task__project-row">
          <NativeButton
            className="worker-project-name"
            onClick={() => go(myProjectDetailUrl(current.project.projectId))}
          >
            {current.project.projectName}
          </NativeButton>
          {entries.length > 1 ? (
            <NativeButton
              className="worker-text-button"
              onClick={() => setChoosing(true)}
            >
              切换项目
            </NativeButton>
          ) : null}
        </View>
        <View className="worker-muted">
          {current.project.teamName ?? "未分配班组"}
        </View>
        {current.status === "error" || staleDate ? (
          <View className="worker-task__state">
            <View className="worker-task__title">今日安排待确认</View>
            <View className="worker-muted">
              {staleDate
                ? "日期已更新，请重新读取今日安排。"
                : current.status === "error"
                  ? current.error
                  : ""}
            </View>
            <Button appearance="worker" onClick={retry}>
              重新加载
            </Button>
          </View>
        ) : current.project.taskAttendanceOnly ? (
          <View className="worker-task__state">
            <View className="worker-task__title">按任务开工、完工</View>
            <View className="worker-muted">
              任务工时按实际开工、完工记录统计。
            </View>
            <Button
              appearance="worker"
              onClick={() => go("/pages/my-tasks/index")}
            >
              查看我的任务
            </Button>
          </View>
        ) : !current.today.configured ||
          !current.today.isWorkday ||
          current.today.points.length === 0 ? (
          <View className="worker-task__state">
            <View className="worker-task__title">
              {current.today.configured ? "今日无需打卡" : "今日暂未安排"}
            </View>
            <View className="worker-muted">
              {current.today.configured
                ? "可查看项目安排和工地信息。"
                : "请联系管理员设置打卡安排。"}
            </View>
            <Button
              appearance="worker"
              onClick={() => go(myProjectDetailUrl(projectId!))}
            >
              查看项目安排
            </Button>
          </View>
        ) : next === null ? (
          <View className="worker-task__state worker-task__result">
            {!currentAbnormal ? (
              <View className="worker-task__success">
                <AppIcon name="check" />
              </View>
            ) : null}
            <View className="worker-task__title">
              {currentAbnormal
                ? "打卡已记录，有异常待核对"
                : "本项目今日已完成"}
            </View>
            <Button
              appearance="worker"
              onClick={() => go(projectRecordUrl(projectId!))}
            >
              查看今日记录
            </Button>
          </View>
        ) : blocker && !demoFace ? (
          <View className="worker-task__state">
            <View className="worker-task__title">{blocker.title}</View>
            <View className="worker-muted">{blocker.description}</View>
            <Button appearance="worker" onClick={() => go(blocker.url)}>
              {face?.profile?.status === "PENDING"
                ? "查看审核状态"
                : "查看人脸档案"}
            </Button>
          </View>
        ) : (
          <View className="worker-task__next">
            <View className="worker-task__point">{next.label} · 待打卡</View>
            {progress && progress.completed > 0 ? (
              <View className="worker-muted worker-task__progress">
                今日已记录 {progress.completed} / {progress.total} 次
                {currentAbnormal ? " · 有异常待核对" : ""}
              </View>
            ) : null}
            <View className="worker-muted worker-task__time-label">
              应打卡时间
            </View>
            <View className="worker-task__time">{next.scheduledTime}</View>
            {faceError ? (
              <>
                <View className="worker-muted">人脸状态待确认</View>
                <Button appearance="worker" onClick={retry}>
                  重新读取状态
                </Button>
              </>
            ) : (
              <Button
                appearance="worker"
                disabled={!face}
                onClick={() => go(projectPunchUrl(projectId!))}
              >
                {!face
                  ? "正在确认打卡资格…"
                  : blocker && demoFace
                    ? "模拟打卡"
                    : "去打卡"}
              </Button>
            )}
          </View>
        )}
      </>
    );
  };

  const summary =
    reminders[0]?.title ??
    (remindersUnavailable
      ? "部分提醒未读取，待确认"
      : readingReminders
        ? "正在读取提醒…"
        : announcement
          ? "项目公告"
          : "暂无需要处理的事项");
  const canExpand =
    reminders.length > 0 || remindersUnavailable || Boolean(announcement);
  return (
    <Screen
      appearance="worker"
      header={<AppHeader title="瀚渤 · 智慧工地" appearance="worker" />}
    >
      <View className="worker-greeting">
        <View className="worker-greeting__title">
          {account?.nickname ? `你好，${account.nickname}` : "你好，欢迎回来"}
        </View>
        <View className="worker-muted">{chinaDateLabel()}</View>
      </View>
      <View className="worker-task" data-project-id={projectId ?? ""}>
        {renderTask()}
      </View>
      {storageError ? (
        <View className="worker-inline-note">
          项目选择已生效，暂未保存为默认。
        </View>
      ) : null}
      {!loading &&
      !error &&
      current &&
      !choosing &&
      (other.pendingProjects > 0 || other.unknownProjects > 0) ? (
        <NativeButton
          className="worker-other-projects"
          onClick={() => setChoosing(true)}
        >
          <View>
            {other.pendingProjects > 0
              ? `其他 ${other.pendingProjects} 个项目仍有任务`
              : "其他项目安排待确认"}
            {other.unknownProjects > 0 ? (
              <View className="worker-muted">
                {other.unknownProjects} 个项目未读取，请确认
              </View>
            ) : null}
          </View>
          <AppIcon name="building" />
        </NativeButton>
      ) : null}
      <View className="worker-reminders">
        {canExpand ? (
          <NativeButton
            className="worker-reminders__toggle"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
          >
            <View>
              {summary}
              {reminders.length > 1 ? (
                <View className="worker-muted">
                  共 {reminders.length} 项提醒
                </View>
              ) : null}
              {remindersUnavailable && reminders.length > 0 ? (
                <View className="worker-muted">另有提醒未读取</View>
              ) : null}
            </View>
            <View className="worker-reminders__label">
              {expanded ? "收起提醒" : "展开提醒"}
            </View>
          </NativeButton>
        ) : (
          <View className="worker-reminders__empty">{summary}</View>
        )}
        {expanded && canExpand ? (
          <View className="worker-reminders__items">
            {reminders.map((item) => (
              <NativeButton
                className="worker-reminder"
                key={item.id}
                onClick={() => go(item.url)}
              >
                <View>{item.title}</View>
                <View className="worker-muted">{item.description}</View>
              </NativeButton>
            ))}
            {announcement ? (
              <View className="worker-reminder">
                <View>项目公告</View>
                <View className="worker-muted">{announcement}</View>
              </View>
            ) : null}
            {remindersUnavailable ? (
              <View className="worker-reminder">
                <View>部分信息读取失败</View>
                <View className="worker-muted">
                  {accountError ?? faceError ?? monthError ?? "公告暂未读取"}
                </View>
                <NativeButton className="worker-text-button" onClick={retry}>
                  重新加载
                </NativeButton>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
      <View className="worker-quick-links">
        <NativeButton onClick={() => go("/pages/my-tasks/index")}>
          我的任务
        </NativeButton>
        <NativeButton onClick={() => go("/pages/my-records/index?range=MONTH")}>
          考勤记录
        </NativeButton>
        <NativeButton onClick={() => go("/pages/my-makeups/index")}>
          补卡申请
        </NativeButton>
        <NativeButton onClick={() => go("/pages/my-projects/index")}>
          全部项目
        </NativeButton>
      </View>
      <BottomNav active="home" appearance="worker" />
    </Screen>
  );
};
