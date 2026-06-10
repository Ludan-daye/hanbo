import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";

import { Button, CopyButton, ListItem, PageHeader, Screen, Segmented, StateView } from "../../components/ui/index";
import { resolveAdminProjectId } from "../../routing/projectAdmin";
import { createInvitation, type BindingInvitation, type BindingTargetType } from "../../services/bindings";
import { fetchParticipants } from "../../services/management";
import type { ProjectParticipant } from "../../services/management.types";
import { useSession } from "../../store/session";

const TARGET_OPTIONS = [
  { label: "工人", value: "WORKER" as const },
  { label: "管理员", value: "MANAGER" as const }
];

export default function Invitation(): JSX.Element {
  const { state } = useSession();
  const projectId = resolveAdminProjectId(state.me);
  const [target, setTarget] = useState<BindingTargetType>("WORKER");
  const [items, setItems] = useState<ReadonlyArray<ProjectParticipant> | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [invitation, setInvitation] = useState<BindingInvitation | null>(null);
  const [busy, setBusy] = useState(false);
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

  const visible = (items ?? []).filter((p) => p.participantType === target);

  if (projectId === null) {
    return (
      <Screen>
        <PageHeader title="生成绑定邀请码" />
        <StateView title="无项目" sub="当前账号没有项目管理员身份。" />
      </Screen>
    );
  }

  const submit = async (): Promise<void> => {
    if (selectedProfileId === null || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await createInvitation(projectId, { profileId: selectedProfileId, targetType: target });
      setInvitation(r);
    } catch (e) {
      const message = e instanceof Error ? e.message : "REQUEST_FAILED";
      setError(message);
      await Taro.showToast({ icon: "none", title: "生成失败" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <PageHeader title="生成绑定邀请码" />
      <Segmented options={TARGET_OPTIONS} value={target} onChange={(v) => { setTarget(v); setSelectedProfileId(null); setInvitation(null); }} />

      {items === null && error === null ? <StateView title="加载中…" /> : null}
      {error !== null ? <StateView title="出错" sub={error} /> : null}

      <View>
        {visible.map((p) => (
          <ListItem
            key={p.profileId}
            primary={p.displayName ?? "(未填写姓名)"}
            secondary={`${p.projectRoleLabel} · ${p.teamName ?? "无班组"} · ${p.phone}`}
            chip={p.profileId === selectedProfileId ? "已选" : undefined}
            onClick={() => { setSelectedProfileId(p.profileId); setInvitation(null); }}
          />
        ))}
      </View>

      {selectedProfileId !== null && invitation === null ? (
        <Button onClick={() => { void submit(); }}>{busy ? "生成中…" : "生成邀请码"}</Button>
      ) : null}

      {invitation !== null ? (
        <View>
          <ListItem primary={`邀请码 · ${invitation.code}`} secondary={`有效期至 ${invitation.expiresAt}`} />
          <CopyButton value={invitation.code} label="复制邀请码" />
        </View>
      ) : null}
    </Screen>
  );
}
