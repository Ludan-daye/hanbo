import { Picker, Text, View } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh, useRouter } from "@tarojs/taro";
import { Fragment, useEffect, useState } from "react";

import { usePageRefresh } from "../../hooks/use-page-refresh";
import { errorMessage } from "../../services/error-messages";
import {
  fetchMyAttendanceDays,
  fetchMyAttendanceRecords,
  fetchMyMakeups,
  fetchMyProjects,
} from "../../services/me";
import type { MyProjectMembership } from "../../services/me.types";
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
import {
  Button,
  FormError,
  FormRow,
  Links,
  Notice,
  Numbers,
  PageHeader,
  Row,
  Screen,
  SectionTitle,
  Segmented,
  Sheet,
  SignLine,
  SkeletonRows,
  StateView,
  Status,
  Timeline,
  type SegmentedOption,
  type TimelineItem,
} from "../ui";
import {
  abnormalReasonLabel,
  dayHasIssue,
  dayLabel,
  dayMakeupUrl,
  dayNotes,
  dayPoints,
  dayRowStatus,
  fullDateLabel,
  hoursText,
  pointName,
  rangeHeading,
  rangeSign,
} from "./day-view";

import "./index.scss";

const RANGES: ReadonlyArray<SegmentedOption<AttendanceRange>> = [
  { value: "TODAY", label: "今天" },
  { value: "WEEK", label: "近7天" },
  { value: "MONTH", label: "本月" },
  { value: "CUSTOM", label: "自选" },
];

/**
 * 一天里的时点：打过的卡和补上的卡。
 * 页面只知道这天打了哪些卡、有没有缺卡，不知道缺的是哪一张，所以缺卡只留一行“还有卡没打”。
 */
const timelineItems = (group: WorkerRecordDay): TimelineItem[] => {
  const points = dayPoints(group);
  if (points.length === 0)
    return [{ key: "none", state: "todo", title: "这一天没有打卡记录" }];
  const items = points.map(
    (point): TimelineItem =>
      point.kind === "invalid"
        ? {
            key: point.key,
            state: "todo",
            title: point.name,
            sub: point.note ? `${point.time}，${point.note}` : point.time,
            right: <Status kind="bad">核验未通过</Status>,
          }
        : {
            key: point.key,
            state: "done",
            title: point.name,
            sub: point.note ?? undefined,
            right: (
              <Text className="num worker-records__time">{point.time}</Text>
            ),
          },
  );
  return group.summary?.isMissingPunch
    ? [
        ...items,
        {
          key: "missing",
          state: "todo",
          title: "还有卡没打",
          right: <Text className="worker-records__missing">没有记录</Text>,
        },
      ]
    : items;
};

/** 我的考勤：所有角色同一套版式。顶上一句结论，下面按天列出，有问题的那天下面就是补卡入口。 */
export const WorkerRecords = (): JSX.Element => {
  const params = useRouter().params;
  const { revision, refresh } = usePageRefresh();
  usePullDownRefresh(refresh);
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
  // null：还没点过哪一天，这时默认展开最近一个有问题的日子。
  const [opened, setOpened] = useState<{ readonly key: string | null } | null>(
    null,
  );
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
            error: errorMessage(cause, "无法读取考勤记录"),
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
  useEffect(() => {
    if (loaded !== null) Taro.stopPullDownRefresh();
  }, [loaded]);
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
  const classified =
    layers?.days.reduce(
      (sum, day) => ({
        normalMinutes: sum.normalMinutes + day.normalMinutes,
        overtimeMinutes: sum.overtimeMinutes + day.overtimeMinutes,
        unclassifiedMinutes: sum.unclassifiedMinutes + day.unclassifiedMinutes,
      }),
      { normalMinutes: 0, overtimeMinutes: 0, unclassifiedMinutes: 0 },
    ) ?? null;
  const options = attendanceProjectOptions(
    projects,
    loaded?.data ?? null,
    projectId,
  );
  const names = new Map(options.map((option) => [option.id, option.name]));
  const projectName = (id: string): string => names.get(id) ?? "未命名项目";
  const selectRange = (value: AttendanceRange): void => {
    if (value === "CUSTOM" && range !== "CUSTOM") setCustom({ from, to });
    setRange(value);
  };
  const loading = loaded === null && !rangeError;
  // 看全部项目、手里又不止一个项目时，每一天要写明是哪个项目的。
  const showProject = projectId === null && options.length > 2;
  // 只有一天时（比如从“今天的记录”进来）直接展开它。
  const openKey =
    opened !== null
      ? opened.key
      : groups.length === 1
        ? groups[0].key
        : (groups.find((group) => dayHasIssue(group))?.key ?? null);
  const invalidRecords =
    layers?.records.filter((row) => row.status === "INVALID") ?? [];

  return (
    <Screen header={<PageHeader title="我的考勤" />}>
      <Segmented options={RANGES} value={range} onChange={selectRange} />
      {range === "CUSTOM" ? (
        <>
          <View className="worker-records__dates">
            <Sheet gap>
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
                <FormRow
                  label="开始日期"
                  value={fullDateLabel(from)}
                  error={rangeError !== null}
                  chevron
                />
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
                <FormRow
                  label="结束日期"
                  value={fullDateLabel(to)}
                  error={rangeError !== null}
                  chevron
                />
              </Picker>
            </Sheet>
          </View>
          {rangeError ? (
            <FormError>{rangeError}</FormError>
          ) : (
            <Notice>一次最多看 93 天。</Notice>
          )}
        </>
      ) : null}

      {total ? (
        <SignLine {...rangeSign(range, total)} />
      ) : loading ? (
        <View className="worker-records__sk sk" />
      ) : null}

      <Sheet gap>
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
          <FormRow label="项目" chevron>
            <View className="worker-records__value">
              {projectId ? projectName(projectId) : "全部项目"}
            </View>
          </FormRow>
        </Picker>
      </Sheet>
      {projectError ? (
        <>
          <Notice>项目名没读到，记录照常能看。</Notice>
          <Button
            variant="text"
            onClick={() => setProjectRevision((value) => value + 1)}
          >
            重新读取项目名
          </Button>
        </>
      ) : null}

      {rangeError ? null : (
        <SectionTitle>{rangeHeading(from, to)}</SectionTitle>
      )}
      {loading ? <SkeletonRows rows={3} /> : null}
      {loaded?.error ? (
        <StateView
          kind="error"
          title="考勤没读到"
          sub={loaded.error}
          onRetry={refresh}
        />
      ) : null}
      {layers && groups.length === 0 ? (
        <StateView
          kind="empty"
          title="这段时间没有考勤记录"
          sub="换个日期或项目再看。"
        />
      ) : null}
      {groups.length > 0 ? (
        <Sheet>
          {groups.map((group) => {
            const expanded = openKey === group.key;
            return (
              <Fragment key={group.key}>
                <Row
                  title={dayLabel(group.date)}
                  sub={showProject ? projectName(group.projectId) : undefined}
                  status={dayRowStatus(group, today)}
                  chevron={!expanded}
                  onClick={() =>
                    setOpened({ key: expanded ? null : group.key })
                  }
                />
                {expanded ? (
                  <View className="worker-records__detail m-fade">
                    <Timeline items={timelineItems(group)} />
                    <View className="worker-records__note">
                      {dayNotes(group).map((line) => (
                        <View key={line}>{line}</View>
                      ))}
                    </View>
                    {dayHasIssue(group) && group.date <= today ? (
                      <Row
                        title="为这一天申请补卡"
                        hazard
                        chevron
                        onClick={() => {
                          void Taro.navigateTo({ url: dayMakeupUrl(group) });
                        }}
                      />
                    ) : null}
                  </View>
                ) : null}
              </Fragment>
            );
          })}
        </Sheet>
      ) : null}

      <Links>
        {layers ? (
          <Button
            variant="text"
            onClick={() => setStatsOpen((value) => !value)}
          >
            {statsOpen ? "收起统计" : "全部统计"}
          </Button>
        ) : null}
        <Button
          variant="text"
          onClick={() => {
            void Taro.navigateTo({ url: "/pages/submit-makeup/index" });
          }}
        >
          申请补卡
        </Button>
      </Links>
      {statsOpen && layers && classified ? (
        <View className="m-fade">
          <SectionTitle>全部统计</SectionTitle>
          <Numbers
            wrap
            items={[
              {
                value: hoursText(classified.normalMinutes),
                label: "正常工时",
              },
              {
                value: hoursText(classified.overtimeMinutes),
                label: "加班工时",
              },
              {
                value: hoursText(classified.unclassifiedMinutes),
                label: "未分类工时",
              },
              {
                value: String(layers.records.length),
                unit: "次",
                label: "打卡",
              },
              {
                value: String(layers.records.length - invalidRecords.length),
                unit: "次",
                label: "核验通过",
              },
              {
                value: String(invalidRecords.length),
                unit: "次",
                label: "核验未通过",
                tone: invalidRecords.length > 0 ? "bad" : undefined,
              },
            ]}
          />
          {invalidRecords.length > 0 ? (
            <>
              <SectionTitle>核验未通过的打卡</SectionTitle>
              <Sheet>
                {invalidRecords.map((row) => (
                  <Row
                    key={row.id}
                    title={pointName(row)}
                    titleNum={formatChinaHm(row.occurredAt)}
                    sub={[
                      abnormalReasonLabel(row.abnormalReason),
                      dayLabel(row.attendanceDate),
                      projectName(row.projectId),
                    ]
                      .filter(Boolean)
                      .join("，")}
                  />
                ))}
              </Sheet>
            </>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
};
