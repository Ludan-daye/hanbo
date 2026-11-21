import { Picker } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";

import {
  Button,
  Card,
  CardActions,
  CardMeta,
  CardTitle,
  FormRow,
  Notice,
  PageHeader,
  Screen,
  Segmented,
  Sheet,
  StateView,
} from "../../components/ui/index";
import { useManagedCompanyId } from "../../hooks/use-management-scope";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { errorMessage } from "../../services/error-messages";
import { fetchCompanyProjects } from "../../services/management";
import type { CompanyProject } from "../../services/management.types";
import {
  fetchCompanyTransfers,
  reviewTransfer,
  transferStatusLabel,
  type TransferRequest,
} from "../../services/transfers";
import { useSession } from "../../store/session";

import { transferModeText, transferPost, transferRoute, transferWho } from "./transfer-view";

type Tab = "PENDING" | "DONE";

/**
 * 调人申请：项目管理员想用本公司别的项目的人，公司管理员在这里同意或不同意。
 * 同意后，这个人沿用原档案和微信绑定加入申请的项目，原项目的记录保留。
 */
export default function TransferApprovals(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const companyId = useManagedCompanyId(state.me);
  const { revision, refresh } = usePageRefresh();
  const [tab, setTab] = useState<Tab>("PENDING");
  const [rows, setRows] = useState<readonly TransferRequest[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  // 按调出或调入的项目筛选；项目列表读不到时只是不出筛选，不影响看申请。
  const [projects, setProjects] = useState<readonly CompanyProject[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    void fetchCompanyProjects(companyId).then(
      (value) => {
        if (!cancelled) setProjects(value);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [companyId, revision]);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{
    readonly id: string;
    readonly text: string;
  } | null>(null);
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    setRows(null);
    setNextCursor(null);
    setLoadError(null);
    setPageError(null);
    void fetchCompanyTransfers(companyId, tab, { projectId }).then(
      (page) => {
        if (!cancelled) {
          setRows(page.items);
          setNextCursor(page.nextCursor);
        }
      },
      (cause: unknown) => {
        if (!cancelled) setLoadError(errorMessage(cause, "调人申请没读到"));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [companyId, tab, projectId, revision]);

  const loadMore = async (): Promise<void> => {
    if (!companyId || nextCursor === null || busy !== null) return;
    setBusy("page");
    setPageError(null);
    try {
      const page = await fetchCompanyTransfers(companyId, tab, {
        cursor: nextCursor,
        projectId,
      });
      setRows((current) => [...(current ?? []), ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (cause: unknown) {
      setPageError(errorMessage(cause, "下一页没读到"));
    } finally {
      setBusy(null);
    }
  };
  const projectNames = ["全部项目", ...projects.map((row) => row.name)];
  const projectIndex =
    projectId === null
      ? 0
      : projects.findIndex((row) => row.id === projectId) + 1;

  const decide = async (
    row: TransferRequest,
    decision: "approve" | "reject",
  ): Promise<void> => {
    if (!companyId || busy !== null) return;
    const answer = await Taro.showModal(
      decision === "approve"
        ? {
            title: "同意调人",
            content:
              row.mode === "MOVE"
                ? `${row.displayName ?? "他"}会加入${row.targetProjectName}，${row.sourceProjectName}在进场前一天办退场；原项目的考勤记录保留。`
                : `${row.displayName ?? "他"}会加入${row.targetProjectName}，${row.sourceProjectName}的身份照旧（兼任）。`,
            confirmText: "同意",
          }
        : {
            title: "不同意",
            content: `${row.displayName ?? "他"}留在原项目，申请会显示为未同意。`,
            confirmText: "不同意",
            confirmColor: "#D7261E",
          },
    );
    if (!answer.confirm) return;
    setBusy(row.id);
    setActionError(null);
    try {
      await reviewTransfer(companyId, row.id, decision, null);
      setRows((current) => (current ?? []).filter((item) => item.id !== row.id));
      await Taro.showToast({
        icon: "success",
        title: decision === "approve" ? "已调入" : "已处理",
      });
    } catch (cause: unknown) {
      setActionError({ id: row.id, text: errorMessage(cause, "没有办成，请重试") });
    } finally {
      setBusy(null);
    }
  };

  const header = <PageHeader title="调人申请" />;
  if (!companyId)
    return (
      <Screen header={header}>
        <StateView kind="empty" title="请从公司工作台进入" />
      </Screen>
    );
  return (
    <Screen header={header}>
      <Segmented<Tab>
        options={[
          {
            value: "PENDING",
            label:
              tab === "PENDING" && rows !== null && rows.length > 0
                ? `待处理 ${rows.length}${nextCursor !== null ? "+" : ""}`
                : "待处理",
          },
          { value: "DONE", label: "已处理" },
        ]}
        value={tab}
        onChange={(value) => {
          if (busy === null) setTab(value);
        }}
      />
      {projects.length > 1 ? (
        <Picker
          mode="selector"
          range={projectNames}
          value={projectIndex}
          onChange={(event) => {
            const index = Number(event.detail.value);
            setProjectId(index === 0 ? null : (projects[index - 1]?.id ?? null));
          }}
        >
          <Sheet gap>
            <FormRow label="项目" value={projectNames[projectIndex] ?? "全部项目"} chevron />
          </Sheet>
        </Picker>
      ) : null}
      {rows === null ? (
        loadError ? (
          <StateView title="调人申请没读到" sub={loadError} onRetry={refresh} />
        ) : (
          <StateView title="正在读取调人申请" />
        )
      ) : rows.length === 0 ? (
        <StateView
          kind="empty"
          title={tab === "PENDING" ? "没有等你处理的申请" : "还没有处理过的申请"}
          sub={projectId === null ? undefined : "这是筛选后的结果，换成“全部项目”看其他的。"}
        />
      ) : (
        rows.map((row, index) => (
          <Card key={row.id} gap>
            <CardTitle status={transferStatusLabel(row.status)}>
              {row.displayName ?? "姓名待补录"}
            </CardTitle>
            <CardMeta>{transferRoute(row)}</CardMeta>
            <CardMeta>{transferPost(row)}</CardMeta>
            <CardMeta>{transferModeText(row)}</CardMeta>
            <CardMeta>{transferWho(row)}</CardMeta>
            {row.reviewReason ? <CardMeta>{`原因：${row.reviewReason}`}</CardMeta> : null}
            {actionError?.id === row.id ? (
              <Notice tone="error">{actionError.text}</Notice>
            ) : null}
            {row.status === "PENDING" ? (
              <CardActions>
                {/* 一屏只有一个黑按钮：排在最前面的那条。 */}
                <Button
                  variant={index === 0 ? undefined : "outline"}
                  loading={busy === row.id}
                  disabled={busy !== null}
                  onClick={() => void decide(row, "approve")}
                >
                  {busy === row.id ? "处理中…" : "同意"}
                </Button>
                <Button
                  variant="text"
                  disabled={busy !== null}
                  onClick={() => void decide(row, "reject")}
                >
                  不同意
                </Button>
              </CardActions>
            ) : null}
          </Card>
        ))
      )}
      {pageError ? <Notice tone="error">{pageError}</Notice> : null}
      {rows !== null && nextCursor !== null ? (
        <Button
          variant="outline"
          wide
          loading={busy === "page"}
          disabled={busy !== null && busy !== "page"}
          onClick={() => void loadMore()}
        >
          {busy === "page" ? "加载中…" : "加载更多"}
        </Button>
      ) : null}
    </Screen>
  );
}
