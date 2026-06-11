import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";

import { Button, ListItem, PageHeader, Screen, Segmented, StateView } from "../../components/ui/index";
import { resolveAdminProjectId } from "../../routing/projectAdmin";
import { fetchProjectInvitations, fetchProjectTeams, revokeProjectInvitation } from "../../services/management";
import type { ProjectInvitation, ProjectTeam } from "../../services/management.types";
import { useSession } from "../../store/session";

type Tab = "TEAMS" | "INVITATIONS";

const TAB_OPTIONS = [
  { label: "班组", value: "TEAMS" as const },
  { label: "邀请", value: "INVITATIONS" as const }
];

const STATUS_LABEL: Record<ProjectInvitation["status"], string> = {
  ACCEPTED: "已接受",
  EXPIRED: "已过期",
  PENDING: "待绑定",
  REVOKED: "已撤销"
};

export default function ProjectManagement(): JSX.Element {
  const { state } = useSession();
  const projectId = resolveAdminProjectId(state.me);
  const [tab, setTab] = useState<Tab>("TEAMS");
  const [teams, setTeams] = useState<ReadonlyArray<ProjectTeam> | null>(null);
  const [invitations, setInvitations] = useState<ReadonlyArray<ProjectInvitation> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (projectId === null) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        if (tab === "TEAMS" && teams === null) {
          const rows = await fetchProjectTeams(projectId);
          if (!cancelled) {
            setTeams(rows);
          }
        }
        if (tab === "INVITATIONS" && invitations === null) {
          const rows = await fetchProjectInvitations(projectId);
          if (!cancelled) {
            setInvitations(rows);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "REQUEST_FAILED");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, tab, teams, invitations]);

  if (projectId === null) {
    return (
      <Screen>
        <PageHeader title="项目管理" />
        <StateView title="无项目" sub="当前账号没有项目管理员身份。" />
      </Screen>
    );
  }

  const revoke = async (id: string): Promise<void> => {
    if (busyId !== null) {
      return;
    }
    setBusyId(id);
    try {
      const updated = await revokeProjectInvitation(projectId, id);
      setInvitations((prev) => (prev ?? []).map((r) => (r.id === id ? updated : r)));
      await Taro.showToast({ icon: "success", title: "已撤销" });
    } catch {
      await Taro.showToast({ icon: "none", title: "撤销失败" });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Screen>
      <PageHeader title="项目管理" />
      <Segmented options={TAB_OPTIONS} value={tab} onChange={(v) => { setTab(v); }} />

      {error !== null ? <StateView title="出错" sub={error} /> : null}

      {tab === "TEAMS" ? (
        <View>
          {teams === null && error === null ? <StateView title="加载中…" /> : null}
          {teams !== null && teams.length === 0 ? <StateView title="尚无班组" /> : null}
          {(teams ?? []).map((t) => (
            <ListItem key={t.id} primary={t.name} secondary={`状态:${t.status}`} chip="班组" />
          ))}
        </View>
      ) : (
        <View>
          {invitations === null && error === null ? <StateView title="加载中…" /> : null}
          {invitations !== null && invitations.length === 0 ? <StateView title="尚无邀请" /> : null}
          {(invitations ?? []).map((inv) => (
            <View key={inv.id}>
              <ListItem
                primary={`${inv.targetType === "WORKER" ? "工人" : "管理员"} · ${inv.profileId.slice(0, 8)}`}
                secondary={`有效期至 ${inv.expiresAt.slice(0, 10)} · 创建于 ${inv.createdAt.slice(0, 10)}`}
                chip={STATUS_LABEL[inv.status]}
              />
              {inv.status === "PENDING" ? (
                <Button variant="outline" onClick={() => { void revoke(inv.id); }}>
                  {busyId === inv.id ? "撤销中…" : "撤销"}
                </Button>
              ) : null}
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}
