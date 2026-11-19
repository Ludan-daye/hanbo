import { View } from "@tarojs/components";
import Taro, { usePullDownRefresh } from "@tarojs/taro";
import { useEffect, useState } from "react";

import {
  AppHeader,
  BottomNav,
  Button,
  Notice,
  PageHeader,
  Screen,
  Segmented,
  StateView,
} from "../../components/ui/index";
import { useMyProjectAttendance } from "../../hooks/use-my-project-attendance";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { hasAttendanceToday } from "../../services/project-attendance";
import { useSession } from "../../store/session";
import { WorkerProjectCard } from "./worker-card";
import { primaryProjectId, projectCardView } from "./worker-card-state";

type Filter = "ALL" | "TODAY";

export default function MyProjects(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  // 工人的“项目”是底部导航里的根页面；其他职级是从“我的”或首页点进来的，带返回。
  const rootTab = state.me?.roles.highestRoleCode === "WORKER";
  const { revision, refresh } = usePageRefresh();
  usePullDownRefresh(refresh);
  const { entries, loading, refreshing, error } = useMyProjectAttendance(
    revision,
    refresh,
  );
  useEffect(() => {
    if (!loading && !refreshing) Taro.stopPullDownRefresh();
  }, [loading, refreshing]);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [now, setNow] = useState(() => new Date().toISOString());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date().toISOString()), 60_000);
    return () => clearInterval(timer);
  }, []);
  // “今日”里也留着安排没读到的项目：不知道今天有没有卡，不能当成没有。
  const today = entries.filter(
    (entry) => hasAttendanceToday(entry) || entry.status === "error",
  );
  const visible = filter === "ALL" ? entries : today;
  // 这次没读到但手里有上次的数据时，照常显示，另外说明一声。
  const usable = !loading && (error === null || entries.length > 0);
  const unknown = entries.filter((entry) => entry.status === "error").length;
  const primaryId = primaryProjectId(visible, now);
  return (
    <Screen
      header={
        rootTab ? (
          <AppHeader title="我的项目" />
        ) : (
          <PageHeader title="我的项目" />
        )
      }
    >
      <Segmented<Filter>
        options={[
          { value: "ALL", label: usable ? `全部 ${entries.length}` : "全部" },
          { value: "TODAY", label: usable ? `今日 ${today.length}` : "今日" },
        ]}
        value={filter}
        onChange={setFilter}
      />
      {loading ? (
        <StateView title="正在加载我的项目…" />
      ) : !usable ? (
        <StateView
          kind="error"
          title="项目没读到"
          sub={error ?? undefined}
          onRetry={refresh}
        />
      ) : (
        <>
          {unknown > 0 ? (
            <Notice>
              {unknown} 个项目今天的安排没读到，点卡片上的“重新读取安排”。
            </Notice>
          ) : null}
          {visible.map((entry) => (
            <WorkerProjectCard
              key={entry.project.projectId}
              entry={entry}
              view={projectCardView(entry, now)}
              primary={entry.project.projectId === primaryId}
              onRetry={refresh}
            />
          ))}
          {entries.length === 0 ? (
            <StateView
              kind="empty"
              title="还没有加入项目"
              sub="请联系管理员分配项目和班组。"
              onRetry={refresh}
            />
          ) : visible.length === 0 ? (
            <StateView
              kind="empty"
              title="今天没有要打的卡"
              sub="切到“全部”看参加的项目。"
              retryLabel="看全部项目"
              onRetry={() => setFilter("ALL")}
            />
          ) : null}
          {error !== null ? (
            <>
              <Notice tone="error">
                这次没读到，显示的是上次的安排
                <View className="ui-notice__sub">{error}</View>
              </Notice>
              <Button variant="outline" onClick={refresh}>
                重新读取
              </Button>
            </>
          ) : null}
        </>
      )}
      {rootTab ? <BottomNav active="projects" /> : null}
    </Screen>
  );
}
