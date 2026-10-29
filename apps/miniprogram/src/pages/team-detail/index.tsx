import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";

import {
  Button,
  Field,
  ListItem,
  Notice,
  PageHeader,
  Screen,
  Section,
  Segmented,
  StateView,
} from "../../components/ui/index";
import { useManagedProjectId } from "../../hooks/use-management-scope";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import type {
  ManagedTeam,
  ParticipantPage,
} from "../../services/management.types";
import {
  fetchManagedTeam,
  fetchParticipantPage,
  updateTeam,
} from "../../services/workflows";
import { useSession } from "../../store/session";

export default function TeamDetail(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const projectId: string | null = useManagedProjectId(state.me);
  const teamId: string | undefined = Taro.useRouter().params.teamId;
  const { revision, refresh } = usePageRefresh();
  const [team, setTeam] = useState<ManagedTeam | null>(null);
  const [people, setPeople] = useState<ParticipantPage | null>(null);
  const [searchInput, setSearchInput] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const timer = setTimeout((): void => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return (): void => clearTimeout(timer);
  }, [searchInput]);
  useEffect(() => {
    if (!projectId || !teamId) return;
    let cancelled: boolean = false;
    void fetchManagedTeam(projectId, teamId).then(
      (data): void => {
        if (!cancelled) {
          setTeam(data);
          setError(null);
        }
      },
      (failure: unknown): void => {
        if (!cancelled)
          setError(failure instanceof Error ? failure.message : "读取班组失败");
      },
    );
    return (): void => {
      cancelled = true;
    };
  }, [projectId, teamId, revision]);
  useEffect(() => {
    if (!projectId || !teamId) return;
    let cancelled: boolean = false;
    setPeople(null);
    void fetchParticipantPage(projectId, {
      page,
      pageSize: 50,
      search,
      participantType: null,
      status: "ACTIVE",
      teamId,
    }).then(
      (data): void => {
        if (!cancelled) setPeople(data);
      },
      (failure: unknown): void => {
        if (!cancelled)
          setError(failure instanceof Error ? failure.message : "读取成员失败");
      },
    );
    return (): void => {
      cancelled = true;
    };
  }, [projectId, teamId, page, search, revision]);
  const save = async (): Promise<void> => {
    if (!projectId || !teamId || !team || busy) return;
    if (!team.name.trim()) {
      setError("请填写班组名称。");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setTeam(
        await updateTeam(projectId, teamId, {
          name: team.name.trim(),
          status: team.status === "ACTIVE" ? "ACTIVE" : "SUSPENDED",
          workType: team.workType?.trim() || null,
          remark: team.remark?.trim() || null,
          leader:
            team.leader === null
              ? null
              : {
                  memberId: team.leader.memberId,
                  participantType: team.leader.participantType,
                },
          expectedUpdatedAt: team.updatedAt,
        }),
      );
      await Taro.showToast({ title: "班组资料已保存", icon: "success" });
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : "保存班组失败");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      <PageHeader title="班组资料" />
      {error ? (
        <StateView title="操作未完成" sub={error} onRetry={refresh} />
      ) : null}
      {!projectId || !teamId ? (
        <StateView title="请从班组管理进入" />
      ) : !team && !error ? (
        <StateView title="加载中…" />
      ) : null}
      {team ? (
        <>
          <Section title="班组信息" sub={`在场 ${team.memberCount} 人`}>
            <Field
              label="班组名称 *"
              value={team.name}
              placeholder="例如：钢筋一班"
              maxLength={30}
              onInput={(name) => setTeam({ ...team, name })}
            />
            <Field
              label="主要工种"
              value={team.workType ?? ""}
              placeholder="例如：钢筋工、电工"
              maxLength={40}
              onInput={(workType) => setTeam({ ...team, workType })}
            />
            <Field
              label="备注"
              value={team.remark ?? ""}
              placeholder="班组工作安排"
              maxLength={1000}
              onInput={(remark) => setTeam({ ...team, remark })}
            />
            <Segmented
              value={team.status === "ACTIVE" ? "ACTIVE" : "SUSPENDED"}
              options={[
                { value: "ACTIVE", label: "正常" },
                { value: "SUSPENDED", label: "暂停" },
              ]}
              onChange={(status) => setTeam({ ...team, status })}
            />
          </Section>
          <Section title="班组负责人" sub="从本班组在场成员中指定">
            <ListItem
              primary={
                team.leader?.displayName ??
                (team.leader ? "姓名待补录" : "尚未指定")
              }
              secondary={team.leader?.phone ?? "下方选择负责人后保存"}
            />
            {team.leader ? (
              <Button
                variant="outline"
                onClick={() => setTeam({ ...team, leader: null })}
              >
                取消负责人
              </Button>
            ) : null}
            <Notice>
              负责人用于班组联络；考勤审批权限按成员的班组长角色配置。负责人转组、暂停或退场后自动取消。
            </Notice>
            <Field
              value={searchInput}
              placeholder="搜索负责人姓名前缀、手机号或工种"
              onInput={setSearchInput}
            />
            {people === null ? <StateView title="加载成员…" /> : null}
            {people?.items.map((person) => (
              <ListItem
                key={person.memberId}
                primary={person.displayName ?? "姓名待补录"}
                secondary={`${person.workType ?? "工种待补录"} · ${person.phone}`}
                chip={
                  team.leader?.memberId === person.memberId
                    ? "已选"
                    : "设为负责人"
                }
                onClick={() =>
                  setTeam({
                    ...team,
                    leader: {
                      memberId: person.memberId,
                      participantType: person.participantType,
                      displayName: person.displayName,
                      phone: person.phone,
                    },
                  })
                }
              />
            ))}
            {people !== null && people.items.length === 0 ? (
              <Notice>
                没有符合条件的在场成员，可调整搜索或前往成员管理分配人员。
              </Notice>
            ) : null}
            {page > 1 ? (
              <Button variant="outline" onClick={() => setPage(page - 1)}>
                上一页
              </Button>
            ) : null}
            {people && page * people.pageSize < people.total ? (
              <Button variant="outline" onClick={() => setPage(page + 1)}>
                下一页
              </Button>
            ) : null}
          </Section>
          <Button
            loading={busy}
            onClick={() => {
              void save();
            }}
          >
            保存班组资料
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              void Taro.navigateTo({
                url: `/pages/participants/index?projectId=${projectId}&teamId=${teamId}`,
              });
            }}
          >
            管理班组成员
          </Button>
        </>
      ) : null}
    </Screen>
  );
}
