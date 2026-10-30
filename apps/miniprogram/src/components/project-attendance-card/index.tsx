import { Button, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import { workerProjectStatus } from "../../services/worker-home";

import { displayProjectRole } from "../../routing/features";
import {
  hasAttendanceToday,
  projectAttendanceProgress,
  projectPunchUrl,
  myProjectDetailUrl,
  type ProjectAttendance,
} from "../../services/project-attendance";
import { formatChinaHm } from "../../services/time";

import "./index.scss";

export const ProjectAttendanceCard = ({
  entry,
  onRetry,
}: {
  readonly entry: ProjectAttendance;
  readonly onRetry: () => void;
}): JSX.Element => {
  const [now, setNow] = useState<string>(() => new Date().toISOString());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date().toISOString()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const progress =
    entry.status === "ready" ? projectAttendanceProgress(entry) : null;
  const todayRequired = hasAttendanceToday(entry);
  return (
    <View
      className="project-attendance-card"
      data-project-id={entry.project.projectId}
    >
      <View className="project-attendance-card__heading">
        <View
          className="project-attendance-card__name"
          onClick={() => {
            void Taro.navigateTo({
              url: myProjectDetailUrl(entry.project.projectId),
            });
          }}
        >
          {entry.project.projectName}
        </View>
        <View
          className={`project-attendance-card__status ${todayRequired && progress?.abnormal === 0 && progress?.completed === progress?.total ? "project-attendance-card__status--done" : ""}`}
        >
          {entry.status === "ready"
            ? workerProjectStatus(entry.today, now)
            : "读取失败"}
        </View>
      </View>
      <View
        className="project-attendance-card__detail"
        onClick={() => {
          void Taro.navigateTo({
            url: myProjectDetailUrl(entry.project.projectId),
          });
        }}
      >
        项目详情 · 地点与联系人 ›
      </View>
      <View className="project-attendance-card__meta">
        {entry.project.teamName ?? "未分配班组"} ·{" "}
        {displayProjectRole(entry.project.projectRoleLabel)}
      </View>
      {entry.status === "error" ? (
        <View className="project-attendance-card__error">{entry.error}</View>
      ) : todayRequired && progress !== null ? (
        <>
          <View className="project-attendance-card__progress">
            <View>
              已完成{" "}
              <View className="project-attendance-card__number">
                {progress.completed} / {progress.total}
              </View>{" "}
              次
            </View>
            <View>{entry.today.shiftName ?? "今日安排"}</View>
          </View>
          <View className="project-attendance-card__points">
            {entry.today.points.map((point) => (
              <View
                key={point.pointCode}
                className={`project-attendance-card__point ${point.record?.status === "VALID" ? "project-attendance-card__point--done" : point.record?.status === "INVALID" ? "project-attendance-card__point--invalid" : ""}`}
              >
                <View>
                  {point.label} · {point.scheduledTime}
                </View>
                <View>
                  {point.record !== null
                    ? `${point.record.status === "VALID" ? "已打" : "异常"} ${formatChinaHm(point.record.occurredAt)}`
                    : "待打卡"}
                </View>
              </View>
            ))}
          </View>
          {progress.abnormal > 0 ? (
            <View className="project-attendance-card__error">
              有 {progress.abnormal} 条异常记录，请查看该项目考勤。
            </View>
          ) : null}
        </>
      ) : (
        <View className="project-attendance-card__meta">
          {entry.today.configured
            ? "当前项目今天没有打卡任务"
            : "请联系管理员确认本项目的打卡安排"}
        </View>
      )}
      <Button
        className="project-attendance-card__action"
        onClick={() => {
          if (entry.status === "error") onRetry();
          else
            void Taro.navigateTo({
              url:
                todayRequired &&
                progress !== null &&
                progress.completed < progress.total
                  ? projectPunchUrl(entry.project.projectId)
                  : `/pages/my-records/index?projectId=${encodeURIComponent(entry.project.projectId)}`,
            });
        }}
      >
        <View>
          {entry.status === "error"
            ? "重新加载"
            : todayRequired &&
                progress !== null &&
                progress.completed < progress.total
              ? "进入项目打卡"
              : "查看项目考勤"}
        </View>
        <View>→</View>
      </Button>
    </View>
  );
};
