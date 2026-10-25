import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import { useSessionGuard } from "../../hooks/use-session-guard";

import {
  Button,
  Field,
  Notice,
  Section,
  ListItem,
  PageHeader,
  Screen,
  Segmented,
  StateView,
} from "../../components/ui/index";
import { useManagedProjectId } from "../../hooks/use-management-scope";
import {
  fetchProjectInvitations,
  fetchProjectTeams,
  revokeProjectInvitation,
} from "../../services/management";
import type {
  ProjectInvitation,
  ProjectTeam,
} from "../../services/management.types";
import { createTeam } from "../../services/workflows";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSession } from "../../store/session";

type Tab = "TEAMS" | "INVITATIONS";

const TAB_OPTIONS = [
  { label: "班组", value: "TEAMS" as const },
  { label: "邀请", value: "INVITATIONS" as const },
];

const STATUS_LABEL: Record<ProjectInvitation["status"], string> = {
  ACCEPTED: "已接受",
  EXPIRED: "已过期",
  PENDING: "待绑定",
  REVOKED: "已撤销",
};

export default function ProjectManagement(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const { revision, refresh } = usePageRefresh();
  const projectId = useManagedProjectId(state.me);
  const [teamName, setTeamName] = useState<string>("");
  const [creating, setCreating] = useState<boolean>(false);
  const [tab, setTab] = useState<Tab>("TEAMS");
  const [teams, setTeams] = useState<ReadonlyArray<ProjectTeam> | null>(null);
  const [invitations, setInvitations] =
    useState<ReadonlyArray<ProjectInvitation> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (projectId === null) {
      return;
    }
    let cancelled = false;
    setError(null);
    void (async () => {
      try {
        if (tab === "TEAMS") {
          const rows = await fetchProjectTeams(projectId);
          if (!cancelled) {
            setTeams(rows);
          }
        }
        if (tab === "INVITATIONS") {
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
    return () => {
      cancelled = true;
    };
  }, [projectId, tab, revision]);

  if (projectId === null) {
    return (
      <Screen>
        <PageHeader title="项目管理" />
        <StateView title="无项目" sub="当前账号没有项目管理员身份。" />
      </Screen>
    );
  }

  const addTeam = async (): Promise<void> => {
    if (!teamName.trim() || creating) return;
    setCreating(true); setError(null);
    try { await createTeam(projectId, teamName.trim()); setTeamName(""); refresh(); await Taro.showToast({ title: "班组已创建", icon: "success" }); }
    catch (failure: unknown) { setError(failure instanceof Error ? failure.message : "创建班组失败"); }
    finally { setCreating(false); }
  };

  const revoke = async (id: string): Promise<void> => {
    if (busyId !== null) {
      return;
    }
    setBusyId(id);
    try {
      const updated = await revokeProjectInvitation(projectId, id);
      setInvitations((prev) =>
        (prev ?? []).map((r) => (r.id === id ? updated : r)),
      );
      await Taro.showToast({ icon: "success", title: "已撤销" });
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : "撤销失败");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Screen>
      <PageHeader title="项目管理" />
      <Segmented
        options={TAB_OPTIONS}
        value={tab}
        onChange={(v) => {
          setTab(v);
        }}
      />

      {error !== null ? (
        <StateView title="出错" sub={error} onRetry={refresh} />
      ) : null}

      {tab === "TEAMS" ? (
        <View>
          {teams === null && error === null ? (
            <StateView title="加载中…" />
          ) : null}
          {teams !== null && teams.length === 0 ? (
            <StateView title="尚无班组" />
          ) : null}
          <Notice>点击班组可管理成员，人员建档时可分配所属班组或班组长。</Notice>
          {(teams ?? []).map((t) => (
            <ListItem
              key={t.id}
              primary={t.name}
              secondary={
                t.status === "ACTIVE" ? "班组正常使用中" : "班组已暂停"
              }
              chip="查看成员"
              onClick={() => { void Taro.navigateTo({ url: `/pages/participants/index?projectId=${projectId}&teamId=${t.id}` }); }}
            />
          ))}
          <Section title="新增班组">
            <Field label="班组名称" value={teamName} placeholder="例如：钢筋二班" onInput={setTeamName} maxLength={30} />
            <Button loading={creating} disabled={!teamName.trim()} onClick={() => { void addTeam(); }}>创建班组</Button>
          </Section>
        </View>
      ) : (
        <View>
          {invitations === null && error === null ? (
            <StateView title="加载中…" />
          ) : null}
          {invitations !== null && invitations.length === 0 ? (
            <StateView title="尚无邀请" />
          ) : null}
          {(invitations ?? []).map((inv) => (
            <View key={inv.id}>
              <ListItem
                primary={`${inv.targetType === "WORKER" ? "工人" : "管理员"} · ${inv.profileId.slice(0, 8)}`}
                secondary={`有效期至 ${inv.expiresAt.slice(0, 10)} · 创建于 ${inv.createdAt.slice(0, 10)}`}
                chip={STATUS_LABEL[inv.status]}
              />
              {inv.status === "PENDING" ? (
                <Button
                  variant="outline"
                  loading={busyId === inv.id}
                  disabled={busyId !== null}
                  onClick={() => {
                    void revoke(inv.id);
                  }}
                >
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
