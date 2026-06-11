import { Picker, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";

import { Button, Field, ListItem, PageHeader, Screen, Segmented, StateView } from "../../components/ui/index";
import { fetchMyProjects, submitMakeup } from "../../services/me";
import type { AttendancePointCode, MyProjectMembership } from "../../services/me.types";

const POINT_OPTIONS: ReadonlyArray<{ label: string; value: AttendancePointCode }> = [
  { label: "上午上班", value: "SEGMENT_1_START" },
  { label: "上午下班", value: "SEGMENT_1_END" },
  { label: "下午上班", value: "SEGMENT_2_START" },
  { label: "下午下班", value: "SEGMENT_2_END" }
];

const pad = (n: number): string => String(n).padStart(2, "0");
const todayDate = (): string => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

export default function SubmitMakeup(): JSX.Element {
  const [projects, setProjects] = useState<ReadonlyArray<MyProjectMembership> | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [date, setDate] = useState<string>(todayDate());
  const [time, setTime] = useState<string>("09:00");
  const [point, setPoint] = useState<AttendancePointCode>("SEGMENT_1_START");
  const [reason, setReason] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await fetchMyProjects();
        if (!cancelled) {
          setProjects(rows);
          if (rows.length > 0) {
            setProjectId(rows[0].projectId);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "REQUEST_FAILED");
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const submit = async (): Promise<void> => {
    if (projectId === null || reason.trim().length === 0 || busy) {
      if (reason.trim().length === 0) {
        await Taro.showToast({ icon: "none", title: "请填写理由" });
      }
      return;
    }
    setBusy(true);
    try {
      const requestedOccurredAt = `${date}T${time}:00+08:00`;
      await submitMakeup(projectId, {
        attendanceDate: date,
        pointCode: point,
        reason: reason.trim(),
        requestedOccurredAt
      });
      await Taro.showToast({ icon: "success", title: "已提交" });
      await Taro.redirectTo({ url: "/pages/my-makeups/index" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "REQUEST_FAILED";
      await Taro.showToast({ icon: "none", title: "提交失败" });
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <PageHeader title="提交补卡" />
      {projects === null && error === null ? <StateView title="加载中…" /> : null}
      {projects !== null && projects.length === 0 ? (
        <StateView title="尚未加入任何项目" sub="请等待管理员把你加入项目。" />
      ) : null}
      <View>
        {(projects ?? []).map((p) => (
          <ListItem
            key={p.projectId}
            primary={p.projectName}
            secondary={`${p.projectRoleLabel} · ${p.teamName ?? "无班组"}`}
            chip={p.projectId === projectId ? "已选" : undefined}
            onClick={() => { setProjectId(p.projectId); }}
          />
        ))}
      </View>
      {projectId !== null ? (
        <View>
          <Picker mode="date" value={date} onChange={(e) => setDate(String((e.detail as { value: string }).value))}>
            <ListItem primary={`日期 · ${date}`} secondary="点选其它日期" />
          </Picker>
          <Picker mode="time" value={time} onChange={(e) => setTime(String((e.detail as { value: string }).value))}>
            <ListItem primary={`时间 · ${time}`} secondary="点选时间" />
          </Picker>
          <Segmented options={POINT_OPTIONS} value={point} onChange={(v) => { setPoint(v); }} />
          <Field value={reason} placeholder="补卡理由(必填)" onInput={setReason} />
          <Button onClick={() => { void submit(); }}>{busy ? "提交中…" : "提交"}</Button>
          {error !== null ? <StateView title="错误" sub={error} /> : null}
        </View>
      ) : null}
    </Screen>
  );
}
