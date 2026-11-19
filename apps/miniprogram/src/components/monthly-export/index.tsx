import { View } from "@tarojs/components";
import { useEffect, useState } from "react";

import { FRONTEND_DEMO } from "../../config/env";
import { errorMessage } from "../../services/error-messages";
import {
  fetchReportExports,
  openReportExport,
  requestReportExport,
  type ExportScope,
  type ReportExport,
} from "../../services/report-exports";
import { chinaMonth } from "../../services/time";
import { workTimestamp } from "../team-work-fields";
import {
  BottomBar,
  Button,
  Links,
  Notice,
  PRESS,
  Row,
  SectionTitle,
  Sheet,
  SkeletonRows,
  type StatusKind,
} from "../ui/index";

import "./index.scss";

type Props = {
  readonly scope: ExportScope;
  readonly scopeId: string;
  readonly month: string;
};
const STATUS: Readonly<
  Record<
    Exclude<ReportExport["status"], "COMPLETED">,
    { readonly kind: StatusKind; readonly text: string }
  >
> = {
  PENDING: { kind: "warn", text: "排队中" },
  PROCESSING: { kind: "warn", text: "生成中" },
  FAILED: { kind: "bad", text: "生成失败" },
};

/**
 * 月度 Excel：生成过的版本一行一个，能再下载；生成是这一屏底部的主按钮。
 * 只放在月报里，所在的那一屏不能再有别的黑色实心按钮。
 */
export const MonthlyExport = ({
  scope,
  scopeId,
  month,
}: Props): JSX.Element => {
  const [jobs, setJobs] = useState<readonly ReportExport[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  // 读到之前不知道有没有生成过，先放骨架；默认只显示最新一版。
  const [loaded, setLoaded] = useState(false);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    if (FRONTEND_DEMO) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    setJobs([]);
    setError(null);
    setLoaded(false);
    const load = async (): Promise<void> => {
      try {
        const result = await fetchReportExports({ scope, scopeId, month });
        if (cancelled) return;
        setJobs(result);
        setLoaded(true);
        if (
          result.some(
            (job) => job.status === "PENDING" || job.status === "PROCESSING",
          )
        )
          timer = setTimeout(() => {
            void load();
          }, 3000);
      } catch (cause: unknown) {
        if (!cancelled) setError(errorMessage(cause, "导出任务加载失败。"));
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
      setError(errorMessage(cause, "创建导出失败。"));
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
      setError(errorMessage(cause, "文件打开失败，请重试。"));
    } finally {
      setBusy(false);
    }
  };
  if (FRONTEND_DEMO)
    return (
      <>
        <SectionTitle>月度 Excel</SectionTitle>
        <Notice>演示版不能导出 Excel，正式版里才有。</Notice>
      </>
    );
  const pending = jobs.some(
    (job) => job.status === "PENDING" || job.status === "PROCESSING",
  );
  const future = month > chinaMonth();
  const shown = showAll ? jobs : jobs.slice(0, 1);
  return (
    <>
      <SectionTitle
        action={
          jobs.length > 1
            ? showAll
              ? "只看最新一版"
              : `全部 ${jobs.length} 版`
            : undefined
        }
        onAction={() => setShowAll((value) => !value)}
      >
        月度 Excel
      </SectionTitle>
      {jobs.length > 0 ? (
        <Sheet>
          {shown.map((job) => (
            <Row
              key={job.id}
              title={`${job.month} 第 ${job.version} 版`}
              sub={`${workTimestamp(job.createdAt)} ${job.status === "COMPLETED" ? "生成" : "提交"}`}
              status={
                job.status === "COMPLETED" ? undefined : STATUS[job.status]
              }
            >
              {job.status === "COMPLETED" ? (
                <View
                  className={`monthly-export__link ui-press${busy ? " monthly-export__link--off" : ""}`}
                  {...PRESS}
                  onClick={() => {
                    void download(job);
                  }}
                >
                  下载并打开
                </View>
              ) : null}
            </Row>
          ))}
        </Sheet>
      ) : error === null && !loaded ? (
        <SkeletonRows rows={1} />
      ) : null}
      {shown
        .filter((job) => job.status === "FAILED")
        .map((job) => (
          <Notice key={job.id} tone="error">
            第 {job.version} 版没有生成出来
            <View className="ui-notice__sub">
              {job.errorMessage} 任务编号：{job.id}
            </View>
          </Notice>
        ))}
      <Notice>
        {future
          ? "这个月还没到，不能生成。"
          : `${jobs.length === 0 && loaded ? "这个月还没有生成过。" : ""}${
              month === chinaMonth()
                ? "本月的报表只算到生成的那一刻。"
                : "生成后可以打开，也可以转发。"
            }补卡通过后要重新生成。${
              jobs.length > 0 ? "这个月最近 20 次导出都留着。" : ""
            }`}
      </Notice>
      {error !== null ? (
        <>
          <Notice tone="error">{error}</Notice>
          <Links>
            <Button variant="text" onClick={() => setRevision((n) => n + 1)}>
              重新读取
            </Button>
          </Links>
        </>
      ) : null}
      <BottomBar
        primary={
          busy
            ? "处理中…"
            : pending
              ? "正在生成…"
              : jobs.length > 0
                ? "重新生成 Excel"
                : "生成 Excel"
        }
        busy={busy}
        disabled={pending || future}
        onPrimary={() => {
          void generate();
        }}
      />
    </>
  );
};
