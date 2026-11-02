import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { Button } from "../../components/ui";
import { displayProjectRole } from "../../routing/features";
import {
  myProjectDetailUrl,
  type ProjectAttendance,
} from "../../services/project-attendance";
import { formatChinaDate } from "../../services/time";
import { workerProjectCardStatus } from "./worker-card-state";
import {
  summarizeOtherWorkerProjects,
  workerHomeNextPoint,
} from "../../services/worker-home-selection";

export const WorkerProjectCard = ({
  entry,
  now,
  primary,
  onRetry,
}: {
  readonly entry: ProjectAttendance;
  readonly now: string;
  readonly primary: boolean;
  readonly onRetry: () => void;
}): JSX.Element => {
  const next = workerHomeNextPoint(entry, now);
  const stale =
    entry.status === "ready" &&
    entry.today.attendanceDate !== formatChinaDate(now);
  const abnormal =
    summarizeOtherWorkerProjects([entry], null, formatChinaDate(now))
      .abnormalProjects > 0;
  const failed = entry.status === "error" || stale;
  const label = workerProjectCardStatus(entry, now);
  const detail = (): void => {
    void Taro.navigateTo({ url: myProjectDetailUrl(entry.project.projectId) });
  };
  return (
    <View
      className={`worker-projects__card${primary ? " worker-projects__card--primary" : ""}`}
      data-project-id={entry.project.projectId}
    >
      <View className="worker-projects__project" role="button" onClick={detail}>
        <View className="worker-projects__name">
          {entry.project.projectName}
        </View>
        <View className="worker-projects__detail-label">详情</View>
      </View>
      <View className="worker-projects__meta">
        {entry.project.teamName ?? "未分配班组"} ·{" "}
        {displayProjectRole(entry.project.projectRoleLabel)}
      </View>
      <View
        className={`worker-projects__status${failed || abnormal ? " worker-projects__status--attention" : ""}`}
      >
        {label}
      </View>
      {failed ? (
        <>
          <View className="worker-projects__meta">
            {entry.status === "error"
              ? entry.error
              : "日期已变化，请刷新今日安排。"}
          </View>
          <Button variant="outline" onClick={onRetry}>
            重新读取安排
          </Button>
        </>
      ) : next && entry.status === "ready" ? (
        <>
          <View className="worker-projects__meta">
            {next.label} · {entry.today.attendanceDate}
          </View>
          <View className="worker-projects__time">{next.scheduledTime}</View>
          <Button
            variant={primary ? "primary" : "outline"}
            onClick={() => {
              void Taro.navigateTo({
                url: `/pages/punch/index?projectId=${encodeURIComponent(entry.project.projectId)}`,
              });
            }}
          >
            去打卡
          </Button>
        </>
      ) : (
        <View className="worker-projects__meta">
          {entry.status === "ready" && !entry.today.configured
            ? "请联系管理员确认打卡安排。"
            : entry.status === "ready"
              ? entry.today.attendanceDate
              : ""}
        </View>
      )}
      <View className="worker-projects__links">
        <View role="button" onClick={detail}>
          查看项目
        </View>
        <View
          role="button"
          onClick={() => {
            void Taro.navigateTo({
              url: `/pages/my-records/index?projectId=${encodeURIComponent(entry.project.projectId)}`,
            });
          }}
        >
          本项目考勤
        </View>
      </View>
    </View>
  );
};
