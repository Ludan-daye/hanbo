import { Picker, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import { AUDIT_CATEGORIES, type AuditCategory } from "@construction/domain";

import {
  Button,
  FormRow,
  Notice,
  PageHeader,
  Screen,
  Sheet,
  SkeletonRows,
  StateView,
} from "../../components/ui/index";
import {
  useManagedCompanyId,
  useManagedProjectId,
} from "../../hooks/use-management-scope";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSessionGuard } from "../../hooks/use-session-guard";
import {
  fetchAuditLog,
  type AuditLogEntry,
} from "../../services/audit-log";
import { errorMessage } from "../../services/error-messages";
import { chinaToday } from "../../services/time";
import { useSession } from "../../store/session";

import { auditLogScope, auditTimeLabel } from "./audit-view";
import "./index.scss";

const TYPES: ReadonlyArray<{
  readonly value: AuditCategory | null;
  readonly label: string;
}> = [{ value: null, label: "全部操作" }, ...AUDIT_CATEGORIES];

/**
 * 操作记录：项目管理员看本项目、公司管理员看本公司各项目里谁在什么时候做了什么。
 * 只读，新的在前，一次读 30 条。
 */
export default function AuditLog(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const params = Taro.useRouter().params;
  const projectId = useManagedProjectId(state.me);
  const companyId = useManagedCompanyId(state.me);
  const scope = auditLogScope({
    projectParam: params.projectId,
    companyParam: params.companyId,
    projectId,
    companyId,
  });
  const { revision, refresh } = usePageRefresh();
  const [type, setType] = useState<AuditCategory | null>(null);
  const [items, setItems] = useState<readonly AuditLogEntry[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const scopeKind = scope?.kind ?? null;
  const scopeId = scope?.id ?? null;

  useEffect(() => {
    if (scopeKind === null || scopeId === null) return;
    let cancelled = false;
    setItems(null);
    setCursor(null);
    setLoadError(null);
    setMoreError(null);
    fetchAuditLog({ kind: scopeKind, id: scopeId }, type, null).then(
      (page) => {
        if (cancelled) return;
        setItems(page.items);
        setCursor(page.nextCursor);
      },
      (cause: unknown) => {
        if (!cancelled) setLoadError(errorMessage(cause, "操作记录没读到"));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [scopeKind, scopeId, type, revision]);

  const loadMore = async (): Promise<void> => {
    if (scope === null || cursor === null || loadingMore) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await fetchAuditLog(scope, type, cursor);
      setItems((current) => [...(current ?? []), ...page.items]);
      setCursor(page.nextCursor);
    } catch (cause: unknown) {
      setMoreError(errorMessage(cause, "没读到更多，请重试"));
    } finally {
      setLoadingMore(false);
    }
  };

  const header = <PageHeader title="操作记录" />;
  if (scope === null)
    return (
      <Screen header={header}>
        <StateView
          kind="empty"
          title="没有可以看的项目"
          sub="项目管理员和公司管理员才能看操作记录。"
        />
      </Screen>
    );
  const typeIndex = Math.max(
    0,
    TYPES.findIndex((item) => item.value === type),
  );
  const today = chinaToday();
  return (
    <Screen header={header}>
      <Sheet gap>
        <View className="audit-log__pick">
          <Picker
            mode="selector"
            range={TYPES.map((item) => item.label)}
            value={typeIndex}
            onChange={(event) =>
              setType(TYPES[Number(event.detail.value)]?.value ?? null)
            }
          >
            <FormRow label="类型" value={TYPES[typeIndex].label} chevron />
          </Picker>
        </View>
      </Sheet>
      {items === null ? (
        loadError !== null ? (
          <StateView
            kind="error"
            title="操作记录没读到"
            sub={loadError}
            onRetry={refresh}
          />
        ) : (
          <SkeletonRows rows={5} gap />
        )
      ) : items.length === 0 ? (
        <StateView
          kind="empty"
          title={type === null ? "还没有操作记录" : "没有这一类操作"}
          sub="2026年11月20日以后的操作才按项目记录。"
        />
      ) : (
        <>
          <Sheet gap>
            {items.map((item) => (
              <View key={item.id} className="audit-log__item">
                <View className="audit-log__text">{item.sentence}</View>
                <View className="audit-log__meta">
                  {scope.kind === "COMPANY" && item.projectName
                    ? `${auditTimeLabel(item.createdAt, today)}，${item.projectName}`
                    : auditTimeLabel(item.createdAt, today)}
                </View>
              </View>
            ))}
          </Sheet>
          {moreError !== null ? (
            <Notice tone="error">{moreError}</Notice>
          ) : null}
          {cursor !== null ? (
            <Button
              variant="outline"
              wide
              loading={loadingMore}
              disabled={loadingMore}
              onClick={() => {
                void loadMore();
              }}
            >
              {loadingMore ? "读取中…" : "再读 30 条"}
            </Button>
          ) : (
            <Notice>没有更早的记录了。</Notice>
          )}
        </>
      )}
    </Screen>
  );
}
