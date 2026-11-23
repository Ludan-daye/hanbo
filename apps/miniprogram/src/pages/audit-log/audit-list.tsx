import { Picker, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import type { AuditCategory } from "@construction/domain";

import {
  Button,
  FormRow,
  Notice,
  PRESS,
  Sheet,
  SkeletonRows,
  StateView,
} from "../../components/ui/index";
import {
  NO_NARROW,
  fetchAuditLog,
  type AuditLogEntry,
  type AuditLogNarrow,
  type AuditLogScope,
} from "../../services/audit-log";
import { errorMessage, isUserCancel } from "../../services/error-messages";
import { chinaToday } from "../../services/time";
import { fetchAccounts, fetchCompanies } from "../../services/workflows";

import {
  auditEntryMeta,
  auditEntryNarrowing,
  auditTypeOptions,
  narrowOptions,
  type PickOption,
} from "./audit-view";
import "./audit-list.scss";

type Named = { readonly id: string; readonly name: string };

/**
 * 平台日志的公司、操作人选项：公司读第一页，操作人列出超级管理员（Q8：平台的人看过谁的
 * 资料）。读不到只少几个选项，“全部”和点记录筛选照样能用。
 */
const usePlatformChoices = (
  enabled: boolean,
): { readonly companies: readonly Named[]; readonly admins: readonly Named[] } => {
  const [companies, setCompanies] = useState<readonly Named[]>([]);
  const [admins, setAdmins] = useState<readonly Named[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetchCompanies({ search: "", status: null, cursor: null }).then(
      (page) => {
        if (!cancelled) setCompanies(page.items.map((row) => ({ id: row.id, name: row.name })));
      },
      () => undefined,
    );
    fetchAccounts({ search: "", status: null, cursor: null, role: "SYSTEM_ADMIN" }).then(
      (page) => {
        if (!cancelled) setAdmins(page.items.map((row) => ({ id: row.userId, name: row.displayName })));
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return { companies, admins };
};

const Choice = <T,>({
  label,
  options,
  value,
  onChange,
}: {
  readonly label: string;
  readonly options: readonly PickOption<T>[];
  readonly value: T | null;
  readonly onChange: (value: T | null, label: string) => void;
}): JSX.Element => {
  const index = Math.max(
    0,
    options.findIndex((item) => item.value === value),
  );
  return (
    <View className="audit-log__pick">
      <Picker
        mode="selector"
        range={options.map((item) => item.label)}
        value={index}
        onChange={(event) => {
          const picked = options[Number(event.detail.value)];
          onChange(picked?.value ?? null, picked?.label ?? "");
        }}
      >
        <FormRow label={label} value={options[index]?.label ?? ""} chevron />
      </Picker>
    </View>
  );
};

/**
 * 操作记录的列表：项目、公司的操作记录页和平台管理的“日志”标签共用。只读，新的在前，
 * 一次读 30 条。平台日志另外能按公司、操作人筛，点一条也能只看这个人或这家公司的。
 */
export const AuditLogList = ({
  scope,
  revision,
  onRetry,
}: {
  readonly scope: AuditLogScope;
  /** 外面下拉刷新、点“重试”时加一，整份重读。 */
  readonly revision: number;
  readonly onRetry: () => void;
}): JSX.Element => {
  const platform = scope.kind === "PLATFORM";
  const scopeKey = scope.kind === "PLATFORM" ? "PLATFORM" : `${scope.kind}:${scope.id}`;
  const [type, setType] = useState<AuditCategory | null>(null);
  const [narrow, setNarrow] = useState<AuditLogNarrow>(NO_NARROW);
  // 选中的公司、人叫什么：点记录选中的可能不在选项名单里。
  const [picked, setPicked] = useState<{
    readonly companyId: Named | null;
    readonly actorUserId: Named | null;
  }>({ actorUserId: null, companyId: null });
  const [items, setItems] = useState<readonly AuditLogEntry[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const choices = usePlatformChoices(platform);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setCursor(null);
    setLoadError(null);
    setMoreError(null);
    fetchAuditLog(scope, type, null, narrow).then(
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
    // scope 每次渲染都是新对象；按它的内容重读。
  }, [scopeKey, type, narrow.companyId, narrow.actorUserId, revision]);

  const loadMore = async (): Promise<void> => {
    if (cursor === null || loadingMore) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await fetchAuditLog(scope, type, cursor, narrow);
      setItems((current) => [...(current ?? []), ...page.items]);
      setCursor(page.nextCursor);
    } catch (cause: unknown) {
      setMoreError(errorMessage(cause, "没读到更多，请重试"));
    } finally {
      setLoadingMore(false);
    }
  };

  const narrowTo = (field: keyof AuditLogNarrow, value: Named | null): void => {
    setNarrow((current) => ({ ...current, [field]: value?.id ?? null }));
    setPicked((current) => ({ ...current, [field]: value }));
  };

  const openEntry = async (entry: AuditLogEntry): Promise<void> => {
    const options = auditEntryNarrowing(entry, narrow);
    if (options.length === 0) return;
    try {
      const { tapIndex } = await Taro.showActionSheet({ itemList: options.map((item) => item.label) });
      const option = options[tapIndex];
      if (option !== undefined) narrowTo(option.field, { id: option.id, name: option.name });
    } catch (cause: unknown) {
      if (!isUserCancel(cause)) throw cause;
    }
  };

  const types = auditTypeOptions(scope.kind);
  const filtered = type !== null || narrow.companyId !== null || narrow.actorUserId !== null;
  // 平台日志还没按人、按公司筛时，提示可以点记录来筛。
  const hint = platform && narrow.companyId === null && narrow.actorUserId === null;
  const today = chinaToday();
  return (
    <>
      <Sheet gap>
        {platform ? (
          <Choice<string>
            label="公司"
            options={narrowOptions("全部公司", choices.companies, picked.companyId)}
            value={narrow.companyId}
            onChange={(value, label) => narrowTo("companyId", value === null ? null : { id: value, name: label })}
          />
        ) : null}
        <Choice<AuditCategory> label="类型" options={types} value={type} onChange={(value) => setType(value)} />
        {platform ? (
          <Choice<string>
            label="操作人"
            options={narrowOptions("所有人", choices.admins, picked.actorUserId)}
            value={narrow.actorUserId}
            onChange={(value, label) => narrowTo("actorUserId", value === null ? null : { id: value, name: label })}
          />
        ) : null}
      </Sheet>
      {items === null ? (
        loadError !== null ? (
          <StateView kind="error" title="操作记录没读到" sub={loadError} onRetry={onRetry} />
        ) : (
          <SkeletonRows rows={5} gap />
        )
      ) : items.length === 0 ? (
        platform ? (
          <StateView
            kind="empty"
            title={filtered ? "没有符合条件的记录" : "还没有操作记录"}
            sub={filtered ? "换个公司、类型或操作人看看。" : "有人新增、修改或审批了东西，会记在这里。"}
          />
        ) : (
          <StateView
            kind="empty"
            title={type === null ? "还没有操作记录" : "没有这一类操作"}
            sub="2026年11月20日以后的操作才按项目记录。"
          />
        )
      ) : (
        <>
          <Sheet gap>
            {items.map((item) => (
              <View
                key={item.id}
                className={`audit-log__item${platform ? " ui-press" : ""}`}
                {...(platform ? PRESS : {})}
                onClick={
                  platform
                    ? () => {
                        void openEntry(item);
                      }
                    : undefined
                }
              >
                <View className="audit-log__text">{item.sentence}</View>
                <View className="audit-log__meta">{auditEntryMeta(item, scope.kind, today)}</View>
              </View>
            ))}
          </Sheet>
          {moreError !== null ? <Notice tone="error">{moreError}</Notice> : null}
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
          ) : null}
          {cursor === null || hint ? (
            <Notice>
              {[cursor === null ? "没有更早的记录了。" : "", hint ? "点一条记录，可以只看这个人或这家公司的。" : ""].join("")}
            </Notice>
          ) : null}
        </>
      )}
    </>
  );
};
