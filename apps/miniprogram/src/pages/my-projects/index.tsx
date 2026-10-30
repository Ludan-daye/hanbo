import { View } from "@tarojs/components";
import { useState } from "react";

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

import "./index.scss";

export default function MyProjects(): JSX.Element {
  useSessionGuard();
  const { revision, refresh } = usePageRefresh();
  const { entries, loading, error } = useMyProjectAttendance(revision, refresh);
  const [filter, setFilter] = useState<"ALL" | "TODAY">("ALL");
  const scheduled = entries.filter(hasAttendanceToday);
  const visible =
    filter === "ALL"
      ? entries
      : entries.filter(
          (entry) => hasAttendanceToday(entry) || entry.status === "error",
        );
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
