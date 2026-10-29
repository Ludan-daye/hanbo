import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";
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
import { fetchMyMakeups } from "../../services/me";
import { formatChinaHm } from "../../services/time";
import type { Makeup } from "../../services/me.types";

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
  const { revision, refresh } = usePageRefresh();
  const [filter, setFilter] = useState<Filter>("ALL");
  const [items, setItems] = useState<readonly Makeup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
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
            primary={`${(item.pointLabel ?? POINT_LABEL[item.pointCode] ?? item.pointCode)} · ${item.attendanceDate}`}
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
