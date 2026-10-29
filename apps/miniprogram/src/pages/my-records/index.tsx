import { Picker, View } from "@tarojs/components";
import { useEffect, useState } from "react";
import { useSessionGuard } from "../../hooks/use-session-guard";

import {
  ListItem,
  PageHeader,
  Screen,
  Segmented,
  StateView,
  StatCards,
} from "../../components/ui/index";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import {
  fetchMyAttendanceRecords,
  fetchMyAttendanceDays,
  fetchMyMakeups,
} from "../../services/me";
import { chinaDaysAgo, chinaToday, formatChinaHm } from "../../services/time";
import type {
  AttendanceRecord,
  MyAttendanceDay,
  Makeup,
} from "../../services/me.types";

const POINT_LABEL: Readonly<Record<AttendanceRecord["pointCode"], string>> = {
  SEGMENT_1_END: "上午下班",
  SEGMENT_1_START: "上午上班",
  SEGMENT_2_END: "下午下班",
  SEGMENT_2_START: "下午上班",
};
type Range = "TODAY" | "WEEK" | "CUSTOM";
export default function MyRecords(): JSX.Element {
  useSessionGuard();
  const { revision, refresh } = usePageRefresh();
  const [range, setRange] = useState<Range>("WEEK");
  const [from, setFrom] = useState<string>(chinaDaysAgo(6));
  const [to, setTo] = useState<string>(chinaToday());
  const [items, setItems] = useState<readonly AttendanceRecord[] | null>(null);
  const [days, setDays] = useState<readonly MyAttendanceDay[]>([]);
  const [makeups, setMakeups] = useState<readonly Makeup[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setError(null);
    void Promise.all([
      fetchMyAttendanceRecords(from, to),
      fetchMyAttendanceDays(from, to),
      fetchMyMakeups(),
    ]).then(
      ([rows, summary, approved]) => {
        if (!cancelled) {
          setItems(rows);
          setDays(summary);
          setMakeups(
            approved.filter(
              (row) =>
                row.status === "APPROVED" &&
                row.attendanceDate >= from &&
                row.attendanceDate <= to,
            ),
          );
        }
      },
      (reason) => {
        if (!cancelled)
          setError(
            reason instanceof Error ? reason.message : "无法读取考勤记录",
          );
      },
    );
    return () => {
      cancelled = true;
    };
  }, [from, to, revision]);
  const selectRange = (value: Range): void => {
    setRange(value);
    if (value === "TODAY") {
      setFrom(chinaToday());
      setTo(chinaToday());
    }
    if (value === "WEEK") {
      setFrom(chinaDaysAgo(6));
      setTo(chinaToday());
    }
  };
  return (
    <Screen>
      <PageHeader title="我的考勤" />
      <Segmented
        options={[
          { value: "TODAY", label: "今天" },
          { value: "WEEK", label: "近7天" },
          { value: "CUSTOM", label: "自选日期" },
        ]}
        value={range}
        onChange={selectRange}
      />
      {range === "CUSTOM" ? (
        <View>
          <Picker
            mode="date"
            value={from}
            end={to}
            onChange={(event) => {
              setFrom(event.detail.value);
            }}
          >
            <ListItem primary={`开始日期 · ${from}`} secondary="点击选择" />
          </Picker>
          <Picker
            mode="date"
            value={to}
            start={from}
            end={chinaToday()}
            onChange={(event) => {
              setTo(event.detail.value);
            }}
          >
            <ListItem primary={`结束日期 · ${to}`} secondary="点击选择" />
          </Picker>
        </View>
      ) : (
        <View className="report-range">
          {from} — {to}
        </View>
      )}
      {items ? (
        <StatCards
          items={[
            { label: "打卡次数", value: String(items.length) },
            {
              label: "核验通过",
              value: String(
                items.filter((item) => item.status === "VALID").length,
              ),
            },
            {
              label: "核验未通过",
              value: String(
                items.filter((item) => item.status === "INVALID").length,
              ),
            },
          ]}
        />
      ) : null}
      <View className="report-section-title">每日考勤（含已批准补卡）</View>
      {items !== null
        ? days.map((day) => (
            <ListItem
              key={`${day.projectId}:${day.attendanceDate}`}
              primary={`${day.attendanceDate} · ${Math.floor(day.workedMinutes / 60)}小时${day.workedMinutes % 60}分钟`}
              secondary={`${day.teamName ?? "项目直属"} · 已补卡 ${day.approvedMakeupCount} 次`}
              chip={
                [
                  day.isAbsent ? "缺勤" : "",
                  day.isLate ? "迟到" : "",
                  day.isEarlyLeave ? "早退" : "",
                  day.isMissingPunch ? "缺卡" : "",
                ]
                  .filter(Boolean)
                  .join(" / ") ||
                (day.attendanceDate === chinaToday() ? "进行中" : "无异常")
              }
            />
          ))
        : null}
      <View className="report-section-title">已批准补卡</View>
      {items !== null
        ? makeups.map((row) => (
            <ListItem
              key={row.id}
              primary={`${row.pointLabel ?? POINT_LABEL[row.pointCode] ?? row.pointCode} · ${formatChinaHm(row.requestedOccurredAt)}`}
              secondary={row.attendanceDate}
              chip="补卡已生效"
            />
          ))
        : null}
      <View className="report-section-title">原始打卡明细</View>
      {items === null && error === null ? <StateView title="加载中…" /> : null}
      {error ? (
        <StateView title="加载失败" sub={error} onRetry={refresh} />
      ) : null}
      {items?.length === 0 ? (
        <StateView
          title="这段时间还没有打卡记录"
          sub="完成考勤打卡后，记录会显示在这里。"
        />
      ) : null}
      {(items ?? []).map((record) => (
        <ListItem
          key={record.id}
          primary={`${record.pointLabel ?? POINT_LABEL[record.pointCode] ?? record.pointCode} · ${formatChinaHm(record.occurredAt)}`}
          secondary={`${record.attendanceDate}${record.abnormalReason ? ` · ${record.abnormalReason === "OUTSIDE_GEOFENCE" ? "超出考勤范围" : record.abnormalReason === "FACE_NOT_PASSED" ? "人脸核验未通过" : "核验异常"}` : " · 打卡已记录"}`}
          chip={record.status === "VALID" ? "核验通过" : "核验未通过"}
        />
      ))}
    </Screen>
  );
}
