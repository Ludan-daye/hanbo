import { View } from "@tarojs/components";
import { useEffect, useState } from "react";
import {
  fetchReportPerson,
  saveProjectEvaluation,
} from "../services/report-details";
import type { ReportPersonDetail } from "../services/management.types";
import {
  Button,
  Field,
  ListItem,
  Notice,
  StateView,
  Subtitle,
} from "./ui/index";

type Props = {
  readonly projectId: string;
  readonly memberId: string;
  readonly teamId: string | null;
  readonly from: string;
  readonly to: string;
  readonly onChanged: () => void;
};
const time = (iso: string): string =>
  new Date(Date.parse(iso) + 8 * 3600000)
    .toISOString()
    .slice(0, 16)
    .replace("T", " ");
const makeupStatus: Readonly<Record<string, string>> = {
  PENDING: "待审批",
  APPROVED: "已通过",
  REJECTED: "已驳回",
};
export const ReportPerson = ({
  projectId,
  memberId,
  teamId,
  from,
  to,
  onChanged,
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
        if (!cancelled)
          setError(
            failure instanceof Error ? failure.message : "人员明细加载失败。",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, memberId, teamId, from, to, revision]);
  const save = async (): Promise<void> => {
    if (detail === null || saving) return;
    if (!/^\d{1,3}$/.test(score) || Number(score) > 100) {
      setError("请输入 0–100 的整数评分。");
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
      setError(
        failure instanceof Error
          ? failure.message
          : "评分保存失败，请刷新后重试。",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <View className="report-person-detail">
      {error ? (
        <StateView
          title="操作未完成"
          sub={error}
          onRetry={() => {
            setEditing(false);
            setRevision(revision + 1);
          }}
        />
      ) : null}
      {detail === null && !error ? <StateView title="加载人员明细…" /> : null}
      {detail ? (
        <View>
          <Subtitle>
            {detail.person.projectName} ·{" "}
            {detail.person.workType ?? "工种未填写"} ·{" "}
            {detail.person.phone.replace(/^(\d{3})\d+(\d{4})$/, "$1****$2")}
          </Subtitle>
          <ListItem
            primary={`项目评分 · ${detail.person.evaluation === null ? "未评分" : `${detail.person.evaluation.score} / 100`}`}
            secondary={
              detail.person.evaluation === null
                ? "尚无管理人员评价"
                : `${detail.person.evaluation.reviewerName} · ${time(detail.person.evaluation.reviewedAt)}`
            }
          />
          {detail.person.evaluation?.comment ? (
            <Notice>{detail.person.evaluation.comment}</Notice>
          ) : null}
          <Subtitle>
            显示当前项目评价，不作为所选日期的考勤分；修改会保留审计记录。
          </Subtitle>
          {detail.canEvaluate && !editing ? (
            <Button variant="outline" onClick={() => setEditing(true)}>
              {detail.person.evaluation === null
                ? "添加项目评分"
                : "修改项目评分"}
            </Button>
          ) : null}
          {editing ? (
            <View>
              <Field
                label="项目评分（0–100）"
                value={score}
                onInput={setScore}
                placeholder="例如 90"
              />
              <Field
                maxLength={1000}
                label="评价说明"
                value={comment}
                onInput={setComment}
                placeholder="工作表现、配合情况及改进建议"
              />
              <Button
                disabled={saving}
                onClick={() => {
                  void save();
                }}
              >
                {saving ? "保存中…" : "保存评分"}
              </Button>
              <Button
                variant="outline"
                disabled={saving}
                onClick={() => setEditing(false)}
              >
                取消
              </Button>
            </View>
          ) : null}
          <View className="report-section-title">
            逐日记录 · {detail.days.length} 天
          </View>
          {detail.days.map((day) => (
            <View key={day.date}>
              <ListItem
                primary={`${day.date} · ${(day.workedMinutes / 60).toFixed(1)}h`}
                secondary={`${day.teamName ?? "项目直属"} · ${day.isScheduled ? "应出勤" : "非应勤"} · ${day.flags.join("、") || "暂无异常"}`}
                chip={openDate === day.date ? "收起" : "展开"}
                onClick={() =>
                  setOpenDate(openDate === day.date ? null : day.date)
                }
              />
              {openDate === day.date ? (
                <View className="report-day-detail">
                  <Subtitle>排班：{day.planName}（北京时间）</Subtitle>
                  {day.points.map((point) => (
                    <View key={point.code}>
                      <View className="report-point-label">
                        {point.label} · 要求 {point.time} · 宽限{" "}
                        {point.graceMins} 分钟
                      </View>
                      {day.records
                        .filter((record) => record.pointCode === point.code)
                        .map((record) => (
                          <Subtitle key={record.id}>
                            {time(record.occurredAt)} ·{" "}
                            {record.source === "MAKEUP"
                              ? "批准补卡"
                              : record.isValid
                                ? "核验通过"
                                : "核验未通过"}
                          </Subtitle>
                        ))}
                      {!day.records.some(
                        (record) => record.pointCode === point.code,
                      ) ? (
                        <Subtitle>暂无打卡记录</Subtitle>
                      ) : null}
                    </View>
                  ))}
                  {day.records
                    .filter(
                      (record) =>
                        !day.points.some(
                          (point) => point.code === record.pointCode,
                        ),
                    )
                    .map((record) => (
                      <Subtitle key={record.id}>
                        其他时点 {record.pointCode} · {time(record.occurredAt)}{" "}
                        · {record.isValid ? "有效" : "未通过"}
                      </Subtitle>
                    ))}
                  {day.makeups.map((makeup) => (
                    <Notice key={makeup.id}>
                      {makeup.pointLabel}补卡 · {makeupStatus[makeup.status]} ·{" "}
                      {time(makeup.requestedOccurredAt)}
                      <View>申请原因：{makeup.reason}</View>
                      {makeup.approverName ? (
                        <View>
                          审批：{makeup.approverName} ·{" "}
                          {makeup.approvedAt ? time(makeup.approvedAt) : ""} ·{" "}
                          {makeup.approvalReason ?? "无附加意见"}
                        </View>
                      ) : null}
                    </Notice>
                  ))}
                  {!day.records.length && day.workedMinutes > 0 ? (
                    <Notice>历史导入工时，无原始打卡明细。</Notice>
                  ) : null}
                </View>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
};
