import Taro, { useDidShow, useRouter } from "@tarojs/taro";
import { Button as NativeButton, Picker, View } from "@tarojs/components";
import { useEffect, useState } from "react";
import { Button, PageHeader, Screen } from "../ui";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import {
  fetchMyAttendanceDays,
  fetchMyAttendanceRecords,
  fetchMyMakeups,
  fetchMyProjects,
} from "../../services/me";
import type {
  AttendanceRecord,
  MyProjectMembership,
} from "../../services/me.types";
import { chinaToday, formatChinaHm } from "../../services/time";
import { summarizeWorkerMonth } from "../../services/worker-home";
import {
  attendanceWindow,
  attendanceRangeError,
  attendanceRequestKey,
  attendanceProjectOptions,
  filterAttendance,
  groupAttendanceDays,
  type AttendanceLayers,
  type AttendanceRange,
  type WorkerRecordDay,
} from "../../services/worker-records";
import "./index.scss";

const RANGES: readonly { value: AttendanceRange; label: string }[] = [
  { value: "TODAY", label: "今天" },
  { value: "WEEK", label: "近7天" },
  { value: "MONTH", label: "本月" },
  { value: "CUSTOM", label: "自选" },
];
const POINT_LABEL: Readonly<Record<string, string>> = {
  SEGMENT_1_END: "上午下班",
  SEGMENT_1_START: "上午上班",
  SEGMENT_2_END: "下午下班",
  SEGMENT_2_START: "下午上班",
};
const pointName = (row: {
  readonly pointLabel?: string | null;
  readonly pointCode: string;
}): string => row.pointLabel ?? POINT_LABEL[row.pointCode] ?? row.pointCode;
const minutesLabel = (minutes: number): string =>
  `${Math.floor(minutes / 60)}小时${minutes % 60 ? `${minutes % 60}分钟` : ""}`;
const reasonLabel = (reason: string | null): string =>
  reason === "OUTSIDE_GEOFENCE"
    ? "超出考勤范围"
    : reason === "FACE_NOT_PASSED"
      ? "人脸核验未通过"
      : reason
        ? "核验异常"
        : "";
const dayLabel = (value: string): string => {
  const date = new Date(`${value}T00:00:00Z`);
  return `${date.getUTCMonth() + 1}月${date.getUTCDate()}日 · 星期${"日一二三四五六"[date.getUTCDay()]}`;
};
const dayStatus = (group: WorkerRecordDay, today: string): string => {
  const day = group.summary;
  const flags = day
    ? [
        day.isAbsent ? "缺勤" : "",
        day.isLate ? "迟到" : "",
        day.isEarlyLeave ? "早退" : "",
        day.isMissingPunch ? "缺卡" : "",
      ].filter(Boolean)
    : [];
  if (flags.length) return flags.join(" / ");
  if (group.records.some((row) => row.status === "INVALID")) return "核验异常";
  if (group.makeups.length) return `已补卡 ${group.makeups.length} 次`;
  if (!day) return "汇总待确认";
  return group.date === today ? "进行中" : "无异常";
};

const RawRecord = ({
  row,
}: {
  readonly row: AttendanceRecord;
}): JSX.Element => (
  <View className="worker-records__record">
    <View className="worker-records__record-line">
      <View>
        {pointName(row)} · {formatChinaHm(row.occurredAt)}
      </View>
      <View
        className={
          row.status === "VALID"
            ? "worker-records__success"
            : "worker-records__error"
        }
      >
        {row.status === "VALID" ? "核验通过" : "核验未通过"}
      </View>
    </View>
    {row.abnormalReason ? (
      <View className="worker-records__muted">
        原因：{reasonLabel(row.abnormalReason)}
      </View>
    ) : null}
  </View>
);

export const WorkerRecords = (): JSX.Element => {
  const params = useRouter().params;
  const { revision, refresh } = usePageRefresh();
  const [today, setToday] = useState(chinaToday);
  const [range, setRange] = useState<AttendanceRange>(
    params.range === "MONTH"
      ? "MONTH"
      : params.range === "TODAY"
        ? "TODAY"
        : "WEEK",
  );
  const [custom, setCustom] = useState({
    from: `${today.slice(0, 7)}-01`,
    to: today,
  });
  const [projectId, setProjectId] = useState<string | null>(
    params.projectId || null,
  );
  const [projects, setProjects] = useState<readonly MyProjectMembership[]>([]);
  const [projectError, setProjectError] = useState(false);
  const [projectRevision, setProjectRevision] = useState(0);
  const [opened, setOpened] = useState<string | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const [response, setResponse] = useState<{
    readonly key: string;
    readonly data: AttendanceLayers | null;
    readonly error: string | null;
  } | null>(null);
  useDidShow(() => setToday(chinaToday()));
  useEffect(() => {
    const timer = setInterval(() => setToday(chinaToday()), 60000);
    return () => clearInterval(timer);
  }, []);
  const { from, to } = attendanceWindow(range, today, custom);
  const rangeError = attendanceRangeError(from, to);
  const requestKey = attendanceRequestKey(from, to, revision, today);
  useEffect(() => {
    let cancelled = false;
    if (rangeError) return;
    void Promise.all([
      fetchMyAttendanceDays(from, to),
      fetchMyAttendanceRecords(from, to),
      fetchMyMakeups(),
    ]).then(
      ([days, records, makeups]) => {
        if (!cancelled)
          setResponse({
            key: requestKey,
            data: { days, records, makeups },
            error: null,
          });
      },
      (cause: unknown) => {
        if (!cancelled)
          setResponse({
            key: requestKey,
            data: null,
            error: cause instanceof Error ? cause.message : "无法读取考勤记录",
          });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [from, to, requestKey, rangeError]);
  useEffect(() => {
    let cancelled = false;
    void fetchMyProjects().then(
      (rows) => {
        if (!cancelled) {
          setProjects(rows);
          setProjectError(false);
        }
      },
      () => {
        if (!cancelled) setProjectError(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [revision, projectRevision]);
  useEffect(() => {
    setOpened(null);
    setStatsOpen(false);
  }, [projectId, from, to]);
  // Data is fetched for all projects once; switching projects cannot race a prior project's response.
  const loaded = response?.key === requestKey ? response : null;
  const layers =
    loaded?.data && !rangeError
      ? filterAttendance(loaded.data, projectId, from, to)
      : null;
  const groups = layers
    ? groupAttendanceDays(layers.days, layers.records, layers.makeups)
    : [];
  const total = layers
    ? summarizeWorkerMonth(
        layers.days,
        layers.records,
        layers.makeups,
        from,
        to,
      )
    : null;
  const options = attendanceProjectOptions(
    projects,
    loaded?.data ?? null,
    projectId,
  );
  const names = new Map(options.map((option) => [option.id, option.name]));
  const projectName = (id: string): string => names.get(id) ?? `项目 ${id}`;
  const selectRange = (value: AttendanceRange): void => {
    if (value === "CUSTOM" && range !== "CUSTOM") setCustom({ from, to });
    setRange(value);
  };
  return (
    <Screen
      appearance="worker"
      header={<PageHeader title="我的考勤" appearance="worker" />}
    >
      <View className="worker-records">
        <Picker
          mode="selector"
          range={options.map((option) => option.name)}
          value={Math.max(
            0,
            options.findIndex((option) => option.id === (projectId ?? "")),
          )}
          onChange={(event) =>
            setProjectId(options[Number(event.detail.value)]?.id || null)
          }
        >
          <View
            className="worker-records__project"
            role="button"
            aria-label="切换考勤项目"
          >
            <View>{projectId ? projectName(projectId) : "全部项目"}</View>
            <View className="worker-records__muted">切换</View>
          </View>
        </Picker>
        {projectError ? (
          <View className="worker-records__project-warning">
            项目名称暂未加载，历史记录仍可查看。
            <NativeButton
              className="worker-records__text-button"
              onClick={() => setProjectRevision((v) => v + 1)}
            >
              重试名称
            </NativeButton>
          </View>
        ) : null}
        <View className="worker-records__ranges">
          {RANGES.map((item) => (
            <NativeButton
              key={item.value}
              className={`worker-records__range${range === item.value ? " worker-records__range--selected" : ""}`}
              onClick={() => selectRange(item.value)}
            >
              {item.label}
            </NativeButton>
          ))}
        </View>
        {range === "CUSTOM" ? (
          <View>
            <View className="worker-records__dates">
              <Picker
                mode="date"
                value={from}
                end={to}
                onChange={(event) =>
                  setCustom((current) => ({
                    ...current,
                    from: event.detail.value,
                  }))
                }
              >
                <View className="worker-records__date">
                  <View className="worker-records__muted">开始日期</View>
                  <View>{from}</View>
                </View>
              </Picker>
              <Picker
                mode="date"
                value={to}
                start={from}
                end={today}
                onChange={(event) =>
                  setCustom((current) => ({
                    ...current,
                    to: event.detail.value,
                  }))
                }
              >
                <View className="worker-records__date">
                  <View className="worker-records__muted">结束日期</View>
                  <View>{to}</View>
                </View>
              </Picker>
            </View>
            <View
              className={
                rangeError ? "worker-records__error" : "worker-records__muted"
              }
            >
              {rangeError ?? "日期范围最长 93 天。"}
            </View>
          </View>
        ) : (
          <View className="worker-records__period">
            {from} — {to}
          </View>
        )}
        <View className="worker-records__summary">
          {total ? (
            <>
              <View className="worker-records__summary-line">
                实际出勤 {total.attendedDays} 天 · 已记录工时{" "}
                {(total.workedMinutes / 60).toFixed(1)} 小时
              </View>
              <View className="worker-records__muted">
                出勤按自然日去重，工时按日汇总累计。
              </View>
            </>
          ) : (
            <View className="worker-records__muted">
              {loaded?.error || rangeError ? "统计暂不可用" : "正在读取考勤…"}
            </View>
          )}
        </View>
        {loaded?.error ? (
          <View className="worker-records__state">
            <View className="worker-records__heading">考勤加载失败</View>
            <View className="worker-records__muted">{loaded.error}</View>
            <View className="worker-records__muted">
              当前筛选已保留，请重新加载。
            </View>
            <Button appearance="worker" onClick={refresh}>
              重新加载
            </Button>
          </View>
        ) : null}
        {layers && groups.length === 0 ? (
          <View className="worker-records__state">
            <View className="worker-records__heading">
              这段时间暂无考勤记录
            </View>
            <View className="worker-records__muted">
              可切换上方日期或项目查看。
            </View>
          </View>
        ) : null}
        {groups.map((group) => {
          const expanded = opened === group.key;
          const status = dayStatus(group, today);
          const hasIssue =
            group.summary?.isAbsent ||
            group.summary?.isLate ||
            group.summary?.isEarlyLeave ||
            group.summary?.isMissingPunch ||
            group.records.some((row) => row.status === "INVALID");
          return (
            <View key={group.key} className="worker-records__day">
              <NativeButton
                className="worker-records__day-toggle"
                aria-expanded={expanded}
                onClick={() => setOpened(expanded ? null : group.key)}
              >
                <View className="worker-records__day-line">
                  <View className="worker-records__day-title">
                    {dayLabel(group.date)}
                  </View>
                  <View>
                    {group.summary
                      ? minutesLabel(group.summary.workedMinutes)
                      : "待汇总"}
                  </View>
                </View>
                <View className="worker-records__day-line worker-records__muted">
                  <View className="worker-records__project-name">
                    {projectName(group.projectId)}
                  </View>
                  <View
                    className={
                      hasIssue
                        ? "worker-records__error"
                        : group.makeups.length
                          ? "worker-records__link"
                          : ""
                    }
                  >
                    {status}
                  </View>
                </View>
                <View className="worker-records__expand-label">
                  {expanded ? "收起明细" : "查看明细"}
                </View>
              </NativeButton>
              {expanded ? (
                <View className="worker-records__details">
                  <View className="worker-records__detail-section">
                    <View className="worker-records__detail-title">日汇总</View>
                    {group.summary ? (
                      <>
                        <View>
                          {minutesLabel(group.summary.workedMinutes)} · {status}
                        </View>
                        <View className="worker-records__muted">
                          {group.summary.teamName ?? "项目直属"} · 已补卡{" "}
                          {group.summary.approvedMakeupCount} 次
                        </View>
                      </>
                    ) : (
                      <View className="worker-records__muted">
                        暂无日汇总，请以以下已保存记录为准。
                      </View>
                    )}
                  </View>
                  <View className="worker-records__detail-section">
                    <View className="worker-records__detail-title">
                      已批准补卡（{group.makeups.length} 次）
                    </View>
                    {group.makeups.length ? (
                      group.makeups.map((row) => (
                        <View className="worker-records__record" key={row.id}>
                          <View className="worker-records__record-line">
                            <View>
                              {pointName(row)} ·{" "}
                              {formatChinaHm(row.requestedOccurredAt)}
                            </View>
                            <View className="worker-records__link">
                              补卡已生效
                            </View>
                          </View>
                        </View>
                      ))
                    ) : (
                      <View className="worker-records__muted">
                        暂无已批准补卡。
                      </View>
                    )}
                  </View>
                  <View className="worker-records__detail-section">
                    <View className="worker-records__detail-title">
                      原始打卡明细（{group.records.length} 次）
                    </View>
                    {group.records.length ? (
                      group.records.map((row) => (
                        <RawRecord key={row.id} row={row} />
                      ))
                    ) : (
                      <View className="worker-records__muted">
                        暂无原始打卡记录。
                        {group.makeups.length
                          ? "已批准的补卡仍是有效考勤结果。"
                          : ""}
                      </View>
                    )}
                  </View>
                </View>
              ) : null}
            </View>
          );
        })}
        <View className="worker-records__actions">
          <NativeButton
            className="worker-records__text-button"
            disabled={!layers}
            onClick={() => setStatsOpen((value) => !value)}
          >
            {statsOpen ? "收起核验统计" : "核验统计"}
          </NativeButton>
          <NativeButton
            className="worker-records__text-button"
            onClick={() => {
              void Taro.navigateTo({ url: "/pages/submit-makeup/index" });
            }}
          >
            申请补卡
          </NativeButton>
        </View>
        {statsOpen && layers ? (
          <View className="worker-records__verification">
            <View className="worker-records__heading">核验统计</View>
            <View className="worker-records__record-line">
              <View>原始打卡次数</View>
              <View>{layers.records.length}</View>
            </View>
            <View className="worker-records__record-line">
              <View>核验通过</View>
              <View>
                {layers.records.filter((row) => row.status === "VALID").length}
              </View>
            </View>
            <View className="worker-records__record-line">
              <View>核验未通过</View>
              <View>
                {
                  layers.records.filter((row) => row.status === "INVALID")
                    .length
                }
              </View>
            </View>
            {layers.records
              .filter((row) => row.status === "INVALID")
              .map((row) => (
                <View key={row.id} className="worker-records__invalid">
                  <View className="worker-records__muted">
                    {row.attendanceDate} · {projectName(row.projectId)}
                  </View>
                  <RawRecord row={row} />
                </View>
              ))}
          </View>
        ) : null}
      </View>
    </Screen>
  );
};
