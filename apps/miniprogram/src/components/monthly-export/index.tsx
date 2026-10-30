import { View } from "@tarojs/components";
import { useEffect, useState } from "react";
import { Button, ListItem, Notice } from "../ui/index";
import { FRONTEND_DEMO } from "../../config/env";
import {
  fetchReportExports,
  openReportExport,
  requestReportExport,
  type ExportScope,
  type ReportExport,
} from "../../services/report-exports";
import { chinaMonth, formatChinaHm } from "../../services/time";

type Props = {
  readonly scope: ExportScope;
  readonly scopeId: string;
  readonly month: string;
};
const STATUS: Readonly<Record<ReportExport["status"], string>> = {
  PENDING: "排队中",
  PROCESSING: "生成中",
  COMPLETED: "可下载",
  FAILED: "生成失败",
};
export const MonthlyExport = ({
  scope,
  scopeId,
  month,
}: Props): JSX.Element => {
  const [jobs, setJobs] = useState<readonly ReportExport[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (FRONTEND_DEMO) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    setJobs([]);
    setError(null);
    const load = async (): Promise<void> => {
      try {
        const result = await fetchReportExports({ scope, scopeId, month });
        if (cancelled) return;
        setJobs(result);
        if (
          result.some(
            (job) => job.status === "PENDING" || job.status === "PROCESSING",
          )
        )
          timer = setTimeout(() => {
            void load();
          }, 3000);
      } catch (cause: unknown) {
        if (!cancelled)
          setError(
            cause instanceof Error ? cause.message : "导出任务加载失败。",
          );
      }
    };
    void load();
    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, [scope, scopeId, month, revision]);
  const generate = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await requestReportExport({ scope, scopeId, month });
      setRevision((n) => n + 1);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "创建导出失败。");
    } finally {
      setBusy(false);
    }
  };
  const download = async (job: ReportExport): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await openReportExport(job);
    } catch (cause: unknown) {
      setError(
        cause instanceof Error ? cause.message : "文件打开失败，请重试。",
      );
    } finally {
      setBusy(false);
    }
  };
  if (FRONTEND_DEMO)
    return (
      <Notice>
        月度 Excel
        包含汇总、每日明细、补卡异常和统计说明。演示数据不导出，请在正式数据模式中使用。
      </Notice>
    );
  const pending = jobs.some(
    (job) => job.status === "PENDING" || job.status === "PROCESSING",
  );
  return (
    <View className="form-card">
      <Button
        loading={busy}
        disabled={busy || pending || month > chinaMonth()}
        onClick={() => {
          void generate();
        }}
      >
        {pending
          ? "报表正在生成"
          : jobs.length > 0
            ? "重新生成 Excel"
            : "生成月度 Excel"}
      </Button>
      <Notice>
        {month === chinaMonth()
          ? "本月尚未结束，按生成时的数据统计。"
          : "生成后可打开或转发 Excel。"}{" "}
        调整补卡后请重新生成。
      </Notice>
      {error !== null ? (
        <View>
          <Notice>{error}</Notice>
          <Button variant="outline" onClick={() => setRevision((n) => n + 1)}>
            刷新任务
          </Button>
        </View>
      ) : null}
      {jobs.map((job) => (
        <View key={job.id}>
          <ListItem
            primary={`${job.month} · 第 ${job.version} 版`}
            secondary={`${STATUS[job.status]} · ${formatChinaHm(job.createdAt)}`}
            chip={STATUS[job.status]}
          />
          {job.status === "COMPLETED" ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                void download(job);
              }}
            >
              下载并打开
            </Button>
          ) : null}
          {job.status === "FAILED" ? (
            <Notice>
              {job.errorMessage} 任务编号：{job.id}
            </Notice>
          ) : null}
        </View>
      ))}
      {jobs.length > 0 ? (
        <Notice>显示本人当前月份最近 20 次导出，旧版本保持不变。</Notice>
      ) : null}
    </View>
  );
};
