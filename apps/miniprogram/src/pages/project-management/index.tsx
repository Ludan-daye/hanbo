import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";

import { joinText } from "../../components/member-role-editor/person-text";
import {
  BottomBar,
  Button,
  FormInput,
  Notice,
  PageHeader,
  Row,
  Screen,
  Segmented,
  Sheet,
  SkeletonRows,
  StateView,
  type StatusKind,
} from "../../components/ui/index";
import { useManagedProjectId } from "../../hooks/use-management-scope";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSessionGuard } from "../../hooks/use-session-guard";
import {
  fetchParticipants,
  fetchProjectInvitations,
  revokeProjectInvitation,
} from "../../services/management";
import type {
  ManagedTeam,
  ProjectInvitation,
  ProjectParticipant,
} from "../../services/management.types";
import { formatChinaDate } from "../../services/time";
import { createTeam, fetchManagedTeams } from "../../services/workflows";
import { useSession } from "../../store/session";
import { errorMessage } from "../../services/error-messages";

import "./index.scss";

type Tab = "TEAMS" | "INVITATIONS";

const INVITATION_STATUS: Record<
  ProjectInvitation["status"],
  { readonly kind: StatusKind; readonly text: string }
> = {
  ACCEPTED: { kind: "ok", text: "已绑定" },
  EXPIRED: { kind: "idle", text: "已过期" },
  PENDING: { kind: "warn", text: "待绑定" },
  REVOKED: { kind: "idle", text: "已撤销" },
};

/** “11-25” */
const shortDate = (iso: string): string => formatChinaDate(iso).slice(5);

export default function ProjectManagement(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const { revision, refresh } = usePageRefresh();
  const projectId = useManagedProjectId(state.me);
  // 两个视图：班组和邀请的列表、新增班组。同一个页面里切换。
  const [view, setView] = useState<"list" | "create">("list");
  const [teamName, setTeamName] = useState<string>("");
  const [creating, setCreating] = useState<boolean>(false);
  const [tab, setTab] = useState<Tab>("TEAMS");
  const [teams, setTeams] = useState<ReadonlyArray<ManagedTeam> | null>(null);
  const [invitations, setInvitations] =
    useState<ReadonlyArray<ProjectInvitation> | null>(null);
  const [people, setPeople] = useState<ReadonlyArray<ProjectParticipant>>([]);
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
          const rows = await fetchManagedTeams(projectId);
          if (!cancelled) {
            setTeams(rows);
          }
        }
        if (tab === "INVITATIONS") {
          const [rows, members] = await Promise.all([
            fetchProjectInvitations(projectId),
            // 只为了写出邀请是发给谁的；名单读不到就不写名字，不影响列表。
            fetchParticipants(projectId).catch(
              (): ReadonlyArray<ProjectParticipant> => [],
            ),
          ]);
          if (!cancelled) {
            setInvitations(rows);
            setPeople(members);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(errorMessage(e, "操作未完成，请稍后重试。"));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, tab, revision]);

  if (projectId === null) {
    return (
      <Screen header={<PageHeader title="班组管理" />}>
        <StateView
          kind="empty"
          title="没有可以管理的项目"
          sub="当前账号没有项目管理员身份。"
        />
      </Screen>
    );
  }

  const addTeam = async (): Promise<void> => {
    if (!teamName.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      await createTeam(projectId, teamName.trim());
      setTeamName("");
      setView("list");
      refresh();
      await Taro.showToast({ title: "班组已创建", icon: "success" });
    } catch (failure: unknown) {
      setError(errorMessage(failure, "创建班组失败"));
    } finally {
      setCreating(false);
    }
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
      setError(errorMessage(failure, "撤销失败"));
    } finally {
      setBusyId(null);
    }
  };

  if (view === "create")
    return (
      <Screen
        header={
          <PageHeader
            title="新增班组"
            onBack={() => {
              setError(null);
              setView("list");
            }}
          />
        }
      >
        <Sheet gap>
          <FormInput
            label="班组名称"
            required
            value={teamName}
            placeholder="例如：钢筋二班"
            maxLength={30}
            onInput={setTeamName}
          />
        </Sheet>
        <Notice>建好后，到班组资料里补主要工种、指定负责人。</Notice>
        {error !== null ? <Notice tone="error">{error}</Notice> : null}
        <BottomBar
          primary={creating ? "创建中…" : "创建班组"}
          busy={creating}
          disabled={!teamName.trim()}
          onPrimary={() => {
            void addTeam();
          }}
        />
      </Screen>
    );

  const rows = tab === "TEAMS" ? teams : invitations;
  const invitee = (inv: ProjectInvitation): string => {
    const person = people.find(
      (p) =>
        p.profileId === inv.profileId && p.participantType === inv.targetType,
    );
    return person
      ? (person.displayName ?? `尾号 ${person.phone.slice(-4)} 的成员`)
      : inv.targetType === "WORKER"
        ? "一位工人"
        : "一位管理员";
  };
  return (
    <Screen header={<PageHeader title="班组管理" />}>
      <Segmented
        options={[
          {
            label: teams === null ? "班组" : `班组 ${teams.length}`,
            value: "TEAMS" as const,
          },
          { label: "邀请", value: "INVITATIONS" as const },
        ]}
        value={tab}
        onChange={(v) => {
          setTab(v);
        }}
      />

      {rows === null ? (
        error !== null ? (
          <StateView
            kind="error"
            title={tab === "TEAMS" ? "班组没读到" : "邀请没读到"}
            sub={error}
            onRetry={refresh}
          />
        ) : (
          <SkeletonRows rows={3} gap />
        )
      ) : rows.length === 0 ? (
        tab === "TEAMS" ? (
          <StateView
            kind="empty"
            title="还没有班组"
            sub="点下面的“新增班组”建第一个。"
          />
        ) : (
          <StateView
            kind="empty"
            title="还没有发过邀请码"
            sub="邀请码在“邀请绑定”里给成员生成。"
          />
        )
      ) : tab === "TEAMS" ? (
        <Sheet gap>
          {(teams ?? []).map((t) => (
            <Row
              key={t.id}
              title={t.name}
              sub={joinText([
                t.workType ?? "工种没填",
                `在场 ${t.memberCount} 人`,
                t.leader
                  ? `负责人 ${t.leader.displayName ?? "姓名待补录"}`
                  : "没有负责人",
              ])}
              status={
                t.status === "ACTIVE"
                  ? undefined
                  : { kind: "warn", text: "已暂停" }
              }
              chevron
              onClick={() => {
                void Taro.navigateTo({
                  url: `/pages/team-detail/index?projectId=${projectId}&teamId=${t.id}`,
                });
              }}
            />
          ))}
        </Sheet>
      ) : (
        <View className="invitation-log">
          <Sheet gap>
            {(invitations ?? []).map((inv) => (
              <Row
                key={inv.id}
                title={invitee(inv)}
                sub={`有效到 ${shortDate(inv.expiresAt)}，${shortDate(inv.createdAt)} 发出`}
                status={INVITATION_STATUS[inv.status]}
              >
                {inv.status === "PENDING" ? (
                  <Button
                    variant="text"
                    loading={busyId === inv.id}
                    disabled={busyId !== null}
                    onClick={() => {
                      void revoke(inv.id);
                    }}
                  >
                    {busyId === inv.id ? "撤销中…" : "撤销"}
                  </Button>
                ) : null}
              </Row>
            ))}
          </Sheet>
        </View>
      )}

      {rows !== null && error !== null ? (
        <>
          <Notice tone="error">{error}</Notice>
          <Button variant="outline" onClick={refresh}>
            重新读取
          </Button>
        </>
      ) : null}
      {tab === "TEAMS" ? (
        <BottomBar
          primary="新增班组"
          onPrimary={() => {
            setError(null);
            setView("create");
          }}
        />
      ) : null}
    </Screen>
  );
}
