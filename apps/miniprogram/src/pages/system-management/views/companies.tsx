import { useEffect, useState } from "react";

import {
  BottomBar,
  Button,
  Chips,
  FormInput,
  Notice,
  Row,
  SearchField,
  Sheet,
  SkeletonRows,
  StateView,
} from "../../../components/ui";
import { errorMessage } from "../../../services/error-messages";
import {
  fetchCompanies,
  type PlatformCompany,
} from "../../../services/workflows";
import {
  companyRowStatus,
  companyRowSub,
  type CompanyDraft,
  type CompanyFilter,
} from "../system-view";

// 后两项和平台首页的“等你处理”同口径：只看正常的公司（暂停的公司不催）。
const COMPANY_FILTERS: ReadonlyArray<{ readonly value: CompanyFilter; readonly label: string }> = [
  { value: "ALL", label: "全部" },
  { value: "NONE", label: "没有管理员" },
  { value: "NOT_BOUND", label: "管理员没绑定" },
];

/** “公司”标签：一行一家，服务器上搜索、一次读 30 家。 */
export const CompaniesTab = ({
  revision,
  filter,
  onFilter,
  onOpen,
  onAdd,
  onRetry,
}: {
  /** 每次变了就从头再读（保存后、点重试）。 */
  readonly revision: number;
  /** 筛选放在页面上，点开一家公司再返回时还在。 */
  readonly filter: CompanyFilter;
  readonly onFilter: (filter: CompanyFilter) => void;
  readonly onOpen: (company: PlatformCompany) => void;
  readonly onAdd: () => void;
  readonly onRetry: () => void;
}): JSX.Element => {
  const admin = filter === "ALL" ? null : filter;
  const status = admin === null ? null : ("ACTIVE" as const);
  const [search, setSearch] = useState<string>("");
  const [query, setQuery] = useState<string>("");
  const [items, setItems] = useState<readonly PlatformCompany[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);

  // 停下输入半秒再查，免得每敲一个字发一次请求。
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 500);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setLoadError(null);
    setMoreError(null);
    fetchCompanies({ admin, search: query, status, cursor: null }).then(
      (page) => {
        if (cancelled) return;
        setItems(page.items);
        setCursor(page.nextCursor);
      },
      (cause: unknown) => {
        if (!cancelled) setLoadError(errorMessage(cause, "公司列表没读到"));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [query, admin, revision]);

  const loadMore = async (): Promise<void> => {
    if (cursor === null || loadingMore) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await fetchCompanies({ admin, search: query, status, cursor });
      setItems((current) => [...(current ?? []), ...page.items]);
      setCursor(page.nextCursor);
    } catch (cause: unknown) {
      setMoreError(errorMessage(cause, "没读到更多，请重试"));
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <>
      <SearchField
        value={search}
        placeholder="搜索公司名称、简称或信用代码"
        onInput={setSearch}
      />
      <Chips<CompanyFilter> options={COMPANY_FILTERS} selected={[filter]} onToggle={onFilter} />
      {loadError !== null ? (
        <StateView
          kind="error"
          title="公司列表没读到"
          sub={loadError}
          onRetry={onRetry}
        />
      ) : items === null ? (
        <SkeletonRows rows={4} gap />
      ) : items.length === 0 ? (
        admin !== null && query === "" ? (
          <StateView
            kind="empty"
            title={admin === "NONE" ? "每家公司都有管理员" : "公司管理员都绑定了微信"}
            sub="这里只看状态正常的公司。"
          />
        ) : query === "" ? (
          <StateView
            kind="empty"
            title="还没有公司"
            sub="点下面的“新增公司”添加第一家。"
          />
        ) : (
          <StateView
            kind="empty"
            title="没有找到公司"
            sub="换个名称或信用代码试试。"
          />
        )
      ) : (
        <>
          <Sheet gap>
            {items.map((company) => (
              <Row
                key={company.id}
                title={company.name}
                sub={companyRowSub(company)}
                status={companyRowStatus(company)}
                hazard={company.admins.length === 0}
                chevron
                onClick={() => onOpen(company)}
              />
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
              {loadingMore ? "读取中…" : "再读 30 家"}
            </Button>
          ) : null}
        </>
      )}
      <BottomBar primary="新增公司" onPrimary={onAdd} />
    </>
  );
};

/** 公司资料的几个输入框：新增和修改共用。 */
export const CompanyFields = ({
  draft,
  busy,
  onChange,
}: {
  readonly draft: CompanyDraft;
  readonly busy: boolean;
  readonly onChange: (draft: CompanyDraft) => void;
}): JSX.Element => (
  <>
    <Sheet gap>
      <FormInput
        label="公司名称"
        required
        value={draft.name}
        placeholder="填完整的公司名称"
        maxLength={60}
        disabled={busy}
        onInput={(name) => onChange({ ...draft, name })}
      />
      <FormInput
        label="简称"
        value={draft.shortName}
        placeholder="可以不填"
        maxLength={20}
        disabled={busy}
        onInput={(shortName) => onChange({ ...draft, shortName })}
      />
      <FormInput
        label="信用代码"
        value={draft.creditCode}
        placeholder="18 位统一社会信用代码，可以不填"
        maxLength={18}
        disabled={busy}
        onInput={(creditCode) => onChange({ ...draft, creditCode })}
      />
    </Sheet>
    <Sheet gap>
      <FormInput
        label="联系人"
        value={draft.contactName}
        placeholder="可以不填"
        maxLength={30}
        disabled={busy}
        onInput={(contactName) => onChange({ ...draft, contactName })}
      />
      <FormInput
        label="联系电话"
        value={draft.contactPhone}
        placeholder="手机或座机，可以不填"
        maxLength={20}
        disabled={busy}
        onInput={(contactPhone) => onChange({ ...draft, contactPhone })}
      />
      <FormInput
        label="地址"
        value={draft.address}
        placeholder="可以不填"
        maxLength={120}
        disabled={busy}
        onInput={(address) => onChange({ ...draft, address })}
      />
    </Sheet>
  </>
);

/** 新增公司：名称必填，其余以后也能补。 */
export const NewCompanyView = ({
  draft,
  busy,
  problem,
  onChange,
  onCreate,
}: {
  readonly draft: CompanyDraft;
  readonly busy: boolean;
  readonly problem: string | null;
  readonly onChange: (draft: CompanyDraft) => void;
  readonly onCreate: () => void;
}): JSX.Element => (
  <>
    <CompanyFields draft={draft} busy={busy} onChange={onChange} />
    <Notice>
      名称不能和已有的公司重名；信用代码填了就不能重复。建好后再任命公司管理员。
    </Notice>
    {problem !== null ? <Notice tone="error">{problem}</Notice> : null}
    <BottomBar
      primary={busy ? "创建中…" : "创建公司"}
      busy={busy}
      disabled={!draft.name.trim()}
      onPrimary={onCreate}
    />
  </>
);
