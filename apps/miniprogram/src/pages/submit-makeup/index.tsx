import { Picker, Textarea, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import { useSessionGuard } from "../../hooks/use-session-guard";

import {
  Button,
  ListItem,
  Notice,
  PageHeader,
  Screen,
  Section,
  Segmented,
  StateView,
} from "../../components/ui/index";
import { fetchMyProjects, submitMakeup } from "../../services/me";
import { fetchMyAttendancePlan, type EffectivePlan } from "../../services/attendance-plans";
import { chinaToday } from "../../services/time";
import type {
  AttendancePointCode,
  MyProjectMembership,
} from "../../services/me.types";

export default function SubmitMakeup(): JSX.Element {
  useSessionGuard();
  const [projects, setProjects] = useState<
    readonly MyProjectMembership[] | null
  >(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [date, setDate] = useState<string>(chinaToday());
  const [time, setTime] = useState<string>("08:00");
  const [point, setPoint] = useState<AttendancePointCode>("");
  const [plan, setPlan] = useState<EffectivePlan | null>(null);
  const [reason, setReason] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetchMyProjects().then(
      (rows) => {
        if (!cancelled) {
          setProjects(rows);
          setProjectId(rows[0]?.projectId ?? null);
        }
      },
      (cause) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : "无法读取项目");
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (projectId === null) return;
    let cancelled = false;
    setPlan(null); setPoint(""); setError(null);
    void fetchMyAttendancePlan(projectId, date).then((value) => {
      if (cancelled) return;
      setPlan(value); setPoint(value.isWorkday ? value.points[0]?.code ?? "" : "");
      setTime(value.points[0]?.time ?? "08:00");
    }, (cause: unknown) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "无法读取当天排班"); });
    return () => { cancelled = true; };
  }, [projectId, date]);
  const selectPoint = (value: AttendancePointCode): void => {
    setPoint(value); setTime(plan?.points.find((row) => row.code === value)?.time ?? "08:00");
  };
  const submit = async (): Promise<void> => {
    if (projectId === null || !plan?.isWorkday || !point || reason.trim().length === 0 || busy) return;
    const requestedOccurredAt = `${date}T${time}:00+08:00`;
    if (new Date(requestedOccurredAt).getTime() > Date.now()) {
      setError("不能申请未来时间的补卡，请检查日期和时间。");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await submitMakeup(projectId, {
        attendanceDate: date,
        pointCode: point,
        reason: reason.trim(),
        requestedOccurredAt,
      });
      await Taro.showToast({ icon: "success", title: "申请已提交" });
      if (Taro.getCurrentPages().length > 1) await Taro.navigateBack();
      else await Taro.redirectTo({ url: "/pages/my-makeups/index" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "申请未提交，请重试");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      <PageHeader title="发起补卡" />
      <Notice>请按实际工作情况填写，由所属班组长审批。</Notice>
      {projects === null && error === null ? (
        <StateView title="加载中…" />
      ) : null}
      {projects?.length === 0 ? (
        <StateView title="还没有加入项目" sub="请先联系管理员分配项目。" />
      ) : null}
      {(projects ?? []).map((project) => (
        <ListItem
          key={project.projectId}
          primary={project.projectName}
          secondary={project.teamName ?? "未分配班组"}
          chip={projectId === project.projectId ? "已选择" : undefined}
          onClick={() => {
            if (!busy) setProjectId(project.projectId);
          }}
        />
      ))}
      {projectId ? (
        <View>
          {plan && !plan.isWorkday ? <Notice>当天没有安排打卡，不能申请补卡。</Notice> : null}
          <Section title="补卡时段">
            <Segmented
              options={(plan?.points ?? []).map((row) => ({ label: row.label, value: row.code }))}
              value={point}
              onChange={selectPoint}
            />
          </Section>
          <View className="form-card">
            <Picker
              disabled={busy ? true : undefined}
              mode="date"
              value={date}
              end={chinaToday()}
              onChange={(event) => {
                setDate(event.detail.value);
              }}
            >
              <ListItem primary="补卡日期" secondary={date} />
            </Picker>
            <Picker
              disabled={busy ? true : undefined}
              mode="time"
              value={time}
              onChange={(event) => {
                setTime(event.detail.value);
              }}
            >
              <ListItem primary="实际打卡时间" secondary={time} />
            </Picker>
          </View>
          <Section
            title="补卡原因"
            sub="请描述漏打卡的实际情况，便于班组长审批"
          >
            <Textarea
              className="reason-textarea"
              value={reason}
              disabled={busy ? true : undefined}
              maxlength={500}
              placeholder="例如：上午在现场搬运材料，未及时完成打卡。"
              onInput={(event) => {
                setReason(event.detail.value);
              }}
            />
            <View className="text-count">{reason.length} / 500</View>
          </Section>
          <Button
            loading={busy}
            disabled={!plan?.isWorkday || !point || reason.trim().length === 0}
            onClick={() => {
              void submit();
            }}
          >
            提交补卡申请
          </Button>
        </View>
      ) : null}
      {error ? <Notice>{error}</Notice> : null}
    </Screen>
  );
}
