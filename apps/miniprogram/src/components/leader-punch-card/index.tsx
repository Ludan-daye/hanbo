import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";

import { useMyProjectAttendance } from "../../hooks/use-my-project-attendance";
import { projectPunchUrl } from "../../services/project-attendance";
import { leaderPunchSummary } from "../../services/worker-home-selection";
import { Button } from "../ui/index";

import "./index.scss";

const MY_PROJECTS_URL: string = "/pages/my-projects/index";
const TODAY_RECORDS_URL: string = "/pages/my-records/index?range=TODAY";

const go = (url: string): void => {
  void Taro.navigateTo({ url });
};

export const LeaderPunchCard = ({
  revision,
  onRefresh,
}: {
  readonly revision: number;
  readonly onRefresh: () => void;
}): JSX.Element | null => {
  const { entries, loading, error } = useMyProjectAttendance(
    revision,
    onRefresh,
  );
  if (loading)
    return (
      <View className="leader-punch">
        <View className="leader-punch__label">我的打卡</View>
        <View className="leader-punch__muted">正在读取今日安排…</View>
      </View>
    );
  if (error !== null)
    return (
      <View className="leader-punch">
        <View className="leader-punch__label">我的打卡</View>
        <View className="leader-punch__title">今日安排读取失败</View>
        <View className="leader-punch__muted">{error}</View>
        <Button variant="outline" onClick={onRefresh}>
          重新加载
        </Button>
      </View>
    );
  const summary = leaderPunchSummary(entries, new Date().toISOString());
  if (summary.kind === "none") return null;
  if (summary.kind === "unknown")
    return (
      <View className="leader-punch">
        <View className="leader-punch__label">我的打卡</View>
        <View className="leader-punch__title">今日安排待确认</View>
        <View className="leader-punch__muted">
          部分项目未读取成功，请到我的项目查看。
        </View>
        <Button variant="outline" onClick={() => go(MY_PROJECTS_URL)}>
          查看我的项目
        </Button>
      </View>
    );
  if (summary.kind === "done")
    return (
      <View className="leader-punch">
        <View className="leader-punch__label">我的打卡</View>
        <View className="leader-punch__title">
          {summary.abnormal ? "打卡已记录，有异常待核对" : "今日打卡已完成"}
        </View>
        <View className="leader-punch__muted">
          已记录 {summary.completed} / {summary.total} 次
        </View>
        <Button variant="outline" onClick={() => go(TODAY_RECORDS_URL)}>
          查看今日记录
        </Button>
      </View>
    );
  return (
    <View className="leader-punch leader-punch--pending">
      <View className="leader-punch__label">我的打卡</View>
      <View className="leader-punch__row">
        <View>
          <View className="leader-punch__title">
            {summary.pointLabel} · 待打卡
          </View>
          <View className="leader-punch__muted">{summary.projectName}</View>
        </View>
        <View className="leader-punch__time">{summary.scheduledTime}</View>
      </View>
      {summary.completed > 0 ? (
        <View className="leader-punch__muted">
          今日已记录 {summary.completed} / {summary.total} 次
        </View>
      ) : null}
      <Button onClick={() => go(projectPunchUrl(summary.projectId))}>
        去打卡
      </Button>
      {summary.otherProjects > 0 ? (
        <View className="leader-punch__link" onClick={() => go(MY_PROJECTS_URL)}>
          另有 {summary.otherProjects} 个项目待打卡 ›
        </View>
      ) : null}
    </View>
  );
};
