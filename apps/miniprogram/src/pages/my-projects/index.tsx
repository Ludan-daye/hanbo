import { View } from "@tarojs/components";
import { useEffect, useState } from "react";

import {
  AppHeader,
  BottomNav,
  Screen,
  Segmented,
  StateView,
  Subtitle,
} from "../../components/ui/index";
import { useMyProjectAttendance } from "../../hooks/use-my-project-attendance";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { hasAttendanceToday } from "../../services/project-attendance";

import { ProjectAttendanceCard } from "../../components/project-attendance-card";
import { FlowScreen } from "../../components/worker-flow";
import { useSession } from "../../store/session";
import { workerHomeNextPoint } from "../../services/worker-home-selection";
import { WorkerProjectCard } from "./worker-card";

import "./index.scss";

export default function MyProjects(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const workerAppearance = state.me?.roles.highestRoleCode === "WORKER";
  const { revision, refresh } = usePageRefresh();
  const { entries, loading, error } = useMyProjectAttendance(revision, refresh);
  const [filter, setFilter] = useState<"ALL" | "TODAY">("ALL");
  const [now, setNow] = useState(() => new Date().toISOString());
  useEffect(() => {
    if (!workerAppearance) return;
    const timer = setInterval(() => setNow(new Date().toISOString()), 60_000);
    return () => clearInterval(timer);
  }, [workerAppearance]);
  const scheduled = entries.filter(hasAttendanceToday);
  const visible =
    filter === "ALL"
      ? entries
      : entries.filter(
          (entry) => hasAttendanceToday(entry) || entry.status === "error",
        );
  if (workerAppearance) {
    const unknown = entries.filter((entry) => entry.status === "error").length;
    const primaryId = visible.find(
      (entry) => workerHomeNextPoint(entry, now) !== null,
    )?.project.projectId;
    return (
      <FlowScreen title="瀚渤 · 智慧工地" root>
        <View className="worker-projects">
          <View className="worker-projects__heading">我的项目</View>
          {!loading && !error ? (
            <Subtitle>{entries.length} 个项目</Subtitle>
          ) : null}
          <Segmented<"ALL" | "TODAY">
            options={[
              { value: "ALL", label: "全部" },
              { value: "TODAY", label: "今日" },
            ]}
            value={filter}
            onChange={setFilter}
          />
          {loading ? (
            <StateView title="正在加载我的项目…" />
          ) : error ? (
            <StateView title="项目加载失败" sub={error} onRetry={refresh} />
          ) : (
            <>
              {unknown > 0 ? (
                <View className="worker-projects__pending">
                  已读取 {entries.length - unknown} 个项目，{unknown}{" "}
                  个安排待确认
                </View>
              ) : null}
              {visible.map((entry) => (
                <WorkerProjectCard
                  key={entry.project.projectId}
                  entry={entry}
                  now={now}
                  primary={entry.project.projectId === primaryId}
                  onRetry={refresh}
                />
              ))}
              {visible.length === 0 ? (
                <StateView
                  title={
                    entries.length === 0 ? "还没有加入项目" : "今天没有打卡任务"
                  }
                  sub={
                    entries.length === 0
                      ? "请联系管理员将你加入工地和班组。"
                      : "可切换“全部”查看参与的项目。"
                  }
                  onRetry={refresh}
                />
              ) : null}
            </>
          )}
        </View>
        <BottomNav active="projects" appearance="worker" />
      </FlowScreen>
    );
  }
  return (
    <Screen>
      <AppHeader title="我的项目" />
      <View className="my-projects-intro">
        <View className="my-projects-intro__title">选择项目，开始打卡</View>
        <Subtitle>今日安排和考勤记录按项目分别保存。</Subtitle>
      </View>
      <Segmented<"ALL" | "TODAY">
        options={[
          {
            value: "ALL",
            label: loading ? "全部项目" : `全部项目 ${entries.length}`,
          },
          {
            value: "TODAY",
            label: loading ? "今日打卡" : `今日打卡 ${scheduled.length}`,
          },
        ]}
        value={filter}
        onChange={setFilter}
      />
      {loading ? (
        <StateView title="正在加载我的项目…" />
      ) : error !== null ? (
        <StateView title="项目加载失败" sub={error} onRetry={refresh} />
      ) : (
        <>
          {visible.map((entry) => (
            <ProjectAttendanceCard
              key={entry.project.projectId}
              entry={entry}
              onRetry={refresh}
            />
          ))}
          {visible.length === 0 ? (
            <StateView
              title={entries.length === 0 ? "尚未加入项目" : "今天没有打卡任务"}
              sub={
                entries.length === 0
                  ? "请联系管理员分配项目和班组。"
                  : "可切换“全部项目”查看参与的工地。"
              }
            />
          ) : null}
        </>
      )}
      <BottomNav active="projects" />
    </Screen>
  );
}
