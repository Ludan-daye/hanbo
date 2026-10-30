import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";

import { useMyProjectAttendance } from "../../hooks/use-my-project-attendance";
import {
  hasAttendanceToday,
  projectAttendanceProgress,
} from "../../services/project-attendance";
import {
  fetchMyAttendanceDays,
  fetchMyAttendanceRecords,
  fetchMyMakeups,
} from "../../services/me";
import { fetchMyFace, type MyFace } from "../../services/face";
import type { AccountProfile } from "../../services/account";
import { chinaToday } from "../../services/time";
import {
  summarizeWorkerMonth,
  type WorkerMonthSummary,
} from "../../services/worker-home";
import { ListItem, Notice, StateView, Subtitle } from "../ui/index";
import { ProjectAttendanceCard } from "../project-attendance-card";

type Reminder = {
  readonly title: string;
  readonly description: string;
  readonly url: string;
};

export const WorkerProjectOverview = ({
  revision,
  onRefresh,
  account,
}: {
  readonly revision: number;
  readonly onRefresh: () => void;
  readonly account: AccountProfile | null;
}): JSX.Element => {
  const { entries, loading, error, refresh } = useMyProjectAttendance(
    revision,
    onRefresh,
  );
  const [month, setMonth] = useState<WorkerMonthSummary | null>(null);
  const [monthError, setMonthError] = useState<string | null>(null);
  const [face, setFace] = useState<MyFace | null>(null);
  const [faceError, setFaceError] = useState<string | null>(null);
  const to = chinaToday();
  const from = `${to.slice(0, 7)}-01`;
  useEffect(() => {
    let cancelled = false;
    setMonth(null);
    setMonthError(null);
    setFace(null);
    setFaceError(null);
    void Promise.all([
      fetchMyAttendanceDays(from, to),
      fetchMyAttendanceRecords(from, to),
      fetchMyMakeups(),
    ])
      .then(([days, records, makeups]) => {
        if (!cancelled)
          setMonth(summarizeWorkerMonth(days, records, makeups, from, to));
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setMonthError(
            reason instanceof Error ? reason.message : "本月考勤读取失败",
          );
      });
    void fetchMyFace()
      .then((result) => {
        if (!cancelled) setFace(result);
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setFaceError(
            reason instanceof Error ? reason.message : "人脸档案读取失败",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [revision, from, to]);

  const todays = entries.filter(hasAttendanceToday);
  const remaining = todays.filter((entry) => {
    const progress = projectAttendanceProgress(entry);
    return progress.completed < progress.total || progress.abnormal > 0;
  });
  const finished = todays.filter((entry) => !remaining.includes(entry));
  const failed = entries.filter((entry) => entry.status === "error");
  const reminders: readonly Reminder[] = [
    ...(account !== null &&
    (!account.realName ||
      !account.phone ||
      !account.nickname ||
      !account.avatarDataUrl)
      ? [
          {
            title: "完善本人资料",
            description: "补齐姓名、手机号和微信头像昵称",
            url: "/pages/profile/index",
          },
        ]
      : []),
    ...(face !== null && face.profile?.status !== "APPROVED"
      ? [
          {
            title:
              face.profile?.status === "PENDING"
                ? "底照正在审核"
                : face.profile?.status === "REJECTED"
                  ? "底照需要重新提交"
                  : "先准备本人底照",
            description:
              face.profile?.status === "PENDING"
                ? "审核通过后可刷脸打卡，请联系项目管理员"
                : (face.profile?.reviewReason ??
                  "录入本人正脸，审核通过后才能刷脸打卡"),
            url: "/pages/face-profile/index",
          },
        ]
      : []),
    ...(face?.mode === "UNCONFIGURED"
      ? [
          {
            title: "刷脸核验暂不可用",
            description: "请联系项目管理员确认核验服务",
            url: "/pages/face-profile/index",
          },
        ]
      : []),
    ...(month !== null && month.missingDays > 0
      ? [
          {
            title: `本月有 ${month.missingDays} 项缺卡待核对`,
            description: "查看缺卡明细，按实际工作情况申请补卡",
            url: "/pages/my-records/index?range=MONTH",
          },
        ]
      : []),
    ...(month !== null && month.pendingMakeups > 0
      ? [
          {
            title: `${month.pendingMakeups} 条补卡申请处理中`,
            description: "查看审批进度，不必重复申请",
            url: "/pages/my-makeups/index",
          },
        ]
      : []),
    ...(month !== null && month.rejectedMakeups > 0
      ? [
          {
            title: `本月 ${month.rejectedMakeups} 条补卡申请被驳回`,
            description: "查看审批意见，核对后再处理",
            url: "/pages/my-makeups/index",
          },
        ]
      : []),
  ];
  return (
    <View className="worker-project-overview">
      <View className="worker-section-heading">
        <View>今日项目</View>
        <View
          className="worker-text-link"
          onClick={() => {
            void Taro.navigateTo({ url: "/pages/my-projects/index" });
          }}
        >
          全部项目 ›
        </View>
      </View>
      {!loading && error === null && todays.length > 0 ? (
        <Subtitle>
          今日 {todays.length} 个项目 · 待处理 {remaining.length} 个
        </Subtitle>
      ) : null}
      {loading ? (
        <StateView title="正在读取今日项目…" />
      ) : error !== null ? (
        <StateView title="项目读取失败" sub={error} onRetry={refresh} />
      ) : (
        <>
          {[...remaining, ...finished].map((entry) => (
            <ProjectAttendanceCard
              key={entry.project.projectId}
              entry={entry}
              onRetry={refresh}
            />
          ))}
          {failed.length > 0 ? (
            <Notice>
              {failed.length} 个项目未读到安排，请重试后确认今日任务。
            </Notice>
          ) : null}
          {failed.map((entry) => (
            <ProjectAttendanceCard
              key={entry.project.projectId}
              entry={entry}
              onRetry={refresh}
            />
          ))}
          {entries.length === 0 ? (
            <StateView
              title="还没有加入项目"
              sub="请联系管理员将你加入工地和班组。"
            />
          ) : todays.length === 0 && failed.length === 0 ? (
            <StateView
              title="今天没有打卡任务"
              sub="已加入的项目可在“全部项目”查看。"
            />
          ) : null}
        </>
      )}
      <View className="worker-section-heading">
        <View>
          本月用工{" "}
          <View className="worker-month-label">{Number(to.slice(5, 7))}月</View>
        </View>
        <View
          className="worker-text-link"
          onClick={() => {
            void Taro.navigateTo({
              url: "/pages/my-records/index?range=MONTH",
            });
          }}
        >
          考勤明细 ›
        </View>
      </View>
      {monthError !== null ? (
        <StateView
          title="本月考勤读取失败"
          sub={monthError}
          onRetry={refresh}
        />
      ) : month === null ? (
        <StateView title="正在汇总本月考勤…" />
      ) : (
        <View className="worker-month-card">
          <View className="worker-month-stats">
            <View>
              <View className="worker-month-value">
                {month.attendedDays}
                <View>天</View>
              </View>
              <View>实际出勤</View>
            </View>
            <View>
              <View className="worker-month-value">
                {(month.workedMinutes / 60).toFixed(1)}
                <View>小时</View>
              </View>
              <View>已记录工时</View>
            </View>
          </View>
          <View className="worker-month-note">
            出勤天数按日期去重，工时按已完成的工作时段累计。
          </View>
          <View className="worker-month-note worker-month-note--divider">
            暂未分开统计正常工日、零星工时和加班工时。
          </View>
        </View>
      )}
      <View className="worker-section-heading">
        <View>待办提醒</View>
      </View>
      {reminders.map((reminder) => (
        <ListItem
          key={reminder.title}
          primary={reminder.title}
          secondary={reminder.description}
          onClick={() => {
            void Taro.navigateTo({ url: reminder.url });
          }}
        />
      ))}
      {faceError ? (
        <StateView title="人脸状态读取失败" sub={faceError} onRetry={refresh} />
      ) : null}
      {month === null ? (
        <Subtitle>
          {monthError ? "考勤待办暂未读取，请重试。" : "正在读取考勤待办…"}
        </Subtitle>
      ) : null}
      {face === null && faceError === null ? (
        <Subtitle>正在读取人脸档案…</Subtitle>
      ) : null}
      {reminders.length === 0 &&
      month !== null &&
      face !== null &&
      account !== null ? (
        <View className="worker-empty-reminders">暂无需要处理的事项</View>
      ) : null}
    </View>
  );
};
