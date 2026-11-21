import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";

import { ChipsRow } from "../../components/member-role-editor/form-rows";
import { TeamSiteEntries } from "../../components/team-site/index";
import {
  joinText,
  maskPhone,
  personInitial,
} from "../../components/member-role-editor/person-text";
import {
  BottomBar,
  Button,
  Check,
  FormArea,
  FormInput,
  Links,
  Notice,
  PageHeader,
  Row,
  Screen,
  SearchField,
  SectionTitle,
  Sheet,
  SkeletonRows,
  StateView,
} from "../../components/ui/index";
import { useManagedProjectId } from "../../hooks/use-management-scope";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import type {
  ManagedParticipant,
  ManagedTeam,
  ParticipantPage,
} from "../../services/management.types";
import {
  fetchManagedTeam,
  fetchParticipantPage,
  fetchTeamLeaderHistory,
  updateTeam,
  type TeamLeaderChange,
} from "../../services/workflows";
import { leaderChangeLine } from "./leader-history";
import { useSession } from "../../store/session";
import { errorMessage } from "../../services/error-messages";

import "./index.scss";

const NAME_REQUIRED = "请填写班组名称。";
const STATUS_OPTIONS = [
  { value: "ACTIVE" as const, label: "正常" },
  { value: "SUSPENDED" as const, label: "暂停" },
];

export default function TeamDetail(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const projectId: string | null = useManagedProjectId(state.me);
  const teamId: string | undefined = Taro.useRouter().params.teamId;
  const { revision, refresh } = usePageRefresh();
  // 两个视图：班组资料、选负责人。同一个页面里切换。
  const [view, setView] = useState<"main" | "leader">("main");
  const [team, setTeam] = useState<ManagedTeam | null>(null);
  // 页头写的是已经保存的班组名，不跟着正在输入的字变。
  const [savedName, setSavedName] = useState<string | null>(null);
  const [people, setPeople] = useState<ParticipantPage | null>(null);
  const [searchInput, setSearchInput] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  // 负责人变更记录；读不到就不显示这一段，不挡班组资料。
  // 保存后重读负责人变更记录，换的人马上出现在下面。
  const [historyVersion, setHistoryVersion] = useState<number>(0);
  const [history, setHistory] = useState<readonly TeamLeaderChange[] | null>(
    null,
  );
  const [allHistory, setAllHistory] = useState<boolean>(false);
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
          setSavedName(data.name);
          setError(null);
        }
      },
      (failure: unknown): void => {
        if (!cancelled) setError(errorMessage(failure, "读取班组失败"));
      },
    );
    return (): void => {
      cancelled = true;
    };
  }, [projectId, teamId, revision]);
  useEffect(() => {
    if (!projectId || !teamId) return;
    let cancelled: boolean = false;
    void fetchTeamLeaderHistory(projectId, teamId).then(
      (rows): void => {
        if (!cancelled) setHistory(rows);
      },
      (): void => {
        if (!cancelled) setHistory(null);
      },
    );
    return (): void => {
      cancelled = true;
    };
  }, [projectId, teamId, revision, historyVersion]);
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
        if (!cancelled) setError(errorMessage(failure, "读取成员失败"));
      },
    );
    return (): void => {
      cancelled = true;
    };
  }, [projectId, teamId, page, search, revision]);
  const save = async (): Promise<void> => {
    if (!projectId || !teamId || !team || busy) return;
    if (!team.name.trim()) {
      setError(NAME_REQUIRED);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const saved = await updateTeam(projectId, teamId, {
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
      });
      setTeam(saved);
      setSavedName(saved.name);
      setHistoryVersion((value) => value + 1);
      await Taro.showToast({ title: "班组资料已保存", icon: "success" });
    } catch (failure: unknown) {
      setError(errorMessage(failure, "保存班组失败"));
    } finally {
      setBusy(false);
    }
  };

  const title = savedName ?? "班组资料";
  if (!projectId || !teamId)
    return (
      <Screen header={<PageHeader title={title} />}>
        <StateView kind="empty" title="请从班组管理进入" />
      </Screen>
    );
  if (team === null)
    return (
      <Screen header={<PageHeader title={title} />}>
        {error ? (
          <StateView
            kind="error"
            title="班组资料没读到"
            sub={error}
            onRetry={refresh}
          />
        ) : (
          <StateView kind="loading" title="正在读取班组资料" />
        )}
      </Screen>
    );

  if (view === "leader") {
    const choose = (person: ManagedParticipant | null): void => {
      setTeam({
        ...team,
        leader:
          person === null
            ? null
            : {
                memberId: person.memberId,
                participantType: person.participantType,
                displayName: person.displayName,
                phone: person.phone,
              },
      });
      setView("main");
    };
    const hasPrevious = page > 1;
    const hasNext = people !== null && page * people.pageSize < people.total;
    return (
      <Screen
        header={<PageHeader title="选负责人" onBack={() => setView("main")} />}
      >
        <Sheet gap>
          <Row title="不设负责人" onClick={() => choose(null)}>
            <Check round checked={team.leader === null} />
          </Row>
        </Sheet>
        <SearchField
          value={searchInput}
          placeholder="搜索姓名、手机号或工种"
          onInput={setSearchInput}
        />
        {people === null ? (
          error ? (
            <StateView
              kind="error"
              title="成员没读到"
              sub={error}
              onRetry={refresh}
            />
          ) : (
            <SkeletonRows rows={4} gap />
          )
        ) : people.items.length === 0 ? (
          <StateView
            kind="empty"
            title="没有符合的在场成员"
            sub={
              search
                ? "换个关键词再试。"
                : "先到班组成员里加人，再来指定负责人。"
            }
          />
        ) : (
          <Sheet gap>
            {people.items.map((person) => (
              <Row
                key={person.memberId}
                title={person.displayName ?? "姓名待补录"}
                avatar={personInitial(person.displayName)}
                sub={joinText([
                  person.workType ?? "工种待补录",
                  maskPhone(person.phone),
                ])}
                onClick={() => choose(person)}
              >
                <Check
                  round
                  checked={team.leader?.memberId === person.memberId}
                />
              </Row>
            ))}
          </Sheet>
        )}
        {hasPrevious || hasNext ? (
          <Links>
            {hasPrevious ? (
              <Button variant="text" onClick={() => setPage(page - 1)}>
                上一页
              </Button>
            ) : null}
            {hasNext ? (
              <Button variant="text" onClick={() => setPage(page + 1)}>
                下一页
              </Button>
            ) : null}
          </Links>
        ) : null}
        <Notice>
          只能从本班组在场的成员里选。选好后回到班组资料，点“保存”才生效。
        </Notice>
      </Screen>
    );
  }

  return (
    <Screen header={<PageHeader title={title} />}>
      <Sheet gap>
        <FormInput
          label="班组名称"
          required
          value={team.name}
          placeholder="例如：钢筋一班"
          maxLength={30}
          error={error === NAME_REQUIRED && !team.name.trim()}
          onInput={(name) => setTeam({ ...team, name })}
        />
        <FormInput
          label="主要工种"
          value={team.workType ?? ""}
          placeholder="例如：钢筋工、电工"
          maxLength={40}
          onInput={(workType) => setTeam({ ...team, workType })}
        />
        <ChipsRow
          label="状态"
          options={STATUS_OPTIONS}
          selected={[team.status === "ACTIVE" ? "ACTIVE" : "SUSPENDED"]}
          onToggle={(status) => setTeam({ ...team, status })}
        />
        <FormArea
          label="备注"
          value={team.remark ?? ""}
          placeholder="班组的工作安排"
          maxLength={1000}
          onInput={(remark) => setTeam({ ...team, remark })}
        />
      </Sheet>

      <SectionTitle>负责人</SectionTitle>
      <Sheet>
        <Row
          title={
            team.leader
              ? (team.leader.displayName ?? "姓名待补录")
              : "还没有负责人"
          }
          avatar={
            team.leader ? personInitial(team.leader.displayName) : undefined
          }
          sub={
            team.leader
              ? maskPhone(team.leader.phone)
              : "从本班组在场的成员里指定"
          }
          onClick={() => {
            // 名单已经读到时，上一次的出错说明和选负责人无关，不带过去。
            if (people !== null) setError(null);
            setView("leader");
          }}
        >
          <View className="team-detail__link">
            {team.leader ? "更换" : "指定"}
          </View>
        </Row>
      </Sheet>
      <Notice>
        负责人管联络，审批补卡需要班组长权限。负责人转组、暂停或退场后会自动取消。
      </Notice>
      {history !== null ? (
        <>
          <SectionTitle
            {...(history.length > 3
              ? {
                  action: allHistory ? "收起" : `全部 ${history.length} 条`,
                  onAction: (): void => setAllHistory((value) => !value),
                }
              : {})}
          >
            负责人变更
          </SectionTitle>
          {history.length === 0 ? (
            <Notice>还没有变更记录。2026年11月20日以后的变更才有记录。</Notice>
          ) : (
            <Sheet>
              {(allHistory ? history : history.slice(0, 3)).map((change) => {
                const line = leaderChangeLine(change);
                return (
                  <Row key={change.id} title={line.title} sub={line.sub} />
                );
              })}
            </Sheet>
          )}
        </>
      ) : null}

      <Sheet gap>
        <Row
          title="班组成员"
          value={`在场 ${team.memberCount} 人`}
          icon="users"
          mute
          chevron
          onClick={() => {
            void Taro.navigateTo({
              url: `/pages/participants/index?projectId=${projectId}&teamId=${teamId}`,
            });
          }}
        />
      </Sheet>
      <SectionTitle>班组现场</SectionTitle>
      <TeamSiteEntries projectId={projectId} teamId={teamId} />
      {error ? <Notice tone="error">{error}</Notice> : null}
      <BottomBar
        primary={busy ? "保存中…" : "保存"}
        busy={busy}
        onPrimary={() => {
          void save();
        }}
      />
    </Screen>
  );
}
