import { View } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useEffect, useState } from "react";
import { useSessionGuard } from "../../hooks/use-session-guard";

import {
  BottomBar,
  Button,
  Card,
  CardMeta,
  CardTitle,
  Notice,
  PageHeader,
  Screen,
  Segmented,
  Stamp,
  StateView,
  type StatusKind,
} from "../../components/ui/index";
import {
  monthDayLabel,
  pointName,
} from "../../components/worker-records/day-view";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { fetchMyMakeups, fetchMyProjects } from "../../services/me";
import { formatChinaDate, formatChinaHm } from "../../services/time";
import type { Makeup, MyProjectMembership } from "../../services/me.types";
import { errorMessage } from "../../services/error-messages";

type Filter = "ALL" | Makeup["status"];
// 通过的不写状态，落红章。
const STATUS: Readonly<
  Record<
    Exclude<Makeup["status"], "APPROVED">,
    { readonly kind: StatusKind; readonly text: string }
  >
> = {
  PENDING: { kind: "warn", text: "待审批" },
  REJECTED: { kind: "bad", text: "已驳回" },
};
const EMPTY_TITLE: Readonly<Record<Filter, string>> = {
  ALL: "还没有补卡申请",
  APPROVED: "没有通过的申请",
  PENDING: "没有待审批的申请",
  REJECTED: "没有驳回的申请",
};

/** 我的补卡：所有角色同一套版式。通过的落红章，驳回的把原因直接写在卡片上。 */
export default function MyMakeups(): JSX.Element {
  useSessionGuard();
  const route = useRouter();
  const { revision, refresh } = usePageRefresh();
  const [filter, setFilter] = useState<Filter>(
    route.params.status === "PENDING" ? "PENDING" : "ALL",
  );
  const [items, setItems] = useState<readonly Makeup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<readonly MyProjectMembership[]>([]);
  const [projectError, setProjectError] = useState(false);
  useEffect(() => {
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
  }, [revision]);
  useEffect(() => {
    let cancelled = false;
    setError(null);
    void fetchMyMakeups().then(
      (rows) => {
        if (!cancelled) setItems(rows);
      },
      (reason) => {
        if (!cancelled) setError(errorMessage(reason, "无法读取补卡申请"));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [revision]);
  const visible = (items ?? []).filter(
    (item) => filter === "ALL" || item.status === filter,
  );

  return (
    <Screen header={<PageHeader title="我的补卡" />}>
      <Segmented<Filter>
        options={[
          { value: "ALL", label: "全部" },
          { value: "PENDING", label: "待审批" },
          { value: "APPROVED", label: "通过" },
          { value: "REJECTED", label: "驳回" },
        ]}
        value={filter}
        onChange={setFilter}
      />
      {projectError ? (
        <>
          <Notice>项目名没读到，申请照常能看。</Notice>
          <Button variant="text" onClick={refresh}>
            重新读取
          </Button>
        </>
      ) : null}
      {error ? (
        <StateView
          kind="error"
          title="补卡申请没读到"
          sub={error}
          onRetry={refresh}
        />
      ) : items === null ? (
        <StateView title="正在读取补卡申请…" />
      ) : visible.length === 0 ? (
        <StateView
          kind="empty"
          title={EMPTY_TITLE[filter]}
          sub={filter === "ALL" ? "漏打了卡，点下面的“申请补卡”。" : undefined}
        />
      ) : (
        visible.map((item) => {
          const project = projects.find(
            (row) => row.projectId === item.projectId,
          );
          const approved = item.status === "APPROVED";
          return (
            <Card key={item.id} gap stamped={approved}>
              <CardTitle status={approved ? undefined : STATUS[item.status]}>
                {`${monthDayLabel(item.attendanceDate)} ${pointName(item)}`}
              </CardTitle>
              <CardMeta>
                {[
                  `实际时间 ${formatChinaHm(item.requestedOccurredAt)}`,
                  project?.projectName,
                  project?.teamName,
                ]
                  .filter(Boolean)
                  .join("，")}
              </CardMeta>
              <CardMeta>申请原因：{item.reason}</CardMeta>
              {item.approvalReason ? (
                item.status === "REJECTED" ? (
                  <View>审批意见：{item.approvalReason}</View>
                ) : (
                  <CardMeta>审批意见：{item.approvalReason}</CardMeta>
                )
              ) : null}
              {approved ? (
                <Stamp
                  text="已通过"
                  sub={
                    item.approvedAt
                      ? formatChinaDate(item.approvedAt).slice(5)
                      : undefined
                  }
                />
              ) : null}
            </Card>
          );
        })
      )}
      <BottomBar
        primary="申请补卡"
        onPrimary={() => {
          void Taro.navigateTo({ url: "/pages/submit-makeup/index" });
        }}
      >
        <Button
          variant="text"
          onClick={() => {
            void Taro.navigateTo({ url: "/pages/my-records/index" });
          }}
        >
          考勤记录
        </Button>
      </BottomBar>
    </Screen>
  );
}
