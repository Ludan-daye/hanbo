import { Picker } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import { useSessionGuard } from "../../hooks/use-session-guard";

import {
  Button,
  Chips,
  FormRow,
  Notice,
  PageHeader,
  Row,
  Screen,
  SearchField,
  SectionTitle,
  Sheet,
  SkeletonRows,
  StateView,
} from "../../components/ui/index";
import { useManagedCompanyId } from "../../hooks/use-management-scope";
import {
  fetchCompanyPeoplePage,
  fetchCompanyProjects,
} from "../../services/management";
import type {
  CompanyPeopleItem,
  CompanyPeopleQuery,
  CompanyProject,
} from "../../services/management.types";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSession } from "../../store/session";
import { errorMessage } from "../../services/error-messages";
import { companyPersonLine } from "./person-row";

const PAGE_SIZE = 30;
type Filters = Omit<CompanyPeopleQuery, "page" | "pageSize" | "search">;
const ROLE_OPTIONS = [
  { value: "ALL", label: "全部身份" },
  { value: "WORKER", label: "工人" },
  { value: "TEAM_LEADER", label: "班组长" },
  { value: "PROJECT_ADMIN", label: "项目管理员" },
] as const;
const STATUS_OPTIONS = [
  { value: "ALL", label: "全部" },
  { value: "ACTIVE", label: "在场" },
  { value: "EXITED", label: "已退场" },
] as const;
const REGISTRATION_OPTIONS = [
  { value: "ALL", label: "不限" },
  { value: "NOT_SUBMITTED", label: "没填用工资料" },
  { value: "PENDING", label: "资料待核实" },
  { value: "NEEDS_UPDATE", label: "资料需更正" },
  { value: "VERIFIED", label: "已核实" },
] as const;
const FACE_OPTIONS = [
  { value: "ALL", label: "不限" },
  { value: "NONE", label: "没交底照" },
  { value: "PENDING", label: "底照待审" },
  { value: "REJECTED", label: "底照未通过" },
] as const;
const orNull = <T extends string>(value: T | "ALL"): T | null =>
  value === "ALL" ? null : value;

/**
 * 公司人员：一人一行（2026-11-21 Q8），写着在几个项目；分页加载，搜索和筛选在服务端做。
 * 点一个人看他在本公司的任职，再点项目进那个项目的人员资料。
 */
export default function CompanyPeople(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const { revision, refresh } = usePageRefresh();
  const companyId = useManagedCompanyId(state.me);
  const [typed, setTyped] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  // 从“各项目一览”点进来时带着筛选（项目、在场、资料待核实）。
  const params = Taro.useRouter().params;
  const [filters, setFilters] = useState<Filters>(() => ({
    ...(params.projectId ? { projectId: decodeURIComponent(params.projectId) } : {}),
    ...(params.status === "ACTIVE" || params.status === "EXITED" ? { status: params.status } : {}),
    ...(params.registrationStatus === "PENDING" ||
    params.registrationStatus === "NOT_SUBMITTED" ||
    params.registrationStatus === "NEEDS_UPDATE" ||
    params.registrationStatus === "VERIFIED"
      ? { registrationStatus: params.registrationStatus }
      : {}),
  }));
  const [filtering, setFiltering] = useState<boolean>(false);
  const [projects, setProjects] = useState<readonly CompanyProject[]>([]);
  const [items, setItems] = useState<readonly CompanyPeopleItem[] | null>(null);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);

  // 停手半秒再去服务端搜，免得每敲一个字读一次。
  useEffect(() => {
    const timer = setTimeout(() => setSearch(typed.trim()), 500);
    return () => clearTimeout(timer);
  }, [typed]);

  useEffect(() => {
    if (companyId === null) return;
    let cancelled = false;
    void fetchCompanyProjects(companyId).then(
      (rows) => {
        if (!cancelled) setProjects(rows);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [companyId, revision]);

  useEffect(() => {
    if (companyId === null) return;
    let cancelled = false;
    setError(null);
    setPageError(null);
    setItems(null);
    void fetchCompanyPeoplePage(companyId, { ...filters, page: 1, pageSize: PAGE_SIZE, search }).then(
      (result) => {
        if (cancelled) return;
        setItems(result.items);
        setTotal(result.total);
        setPage(1);
      },
      (cause: unknown) => {
        if (!cancelled) setError(errorMessage(cause, "请稍后重试。"));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [companyId, revision, search, filters]);

  const loadMore = async (): Promise<void> => {
    if (companyId === null || loadingMore) return;
    setLoadingMore(true);
    setPageError(null);
    try {
      const result = await fetchCompanyPeoplePage(companyId, { ...filters, page: page + 1, pageSize: PAGE_SIZE, search });
      setItems((rows) => [...(rows ?? []), ...result.items]);
      setTotal(result.total);
      setPage(page + 1);
    } catch (cause: unknown) {
      setPageError(errorMessage(cause, "下一页没读到"));
    } finally {
      setLoadingMore(false);
    }
  };

  if (companyId === null) {
    return (
      <Screen header={<PageHeader title="公司人员" />}>
        <StateView kind="empty" title="没有公司管理权限" sub="这个账号不是公司管理员。" />
      </Screen>
    );
  }

  const projectNames = ["全部项目", ...projects.map((row) => row.name)];
  const projectIndex =
    filters.projectId == null ? 0 : projects.findIndex((row) => row.id === filters.projectId) + 1;
  const activeFilters = [
    filters.projectId ? projectNames[projectIndex] : null,
    filters.permissionRole ? ROLE_OPTIONS.find((row) => row.value === filters.permissionRole)?.label : null,
    filters.status ? STATUS_OPTIONS.find((row) => row.value === filters.status)?.label : null,
    filters.registrationStatus ? REGISTRATION_OPTIONS.find((row) => row.value === filters.registrationStatus)?.label : null,
    filters.faceStatus ? FACE_OPTIONS.find((row) => row.value === filters.faceStatus)?.label : null,
  ].filter((text): text is string => typeof text === "string");

  return (
    <Screen header={<PageHeader title="公司人员" />}>
      <SearchField
        value={typed}
        placeholder="搜索姓名或手机号"
        onInput={setTyped}
      />
      <Sheet gap>
        <Row
          title="筛选"
          value={activeFilters.length === 0 ? "全部人员" : activeFilters.join("、")}
          chevron
          onClick={() => setFiltering(!filtering)}
        />
      </Sheet>
      {filtering ? (
        <>
          <Picker
            mode="selector"
            range={projectNames}
            value={projectIndex}
            onChange={(event) => {
              const index = Number(event.detail.value);
              setFilters({ ...filters, projectId: index === 0 ? null : (projects[index - 1]?.id ?? null) });
            }}
          >
            <Sheet gap>
              <FormRow label="项目" value={projectNames[projectIndex] ?? "全部项目"} chevron />
            </Sheet>
          </Picker>
          <SectionTitle>身份</SectionTitle>
          <Chips
            options={ROLE_OPTIONS}
            selected={[filters.permissionRole ?? "ALL"]}
            onToggle={(value) => setFilters({ ...filters, permissionRole: orNull(value) })}
          />
          <SectionTitle>在场</SectionTitle>
          <Chips
            options={STATUS_OPTIONS}
            selected={[filters.status ?? "ALL"]}
            onToggle={(value) => setFilters({ ...filters, status: orNull(value) })}
          />
          <SectionTitle>用工资料</SectionTitle>
          <Chips
            options={REGISTRATION_OPTIONS}
            selected={[filters.registrationStatus ?? "ALL"]}
            onToggle={(value) => setFilters({ ...filters, registrationStatus: orNull(value) })}
          />
          <SectionTitle>底照</SectionTitle>
          <Chips
            options={FACE_OPTIONS}
            selected={[filters.faceStatus ?? "ALL"]}
            onToggle={(value) => setFilters({ ...filters, faceStatus: orNull(value) })}
          />
          <Button variant="text" onClick={() => setFilters({})}>
            清除筛选
          </Button>
        </>
      ) : null}
      {error !== null ? (
        <StateView kind="error" title="人员没读到" sub={error} onRetry={refresh} />
      ) : items === null ? (
        <SkeletonRows rows={5} gap />
      ) : items.length === 0 ? (
        search === "" && activeFilters.length === 0 ? (
          <StateView kind="empty" title="公司里还没有人" sub="进入项目，在“项目人员”里添加成员。" />
        ) : (
          <StateView kind="empty" title="没有找到人" sub="换个关键词，或者换一个筛选。" />
        )
      ) : (
        <>
          <SectionTitle>{`共 ${total} 人`}</SectionTitle>
          <Sheet gap>
            {items.map((item) => {
              const line = companyPersonLine(item, filters);
              return (
                <Row
                  key={`${item.participantType}:${item.profileId}`}
                  title={line.title}
                  avatar={line.avatar}
                  sub={line.sub}
                  status={line.status ?? undefined}
                  value={line.status === null ? (line.tag ?? undefined) : undefined}
                  mute
                  chevron
                  onClick={() => {
                    void Taro.navigateTo({
                      url: `/pages/company-person/index?companyId=${encodeURIComponent(companyId)}&participantType=${item.participantType}&profileId=${encodeURIComponent(item.profileId)}`,
                    });
                  }}
                />
              );
            })}
          </Sheet>
          {pageError !== null ? <Notice tone="error">{pageError}</Notice> : null}
          {items.length < total ? (
            <Button variant="outline" wide loading={loadingMore} onClick={() => void loadMore()}>
              {loadingMore ? "加载中…" : `加载更多（还有 ${total - items.length} 人）`}
            </Button>
          ) : null}
        </>
      )}
    </Screen>
  );
}
