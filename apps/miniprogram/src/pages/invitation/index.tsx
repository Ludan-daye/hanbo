import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import { displayProjectRole } from "../../routing/features";
import { useSessionGuard } from "../../hooks/use-session-guard";

import {
  Button,
  Notice,
  Subtitle,
  CopyButton,
  ListItem,
  PageHeader,
  Screen,
  Segmented,
  StateView,
} from "../../components/ui/index";
import { useManagedProjectId } from "../../hooks/use-management-scope";
import {
  createInvitation,
  type BindingInvitation,
  type BindingTargetType,
} from "../../services/bindings";
import { fetchParticipants } from "../../services/management";
import type { ProjectParticipant } from "../../services/management.types";
import { useSession } from "../../store/session";

const TARGET_OPTIONS = [
  { label: "工人", value: "WORKER" as const },
  { label: "管理员", value: "MANAGER" as const },
];

export default function Invitation(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const projectId = useManagedProjectId(state.me);
  const [target, setTarget] = useState<BindingTargetType>("WORKER");
  const [items, setItems] = useState<ReadonlyArray<ProjectParticipant> | null>(
    null,
  );
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
    null,
  );
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
    return () => {
      cancelled = true;
    };
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
      const r = await createInvitation(projectId, {
        profileId: selectedProfileId,
        targetType: target,
      });
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
      <Notice>
        先选择成员，再生成专属邀请码。已绑定账号的成员无需重复邀请。
      </Notice>
      <Segmented
        options={TARGET_OPTIONS}
        value={target}
        onChange={(v) => {
          setTarget(v);
          setSelectedProfileId(null);
          setInvitation(null);
        }}
      />

      {items === null && error === null ? <StateView title="加载中…" /> : null}
      {error !== null ? <StateView title="出错" sub={error} /> : null}

      {items !== null && visible.length === 0 ? (
        <StateView title="暂无这类成员" sub="请先添加项目成员后再生成邀请。" />
      ) : null}
      <View>
        {visible.map((p) => (
          <ListItem
            key={p.profileId}
            primary={p.displayName ?? `成员 · ${p.phone.slice(-4)}`}
            secondary={`${displayProjectRole(p.projectRoleLabel)} · ${p.teamName ?? "无班组"} · ${p.phone}`}
            chip={p.profileId === selectedProfileId ? "已选" : undefined}
            onClick={() => {
              setSelectedProfileId(p.profileId);
              setInvitation(null);
            }}
          />
        ))}
      </View>

      {selectedProfileId !== null && invitation === null ? (
        <Button
          loading={busy}
          onClick={() => {
            void submit();
          }}
        >
          {busy ? "生成中…" : "生成邀请码"}
        </Button>
      ) : null}

      {invitation !== null ? (
        <View>
          <ListItem
            primary={`邀请码 · ${invitation.code}`}
            secondary={`有效期至 ${invitation.expiresAt.slice(0, 10)}`}
          />
          <Subtitle>请将此邀请码交给对应成员本人，完成身份绑定。</Subtitle>
          <CopyButton value={invitation.code} label="复制邀请码" />
        </View>
      ) : null}
    </Screen>
  );
}
