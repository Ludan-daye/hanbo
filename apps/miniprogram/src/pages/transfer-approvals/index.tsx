import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";

import {
  Button,
  Card,
  CardActions,
  CardMeta,
  CardTitle,
  Notice,
  PageHeader,
  Screen,
  Segmented,
  StateView,
} from "../../components/ui/index";
import { useManagedCompanyId } from "../../hooks/use-management-scope";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { errorMessage } from "../../services/error-messages";
import {
  fetchCompanyTransfers,
  reviewTransfer,
  transferStatusLabel,
  type TransferRequest,
} from "../../services/transfers";
import { useSession } from "../../store/session";

import { transferPost, transferRoute, transferWho } from "./transfer-view";

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{
    readonly id: string;
    readonly text: string;
  } | null>(null);
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    setRows(null);
    setLoadError(null);
    void fetchCompanyTransfers(companyId, tab).then(
      (value) => {
        if (!cancelled) setRows(value);
      },
      (cause: unknown) => {
        if (!cancelled) setLoadError(errorMessage(cause, "调人申请没读到"));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [companyId, tab, revision]);

  const decide = async (
    row: TransferRequest,
    decision: "approve" | "reject",
  ): Promise<void> => {
    if (!companyId || busy !== null) return;
    const answer = await Taro.showModal(
      decision === "approve"
        ? {
            title: "同意调人",
            content: `${row.displayName ?? "他"}会加入${row.targetProjectName}，原项目的记录保留。`,
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
                ? `待处理 ${rows.length}`
                : "待处理",
          },
          { value: "DONE", label: "已处理" },
        ]}
        value={tab}
        onChange={setTab}
      />
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
        />
      ) : (
        rows.map((row, index) => (
          <Card key={row.id} gap>
            <CardTitle status={transferStatusLabel(row.status)}>
              {row.displayName ?? "姓名待补录"}
            </CardTitle>
            <CardMeta>{transferRoute(row)}</CardMeta>
            <CardMeta>{transferPost(row)}</CardMeta>
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
    </Screen>
  );
}
