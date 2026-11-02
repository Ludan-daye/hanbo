import { View } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useEffect, useState } from "react";
import { useSessionGuard } from "../../hooks/use-session-guard";

import {
  Button,
  ListItem,
  Notice,
  PageHeader,
  Screen,
  Segmented,
  StateView,
} from "../../components/ui/index";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { fetchMyMakeups, fetchMyProjects } from "../../services/me";
import { formatChinaHm } from "../../services/time";
import type { Makeup, MyProjectMembership } from "../../services/me.types";
import { useSession } from "../../store/session";
import { FlowScreen } from "../../components/worker-flow";
import "./index.scss";

const POINT_LABEL: Readonly<Record<Makeup["pointCode"], string>> = {
  SEGMENT_1_END: "上午下班",
  SEGMENT_1_START: "上午上班",
  SEGMENT_2_END: "下午下班",
  SEGMENT_2_START: "下午上班",
};
const STATUS_LABEL: Readonly<Record<Makeup["status"], string>> = {
  APPROVED: "已通过",
  PENDING: "待审批",
  REJECTED: "已驳回",
};
type Filter = "ALL" | Makeup["status"];
export default function MyMakeups(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const workerAppearance = state.me?.roles.highestRoleCode === "WORKER";
  const route = useRouter();
  const { revision, refresh } = usePageRefresh();
  const [filter, setFilter] = useState<Filter>(
    route.params.status === "PENDING" ? "PENDING" : "ALL",
  );
  const [items, setItems] = useState<readonly Makeup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [projects, setProjects] = useState<readonly MyProjectMembership[]>([]);
  const [projectError, setProjectError] = useState(false);
  useEffect(() => {
    if (!workerAppearance) return;
    let cancelled = false;
    setProjectError(false);
    void fetchMyProjects().then(
      (rows) => {
        if (!cancelled) setProjects(rows);
      },
      () => {
        if (!cancelled) setProjectError(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [workerAppearance, revision]);
  useEffect(() => {
    let cancelled = false;
    setError(null);
    void fetchMyMakeups().then(
      (rows) => {
        if (!cancelled) setItems(rows);
      },
      (reason) => {
        if (!cancelled)
          setError(
            reason instanceof Error ? reason.message : "无法读取补卡申请",
          );
      },
    );
    return () => {
      cancelled = true;
    };
  }, [revision]);
  const visible = (items ?? []).filter(
    (item) => filter === "ALL" || item.status === filter,
  );
  if (workerAppearance) {
    return (
      <FlowScreen title="我的补卡">
        <View className="worker-makeups">
          <Segmented<Filter>
            options={[
              { value: "ALL", label: "全部" },
              { value: "PENDING", label: "待审批" },
              { value: "APPROVED", label: "通过" },
              { value: "REJECTED", label: "驳回" },
            ]}
            value={filter}
            onChange={(value) => {
              setFilter(value);
              setExpandedId(null);
            }}
          />
          {projectError ? (
            <View
              className="worker-makeups__hint"
              role="button"
              onClick={refresh}
            >
              部分项目名称未读取，申请记录仍可查看。点击重试
            </View>
          ) : null}
          {items === null && error === null ? (
            <StateView title="正在读取补卡申请…" />
          ) : null}
          {error ? (
            <StateView title="补卡申请加载失败" sub={error} onRetry={refresh} />
          ) : null}
          {!error && items !== null && visible.length === 0 ? (
            <StateView
              title="暂无这类补卡申请"
              sub="新申请和审批进度会显示在这里。"
            />
          ) : null}
          {!error
            ? visible.map((item) => {
                const project = projects.find(
                  (row) => row.projectId === item.projectId,
                );
                const expanded = expandedId === item.id;
                return (
                  <View
                    key={item.id}
                    className="worker-makeups__item"
                    data-makeup-id={item.id}
                  >
                    <View
                      className="worker-makeups__summary"
                      role="button"
                      aria-expanded={expanded}
                      onClick={() => setExpandedId(expanded ? null : item.id)}
                    >
                      <View className="worker-makeups__row">
                        <View className="worker-makeups__date">
                          {item.attendanceDate}
                        </View>
                        <View
                          className={`worker-makeups__status worker-makeups__status--${item.status.toLowerCase()}`}
                        >
                          {STATUS_LABEL[item.status]}
                        </View>
                      </View>
                      <View className="worker-makeups__row">
                        <View className="worker-makeups__title">
                          {item.pointLabel ??
                            POINT_LABEL[item.pointCode] ??
                            item.pointCode}{" "}
                          {formatChinaHm(item.requestedOccurredAt)}
                        </View>
                        <View className="worker-makeups__expand">
                          {expanded ? "收起" : "详情"}
                        </View>
                      </View>
                      <View className="worker-makeups__meta">
                        {project
                          ? `${project.projectName}${project.teamName ? ` · ${project.teamName}` : ""}`
                          : "所属项目名称暂不可用"}
                      </View>
                      {!expanded &&
                      item.status === "REJECTED" &&
                      item.approvalReason ? (
                        <View className="worker-makeups__review-preview">
                          审批意见：{item.approvalReason}
                        </View>
                      ) : null}
                    </View>
                    {expanded ? (
                      <View className="worker-makeups__details">
                        <ListItem
                          primary="申请实际时间"
                          secondary={formatChinaHm(item.requestedOccurredAt)}
                        />
                        <ListItem primary="申请原因" secondary={item.reason} />
                        {item.approvalReason ? (
                          <ListItem
                            primary="审批意见"
                            secondary={item.approvalReason}
                          />
                        ) : null}
                        <ListItem
                          primary="当前状态"
                          secondary={
                            item.status === "PENDING"
                              ? "已提交，等待所属上级处理"
                              : STATUS_LABEL[item.status]
                          }
                        />
                      </View>
                    ) : null}
                  </View>
                );
              })
            : null}
          <View className="worker-makeups__action">
            <Button
              onClick={() => {
                void Taro.navigateTo({ url: "/pages/submit-makeup/index" });
              }}
            >
              新申请补卡
            </Button>
          </View>
          <ListItem
            primary="查看考勤记录"
            onClick={() => {
              void Taro.navigateTo({ url: "/pages/my-records/index" });
            }}
          />
        </View>
      </FlowScreen>
    );
  }
  return (
    <Screen>
      <PageHeader title="补卡申请" />
      <Notice>漏打卡或打卡异常？提交补卡申请，经班组长审批后更新考勤。</Notice>
      <Button
        onClick={() => {
          void Taro.navigateTo({ url: "/pages/submit-makeup/index" });
        }}
      >
        ＋ 发起补卡申请
      </Button>
      <Segmented<Filter>
        options={[
          { value: "ALL", label: "全部" },
          { value: "PENDING", label: "待审批" },
          { value: "APPROVED", label: "已通过" },
          { value: "REJECTED", label: "已驳回" },
        ]}
        value={filter}
        onChange={setFilter}
      />
      {items === null && error === null ? <StateView title="加载中…" /> : null}
      {error ? (
        <StateView title="加载失败" sub={error} onRetry={refresh} />
      ) : null}
      {items !== null && visible.length === 0 ? (
        <StateView
          title="暂无这类补卡申请"
          sub="新申请和审批进度都会同步在这里。"
        />
      ) : null}
      {visible.map((item) => (
        <View key={item.id} className="makeup-card">
          <ListItem
            primary={`${item.pointLabel ?? POINT_LABEL[item.pointCode] ?? item.pointCode} · ${item.attendanceDate}`}
            secondary={`申请打卡时间 ${formatChinaHm(item.requestedOccurredAt)} · ${item.reason}`}
            chip={STATUS_LABEL[item.status]}
          />
          {item.approvalReason ? (
            <View className="makeup-review-note">
              审批意见：{item.approvalReason}
            </View>
          ) : null}
        </View>
      ))}
    </Screen>
  );
}
