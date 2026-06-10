import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";

import { Button, Field, ListItem, PageHeader, Screen, StateView } from "../../components/ui/index";
import { resolveTeamLeaderTeamId } from "../../routing/teamLeader";
import { approveMakeup, fetchPendingMakeups, rejectMakeup, type PendingMakeup } from "../../services/makeups";
import { useSession } from "../../store/session";

const POINT_LABEL: Record<PendingMakeup["pointCode"], string> = {
  SEGMENT_1_END: "上午下班",
  SEGMENT_1_START: "上午上班",
  SEGMENT_2_END: "下午下班",
  SEGMENT_2_START: "下午上班"
};

export default function TeamMakeups(): JSX.Element {
  const { state } = useSession();
  const teamId = resolveTeamLeaderTeamId(state.me);
  const [items, setItems] = useState<ReadonlyArray<PendingMakeup> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (teamId === null) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const rows = await fetchPendingMakeups(teamId);
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
  }, [teamId]);

  if (teamId === null) {
    return (
      <Screen>
        <PageHeader title="补卡审批" />
        <StateView title="无班组" sub="当前账号没有班组长身份。" />
      </Screen>
    );
  }

  const act = async (id: string, kind: "approve" | "reject"): Promise<void> => {
    const approvalReason = (reasons[id] ?? "").trim();
    if (approvalReason.length === 0) {
      await Taro.showToast({ icon: "none", title: "请填写理由" });
      return;
    }
    setBusy(id);
    try {
      if (kind === "approve") {
        await approveMakeup(id, { approvalReason });
      } else {
        await rejectMakeup(id, { approvalReason });
      }
      setItems((prev) => (prev ?? []).filter((r) => r.id !== id));
      setOpenId(null);
      setReasons((prev) => { const next = { ...prev }; delete next[id]; return next; });
      await Taro.showToast({ icon: "success", title: kind === "approve" ? "已通过" : "已驳回" });
    } catch {
      await Taro.showToast({ icon: "none", title: "操作失败" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <PageHeader title="补卡审批" />
      {items === null && error === null ? <StateView title="加载中…" /> : null}
      {error !== null ? <StateView title="加载失败" sub={error} /> : null}
      {items !== null && items.length === 0 ? <StateView title="无待审补卡" /> : null}
      <View>
        {(items ?? []).map((r) => (
          <View key={r.id}>
            <ListItem
              primary={`${POINT_LABEL[r.pointCode]} · ${r.attendanceDate}`}
              secondary={r.reason}
              chip={openId === r.id ? "审批中" : "待审"}
              onClick={() => { setOpenId(openId === r.id ? null : r.id); }}
            />
            {openId === r.id ? (
              <View>
                <Field
                  value={reasons[r.id] ?? ""}
                  placeholder="审批理由(必填)"
                  onInput={(v) => { setReasons((prev) => ({ ...prev, [r.id]: v })); }}
                />
                <Button onClick={() => { void act(r.id, "approve"); }}>{busy === r.id ? "处理中…" : "通过"}</Button>
                <Button variant="outline" onClick={() => { void act(r.id, "reject"); }}>{busy === r.id ? "处理中…" : "驳回"}</Button>
              </View>
            ) : null}
          </View>
        ))}
      </View>
    </Screen>
  );
}
