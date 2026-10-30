import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import { useSessionGuard } from "../../hooks/use-session-guard";

import {
  AppIcon,
  Button,
  Field,
  ListItem,
  PageHeader,
  Screen,
  Segmented,
  StateView,
  Subtitle,
} from "../../components/ui/index";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useManagedCompanyId } from "../../hooks/use-management-scope";
import { fetchCompanyProjects } from "../../services/management";
import type {
  CompanyProject,
  ProjectStatus,
} from "../../services/management.types";
import { useSession } from "../../store/session";

const STATUS_LABEL: Readonly<Record<ProjectStatus, string>> = {
  ACTIVE: "进行中",
  COMPLETED: "已完工",
  PREPARING: "筹备中",
  SUSPENDED: "已暂停",
};
type Filter = "ALL" | ProjectStatus;
export default function CompanyProjects(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const { revision, refresh } = usePageRefresh();
  const companyId = useManagedCompanyId(state.me);
  const [items, setItems] = useState<readonly CompanyProject[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<string>("");
  const [filter, setFilter] = useState<Filter>("ALL");
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
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : "无法读取项目");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [companyId, revision]);
  const visible = (items ?? []).filter(
    (project) =>
      (filter === "ALL" || project.status === filter) &&
      `${project.name} ${project.address}`.includes(search.trim()),
  );
  return (
    <Screen>
      <PageHeader title="公司项目" />
      {companyId === null ? (
        <StateView title="暂无公司管理权限" />
      ) : (
        <View>
          <Field
            value={search}
            placeholder="搜索项目名称或地址"
            onInput={setSearch}
          />
          <Segmented<Filter>
            options={[
              { value: "ALL", label: "全部" },
              { value: "ACTIVE", label: "进行中" },
              { value: "PREPARING", label: "筹备中" },
              { value: "COMPLETED", label: "已完工" },
            ]}
            value={filter}
            onChange={setFilter}
          />
          <Subtitle>共 {visible.length} 个项目 · 点击卡片查看详情</Subtitle>
          {items === null && error === null ? (
            <StateView title="加载中…" />
          ) : null}
          {error ? (
            <StateView title="加载失败" sub={error} onRetry={refresh} />
          ) : null}
          {items !== null && visible.length === 0 ? (
            <StateView
              title="没有找到相关项目"
              sub="尝试调整筛选条件，或新建一个项目。"
            />
          ) : null}
          {visible.map((project) => (
            <View className="project-card" key={project.id}>
              <View
                className="project-card__heading"
                onClick={() => {
                  setOpened(opened === project.id ? null : project.id);
                }}
              >
                <View className="project-card__icon">
                  <AppIcon name="building" />
                </View>
                <View className="project-card__name">{project.name}</View>
                <View
                  className={`project-card__status project-card__status--${project.status}`}
                >
                  {STATUS_LABEL[project.status]}
                </View>
              </View>
              <View className="project-card__address">
                <AppIcon name="pin" />
                <View>{project.address}</View>
              </View>
              <View className="project-card__footer">
                <View>开工 {project.plannedStartDate}</View>
                <View
                  onClick={() => {
                    setOpened(opened === project.id ? null : project.id);
                  }}
                >
                  {opened === project.id ? "收起详情" : "项目详情"} ›
                </View>
              </View>
              {opened === project.id ? (
                <View className="project-card__details">
                  <Button onClick={() => { void Taro.navigateTo({ url: `/pages/project-detail/index?projectId=${project.id}` }); }}>进入项目工作台</Button>
                  <ListItem
                    primary="考勤范围"
                    secondary={`工地中心周围 ${project.geofenceRadiusM} 米`}
                  />
                  <ListItem
                    primary="工地位置"
                    secondary={project.address}
                    chip="查看地图"
                    onClick={() => { void Taro.navigateTo({ url: `/pages/project-detail/index?projectId=${project.id}` }); }}
                  />
                  <ListItem
                    primary="计划工期"
                    secondary={`${project.plannedStartDate} 至 ${project.plannedEndDate ?? "未设置结束日期"}`}
                  />
                </View>
              ) : null}
            </View>
          ))}
          <Button
            onClick={() => {
              void Taro.navigateTo({ url: `/pages/create-project/index?companyId=${companyId}` });
            }}
          >
            ＋ 新建项目
          </Button>
        </View>
      )}
    </Screen>
  );
}
