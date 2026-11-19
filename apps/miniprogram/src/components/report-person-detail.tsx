import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";

import {
  dayLabel,
  personNumbers,
  personSummary,
  type ReportPeriod,
  type ReportRow,
} from "../pages/reports/view-model";
import { displayProjectRole } from "../routing/features";
import { errorMessage } from "../services/error-messages";
import type {
  ReportPersonDay,
  ReportPersonDetail,
} from "../services/management.types";
import {
  fetchReportPerson,
  saveProjectEvaluation,
} from "../services/report-details";
import {
  BottomBar,
  Button,
  FormArea,
  FormInput,
  KV,
  Links,
  Notice,
  Numbers,
  PRESS,
  Row,
  SectionTitle,
  Sheet,
  SignLine,
  SkeletonRows,
  StateView,
  Status,
  Timeline,
  type StatusKind,
  type TimelineItem,
} from "./ui/index";

import "../pages/reports/report.scss";

type Props = {
  readonly projectId: string;
  readonly memberId: string;
  readonly teamId: string | null;
  readonly from: string;
  readonly to: string;
  readonly onChanged: () => void;
  /** 报表里这个人的几行（几个班组），顶上的结论和数字从这里算。 */
  readonly rows: readonly ReportRow[];
  readonly period: ReportPeriod;
};
type DayRecord = ReportPersonDay["records"][number];

const time = (iso: string): string =>
  new Date(Date.parse(iso) + 8 * 3600000)
    .toISOString()
    .slice(0, 16)
    .replace("T", " ");
/** 这一天里的打卡只写几点几分；跨到别的日子（夜班）带上日期。 */
const clock = (iso: string, date: string): string => {
  const text = time(iso);
  return text.startsWith(date) ? text.slice(11) : text.slice(5);
};
const hours = (minutes: number): string => (minutes / 60).toFixed(1);
const makeupStatus: Readonly<Record<string, string>> = {
  PENDING: "待审批",
  APPROVED: "已通过",
  REJECTED: "已驳回",
};
const recordText = (record: DayRecord): string =>
  record.source === "MAKEUP"
    ? "批准补卡"
    : record.isValid
      ? "核验通过"
      : "核验未通过";

/** 一天收成一行时右边的状态：有问题说问题，没问题说工时。 */
const dayStatus = (
  day: ReportPersonDay,
): { readonly kind: StatusKind; readonly text: string } => {
  if (day.flags.length > 0) {
    const all = day.flags.join("、");
    return {
      kind: "bad",
      text: all.length <= 8 ? all : `${day.flags[0]}等 ${day.flags.length} 项`,
    };
  }
  if (day.isPendingVerification) return { kind: "warn", text: "退场待补齐" };
  if (day.workedMinutes > 0)
    return { kind: "ok", text: `${hours(day.workedMinutes)} 小时` };
  return { kind: "idle", text: day.isScheduled ? "没有记工" : "不排班" };
};

/** 这一天的时点：排班里的每个时点一行，排班以外的打卡跟在后面。 */
const dayTimeline = (day: ReportPersonDay): ReadonlyArray<TimelineItem> => {
  const missed = day.flags.some((flag) => flag === "缺卡" || flag === "缺勤");
  return [
    ...day.points.map((point): TimelineItem => {
      const records = day.records.filter(
        (record) => record.pointCode === point.code,
      );
      const last = records.at(-1);
      return {
        key: point.code,
        state: records.some((record) => record.isValid) ? "done" : "todo",
        title: `${point.label} ${point.time}`,
        sub: [
          ...(records.length === 1
            ? [recordText(records[0])]
            : records.map(
                (record) =>
                  `${clock(record.occurredAt, day.date)} ${recordText(record)}`,
              )),
          point.graceMins > 0 ? `宽限 ${point.graceMins} 分钟` : "",
        ]
          .filter(Boolean)
          .join("，"),
        right: last ? (
          <Text className="rpt-day__time num">
            {clock(last.occurredAt, day.date)}
          </Text>
        ) : (
          <Text className={missed ? "rpt-day__none" : "rpt-day__wait"}>
            没有记录
          </Text>
        ),
      };
    }),
    ...day.records
      .filter(
        (record) =>
          !day.points.some((point) => point.code === record.pointCode),
      )
      .map(
        (record): TimelineItem => ({
          key: record.id,
          state: record.isValid ? "done" : "todo",
          title: "排班以外的打卡",
          sub: recordText(record),
          right: (
            <Text className="rpt-day__time num">
              {clock(record.occurredAt, day.date)}
            </Text>
          ),
        }),
      ),
  ];
};

/**
 * 个人考勤明细：这段时间的结论、信用和评分、每天的记录。
 * 放在报表页的“个人”视图里，页头和返回由报表页管。
 */
export const ReportPerson = ({
  projectId,
  memberId,
  teamId,
  from,
  to,
  onChanged,
  rows,
  period,
}: Props): JSX.Element => {
  const [detail, setDetail] = useState<ReportPersonDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState<number>(0);
  const [openDate, setOpenDate] = useState<string | null>(
    from === to ? from : null,
  );
  const [score, setScore] = useState<string>("");
  const [comment, setComment] = useState<string>("");
  const [editing, setEditing] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [allStats, setAllStats] = useState<boolean>(false);
  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);
    void fetchReportPerson(projectId, memberId, teamId, from, to)
      .then((data) => {
        if (cancelled) return;
        setDetail(data);
        setScore(
          data.person.evaluation === null
            ? ""
            : String(data.person.evaluation.score),
        );
        setComment(data.person.evaluation?.comment ?? "");
      })
      .catch((failure: unknown) => {
        if (!cancelled) setError(errorMessage(failure, "人员明细加载失败。"));
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, memberId, teamId, from, to, revision]);
  const save = async (): Promise<void> => {
    if (detail === null || saving) return;
    if (!/^\d{1,3}$/.test(score) || Number(score) > 100) {
      setError("请输入 0 到 100 的整数评分。");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const evaluation = await saveProjectEvaluation(
        projectId,
        memberId,
        Number(score),
        comment,
        detail.person.evaluation?.updatedAt ?? null,
      );
      setDetail({ ...detail, person: { ...detail.person, evaluation } });
      setEditing(false);
      onChanged();
    } catch (failure: unknown) {
      setError(errorMessage(failure, "评分保存失败，请刷新后重试。"));
    } finally {
      setSaving(false);
    }
  };
  const reload = (): void => {
    setEditing(false);
    setRevision(revision + 1);
  };
  const openMap = (record: DayRecord, name: string): void => {
    void Taro.openLocation({
      latitude: Number(record.latitude),
      longitude: Number(record.longitude),
      name,
      scale: 16,
    }).catch((failure: unknown) => {
      // 人已经滑到某一天里了，页面上方的提示看不到，再弹一下。
      const message = errorMessage(failure, "地图打开失败");
      setError(message);
      void Taro.showToast({ icon: "none", title: message });
    });
  };

  const first = rows[0];
  const summary = personSummary(rows, period, from);
  const numbers = personNumbers(rows);
  const person = detail?.person ?? first;
  const evaluation = detail?.person.evaluation ?? null;
  const days =
    detail === null
      ? []
      : [...detail.days].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <>
      <SignLine title={summary.title} sub={summary.sub} />
      <Notice>
        {[
          person.projectName,
          person.workType ?? "工种没填",
          displayProjectRole(person.projectRoleLabel),
          person.projectKind === "REPAIR" ? "零星维修" : "常规施工",
          person.isTemporary ? "临时用工" : "常规用工",
          person.phone.replace(/^(\d{3})\d+(\d{4})$/, "$1****$2"),
        ]
          .filter((part, index, all) => all.indexOf(part) === index)
          .join("，")}
      </Notice>

      {detail === null ? (
        error ? (
          <StateView
            kind="error"
            title="这个人的明细没读到"
            sub={error}
            onRetry={reload}
          />
        ) : (
          <View aria-label="正在读取人员明细">
            <SkeletonRows rows={2} gap />
            <SkeletonRows rows={3} gap />
          </View>
        )
      ) : (
        <>
          <Sheet gap>
            {detail.person.safetyCreditScore !== null ? (
              <Row
                title="安全信用"
                sub={`截止 ${detail.person.safetyCreditAsOf === null ? to : time(detail.person.safetyCreditAsOf)}`}
              >
                <View>
                  <Text className="num">{detail.person.safetyCreditScore}</Text>{" "}
                  / 100
                </View>
              </Row>
            ) : null}
            <Row
              title="项目评分"
              sub={
                evaluation === null
                  ? "还没有管理人员评过"
                  : `${evaluation.reviewerName}，${time(evaluation.reviewedAt).slice(0, 10)}`
              }
              value={evaluation === null ? "还没评" : undefined}
              mute={evaluation === null}
            >
              {evaluation === null ? null : (
                <View>
                  <Text className="num">{evaluation.score}</Text> 分
                </View>
              )}
              {detail.canEvaluate && !editing ? (
                <View
                  className="rpt-link ui-press"
                  {...PRESS}
                  onClick={() => setEditing(true)}
                >
                  {evaluation === null ? "去评分" : "修改"}
                </View>
              ) : null}
            </Row>
          </Sheet>
          {evaluation?.comment && !editing ? (
            <Notice>评价：{evaluation.comment}</Notice>
          ) : null}
          {editing ? (
            <Sheet gap>
              <FormInput
                label="项目评分"
                required
                type="number"
                maxLength={3}
                value={score}
                placeholder="0 到 100"
                disabled={saving}
                onInput={setScore}
              />
              <FormArea
                label="评价说明"
                value={comment}
                placeholder="工作表现、配合情况、改进建议"
                maxLength={1000}
                disabled={saving}
                onInput={setComment}
              />
            </Sheet>
          ) : null}
          <Notice>
            {detail.person.safetyCreditScore !== null
              ? "安全信用是跨公司累计的。"
              : ""}
            项目评分和考勤分开算，每次修改都会留下记录。
          </Notice>
          {error ? (
            <>
              <Notice tone="error">{error}</Notice>
              <Links>
                <Button variant="text" disabled={saving} onClick={reload}>
                  重新读取
                </Button>
              </Links>
            </>
          ) : null}

          {rows.length > 1 ? (
            <Sheet gap>
              {rows.map((row) => (
                <Row
                  key={row.teamId ?? "direct"}
                  title={row.teamName ?? "项目直属"}
                  sub={`正常 ${hours(row.normalMinutes)}，加班 ${hours(row.overtimeMinutes)}，未分类 ${hours(row.unclassifiedMinutes)} 小时`}
                  value={row.requiresAttendance ? undefined : "免考勤"}
                  mute
                />
              ))}
            </Sheet>
          ) : first.requiresAttendance ? null : (
            <Notice>免考勤的成员，不算应出勤。</Notice>
          )}
          <Numbers items={numbers.top} gap />
          {allStats ? (
            <View className="m-fade">
              <Numbers items={numbers.rest} wrap gap />
            </View>
          ) : null}

          <SectionTitle
            action={allStats ? "收起统计" : "全部统计"}
            onAction={() => setAllStats((value) => !value)}
          >
            {`每天，共 ${days.length} 天`}
          </SectionTitle>
          {days.length === 0 ? (
            <Notice>这段时间没有记录。</Notice>
          ) : (
            <Sheet>
              {days.map((day) => {
                const open = openDate === day.date;
                return [
                  <Row
                    key={day.date}
                    title={dayLabel(day.date)}
                    status={dayStatus(day)}
                    chevron={!open}
                    onClick={() => setOpenDate(open ? null : day.date)}
                  />,
                  open ? (
                    <View key={`${day.date}-detail`} className="rpt-day m-fade">
                      <Timeline items={dayTimeline(day)} />
                      <View className="rpt-day__body">
                        {day.isPendingVerification ? (
                          <View className="rpt-day__warn">退场记录待补齐</View>
                        ) : null}
                        {!day.records.length && day.workedMinutes > 0 ? (
                          <View className="rpt-day__sub">
                            这天的工时是历史导入的，没有原始打卡记录。
                          </View>
                        ) : null}
                        <KV label="排班" value={day.planName} />
                        <KV
                          label="班组"
                          value={`${day.teamName ?? "项目直属"}，${day.isScheduled ? "应出勤" : "不排班"}`}
                        />
                        <KV
                          label="工时"
                          value={`正常 ${hours(day.normalMinutes)}，加班 ${hours(day.overtimeMinutes)}，未分类 ${hours(day.unclassifiedMinutes)}`}
                        />
                        {day.records.length > 0 ? (
                          <View className="rpt-day__head">打卡位置</View>
                        ) : null}
                        {day.records.map((record) => {
                          const located =
                            record.latitude !== null &&
                            record.longitude !== null;
                          return (
                            <View
                              key={`location-${record.id}`}
                              className={`rpt-day__item${located ? " ui-press" : ""}`}
                              {...(located ? PRESS : {})}
                              onClick={
                                located
                                  ? () => openMap(record, person.projectName)
                                  : undefined
                              }
                            >
                              <View className="rpt-day__text">
                                <View>
                                  {clock(record.occurredAt, day.date)}，
                                  {record.isValid ? "有效" : "未通过"}
                                </View>
                                <View className="rpt-day__sub">
                                  {located
                                    ? `${record.latitude}, ${record.longitude}${record.locationAccuracyM === null ? "" : `，精度 ${record.locationAccuracyM} 米`}`
                                    : "没有定位"}
                                </View>
                              </View>
                              {located ? (
                                <View className="rpt-link">看地图</View>
                              ) : null}
                            </View>
                          );
                        })}
                        {day.makeups.length > 0 ? (
                          <View className="rpt-day__head">补卡</View>
                        ) : null}
                        {day.makeups.map((makeup) => (
                          <View key={makeup.id} className="rpt-day__item">
                            <View className="rpt-day__text">
                              <View>
                                {makeup.pointLabel}，
                                {clock(makeup.requestedOccurredAt, day.date)}
                              </View>
                              <View className="rpt-day__sub">
                                申请原因：{makeup.reason}
                              </View>
                              {makeup.approverName ? (
                                <View className="rpt-day__sub">
                                  {makeup.approverName}
                                  {makeup.approvedAt
                                    ? ` ${time(makeup.approvedAt).slice(5)} `
                                    : " "}
                                  审批：
                                  {makeup.approvalReason ?? "没有写意见"}
                                </View>
                              ) : null}
                            </View>
                            <Status>
                              {makeupStatus[makeup.status] ?? "处理中"}
                            </Status>
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : null,
                ];
              })}
            </Sheet>
          )}
          {editing ? (
            <BottomBar
              primary={saving ? "保存中…" : "保存评分"}
              busy={saving}
              onPrimary={() => {
                void save();
              }}
            >
              <Button
                variant="text"
                disabled={saving}
                onClick={() => setEditing(false)}
              >
                取消
              </Button>
            </BottomBar>
          ) : null}
        </>
      )}
    </>
  );
};
