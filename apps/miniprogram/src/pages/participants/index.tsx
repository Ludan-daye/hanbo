import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useMemo, useState } from "react";

import { ListItem, PageHeader, Screen, Segmented, StateView } from "../../components/ui/index";
import { resolveAdminProjectId } from "../../routing/projectAdmin";
import { fetchParticipants } from "../../services/management";
import type { ParticipantType, ProjectParticipant } from "../../services/management.types";
import { useSession } from "../../store/session";

type Filter = "ALL" | ParticipantType;
const FILTER_OPTIONS = [
  { label: "全部", value: "ALL" as const },
  { label: "工人", value: "WORKER" as const },
  { label: "管理员", value: "MANAGER" as const }
];

export default function Participants(): JSX.Element {
  const { state } = useSession();
  const projectId = resolveAdminProjectId(state.me);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [items, setItems] = useState<ReadonlyArray<ProjectParticipant> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (projectId === null) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const rows = await fetchParticipants(projectId);
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
  }, [projectId]);

  const visible = useMemo(() => {
    if (items === null) {
      return [];
    }
    return filter === "ALL" ? items : items.filter((p) => p.participantType === filter);
  }, [items, filter]);

  if (projectId === null) {
    return (
      <Screen>
        <PageHeader title="项目参与者" />
        <StateView title="无项目" sub="当前账号没有项目管理员身份。" />
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHeader title="项目参与者" />
      <Segmented options={FILTER_OPTIONS} value={filter} onChange={(v) => { setFilter(v); }} />
      {items === null && error === null ? <StateView title="加载中…" /> : null}
      {error !== null ? <StateView title="加载失败" sub={error} /> : null}
      {items !== null && visible.length === 0 ? <StateView title="尚无参与者" /> : null}
      <View>
        {visible.map((p) => (
          <ListItem
            key={p.memberId}
            primary={p.displayName ?? "(未填写姓名)"}
            secondary={`${p.projectRoleLabel} · ${p.teamName ?? "无班组"} · ${p.phone}`}
            chip={p.participantType === "WORKER" ? "工人" : "管理员"}
            onClick={() => { void Taro.showToast({ icon: "none", title: p.status }); }}
          />
        ))}
      </View>
    </Screen>
  );
}
