import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import { useSessionGuard } from "../../hooks/use-session-guard";

import {
  BottomBar,
  Button,
  Card,
  CardActions,
  CardMeta,
  CardTitle,
  Divider,
  KV,
  PRESS,
  PageHeader,
  Screen,
  SearchField,
  Segmented,
  SkeletonRows,
  StateView,
  type StatusKind,
} from "../../components/ui/index";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useManagedCompanyId } from "../../hooks/use-management-scope";
import { fetchCompanyProjects } from "../../services/management";
import type {
  CompanyProject,
  ProjectStatus,
} from "../../services/management.types";
import { useSession } from "../../store/session";
import { errorMessage } from "../../services/error-messages";

const STATUS: Readonly<
  Record<ProjectStatus, { readonly kind: StatusKind; readonly text: string }>
> = {
  ACTIVE: { kind: "ok", text: "进行中" },
  COMPLETED: { kind: "idle", text: "已完工" },
  PREPARING: { kind: "warn", text: "筹备中" },
  SUSPENDED: { kind: "warn", text: "已暂停" },
};
/** OTHER“其他”：不在进行中的（筹备中、已暂停、已完工），首页“另有 N 个项目”点进来就是它；卡片上的状态写明是哪一种。 */
type Filter = "ALL" | "ACTIVE" | "OTHER";

const plannedPeriod = (project: CompanyProject): string =>
  project.plannedEndDate === null
    ? `${project.plannedStartDate} 开工，完工日期未定`
    : `${project.plannedStartDate} 到 ${project.plannedEndDate}`;

export default function CompanyProjects(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const { revision, refresh } = usePageRefresh();
  const companyId = useManagedCompanyId(state.me);
  const [items, setItems] = useState<readonly CompanyProject[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<string>("");
  const requestedFilter = Taro.useRouter().params.filter;
  const [filter, setFilter] = useState<Filter>(
    requestedFilter === "OTHER" || requestedFilter === "ACTIVE" ? requestedFilter : "ALL",
  );
  const [opened, setOpened] = useState<string | null>(null);
  useEffect(() => {
    if (companyId === null) return;
    let cancelled = false;
    setError(null);
    void fetchCompanyProjects(companyId).then(
      (rows) => {
        if (!cancelled) setItems(rows);
      },
      (cause) => {
        if (!cancelled) setError(errorMessage(cause, "请稍后重试。"));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [companyId, revision]);
  const visible = (items ?? []).filter(
    (project) =>
      (filter === "ALL" ||
        (filter === "ACTIVE") === (project.status === "ACTIVE")) &&
      `${project.name} ${project.address}`.includes(search.trim()),
  );

  if (companyId === null)
    return (
      <Screen header={<PageHeader title="公司项目" />}>
        <StateView
          kind="empty"
          title="没有公司管理权限"
          sub="这个账号不是公司管理员。"
        />
      </Screen>
    );

  return (
    <Screen header={<PageHeader title="公司项目" />}>
      <SearchField
        value={search}
        placeholder="搜索项目名称或地址"
        onInput={setSearch}
      />
      <Segmented<Filter>
        options={[
          {
            value: "ALL",
            label: items === null ? "全部" : `全部 ${items.length}`,
          },
          {
            value: "ACTIVE",
            label: items === null ? "进行中" : `进行中 ${items.filter((row) => row.status === "ACTIVE").length}`,
          },
          {
            value: "OTHER",
            label: items === null ? "其他" : `其他 ${items.filter((row) => row.status !== "ACTIVE").length}`,
          },
        ]}
        value={filter}
        onChange={setFilter}
      />
      {error !== null ? (
        <StateView
          kind="error"
          title="项目没读到"
          sub={error}
          onRetry={refresh}
        />
      ) : items === null ? (
        <SkeletonRows rows={3} gap />
      ) : visible.length === 0 ? (
        items.length === 0 ? (
          <StateView
            kind="empty"
            title="还没有项目"
            sub="点下面的“新建项目”建第一个。"
          />
        ) : (
          <StateView
            kind="empty"
            title="没有找到项目"
            sub="换个关键词，或者换一个筛选。"
          />
        )
      ) : (
        visible.map((project) => {
          const open = opened === project.id;
          // 收着的时候点整张卡展开；展开后卡里有按钮，只有名称这一块用来收起。
          return (
            <Card
              gap
              key={project.id}
              onClick={open ? undefined : () => setOpened(project.id)}
            >
              <View
                className={open ? "ui-press" : undefined}
                {...(open ? PRESS : {})}
                onClick={open ? () => setOpened(null) : undefined}
              >
                <CardTitle status={STATUS[project.status]}>
                  {project.name}
                </CardTitle>
                {project.address ? (
                  <CardMeta>{project.address}</CardMeta>
                ) : null}
                {project.adminNames !== undefined ? (
                  <CardMeta>
                    {project.adminNames.length === 0
                      ? "还没有项目管理员"
                      : `管理员 ${project.adminNames.join("、")}`}
                    {/* 完工的项目没有“在场”可言，状态已经写着已完工。 */}
                    {project.activeMembers === undefined ||
                    project.status === "COMPLETED"
                      ? ""
                      : `，在场 ${project.activeMembers} 人`}
                  </CardMeta>
                ) : null}
              </View>
              {open ? (
                <View className="m-fade">
                  <Divider />
                  <KV
                    label="考勤范围"
                    value={`工地中心周围 ${project.geofenceRadiusM} 米`}
                  />
                  <KV label="计划工期" value={plannedPeriod(project)} />
                  <CardActions>
                    <Button
                      variant="outline"
                      onClick={() => {
                        void Taro.navigateTo({
                          url: `/pages/project-detail/index?projectId=${project.id}&view=hub`,
                        });
                      }}
                    >
                      进入项目
                    </Button>
                    <Button variant="text" onClick={() => setOpened(null)}>
                      收起
                    </Button>
                  </CardActions>
                </View>
              ) : null}
            </Card>
          );
        })
      )}
      <BottomBar
        primary="新建项目"
        onPrimary={() => {
          void Taro.navigateTo({
            url: `/pages/create-project/index?companyId=${companyId}`,
          });
        }}
      />
    </Screen>
  );
}
