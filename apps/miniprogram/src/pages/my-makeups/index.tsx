import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";

import { Button, ListItem, PageHeader, Screen, StateView } from "../../components/ui/index";
import { fetchMyMakeups } from "../../services/me";
import type { Makeup } from "../../services/me.types";

const POINT_LABEL: Record<Makeup["pointCode"], string> = {
  SEGMENT_1_END: "上午下班",
  SEGMENT_1_START: "上午上班",
  SEGMENT_2_END: "下午下班",
  SEGMENT_2_START: "下午上班"
};

const STATUS_LABEL: Record<Makeup["status"], string> = {
  APPROVED: "已通过",
  PENDING: "待审",
  REJECTED: "已驳回"
};

export default function MyMakeups(): JSX.Element {
  const [items, setItems] = useState<ReadonlyArray<Makeup> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await fetchMyMakeups();
        if (!cancelled) {
          setItems(rows);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "REQUEST_FAILED");
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <Screen>
      <PageHeader title="我的补卡" />
      {items === null && error === null ? <StateView title="加载中…" /> : null}
      {error !== null ? <StateView title="加载失败" sub={error} /> : null}
      {items !== null && items.length === 0 ? <StateView title="尚无补卡申请" /> : null}
      <View>
        {(items ?? []).map((m) => (
          <ListItem
            key={m.id}
            primary={`${POINT_LABEL[m.pointCode]} · ${m.attendanceDate}`}
            secondary={m.approvalReason ? `${m.reason} | 审批:${m.approvalReason}` : m.reason}
            chip={STATUS_LABEL[m.status]}
          />
        ))}
      </View>
      <Button onClick={() => { void Taro.navigateTo({ url: "/pages/submit-makeup/index" }); }}>
        提交补卡申请
      </Button>
    </Screen>
  );
}
