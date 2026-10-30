import { MemberRoleEditor } from "../../components/member-role-editor";
import { memberRoleFields } from "../../services/member-roles";
import { participantPermissionRole } from "../../routing/permissionLevels";
import type { MemberRoleAssignment } from "../../services/management.types";
import { Picker, Switch, View } from "@tarojs/components";
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
  StateView,
} from "../../components/ui/index";
import { useManagedProjectId } from "../../hooks/use-management-scope";
import { useSessionGuard } from "../../hooks/use-session-guard";
import type {
  ManagedParticipant,
  ParticipantPage,
  ProjectTeam,
  ReuseProject,
} from "../../services/management.types";
import { fetchProjectTeams } from "../../services/management";
import {
  fetchParticipantPage,
  fetchProject,
  fetchReuseProjects,
  reusePerson,
} from "../../services/workflows";
import { chinaToday, formatChinaDate } from "../../services/time";
import { useSession } from "../../store/session";

export default function PersonReuse(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const projectId: string | null = useManagedProjectId(state.me);
  const initialTeamId: string | undefined = Taro.useRouter().params.teamId;
  const [sources, setSources] = useState<readonly ReuseProject[] | null>(null);
  const [targetName, setTargetName] = useState<string | null>(null);
  const [revision, setRevision] = useState<number>(0);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [teams, setTeams] = useState<readonly ProjectTeam[]>([]);
  const [teamId, setTeamId] = useState<string | null>(initialTeamId ?? null);
  const [people, setPeople] = useState<ParticipantPage | null>(null);
  const [selected, setSelected] = useState<ManagedParticipant | null>(null);
  const [roles, setRoles] = useState<readonly MemberRoleAssignment[]>([
    { roleCode: "WORKER", teamId: null },
  ]);
  const [role, setRole] = useState<string>("");
  const [searchInput, setSearchInput] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const [enteredAt, setEnteredAt] = useState<string>(new Date().toISOString());
  const [requiresAttendance, setRequiresAttendance] = useState<boolean>(true);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!projectId) return;
    let cancelled: boolean = false;
    void Promise.all([
      fetchReuseProjects(projectId),
      fetchProjectTeams(projectId),
      fetchProject(projectId),
    ]).then(
      ([projects, rows, project]): void => {
        if (!cancelled) {
          setSources(projects);
          setTeams(rows);
          setSourceId(projects[0]?.id ?? null);
          setTargetName(project.name);
        }
      },
      (failure: unknown): void => {
        if (!cancelled)
          setError(
            failure instanceof Error ? failure.message : "读取可复用项目失败",
          );
      },
    );
    return (): void => {
      cancelled = true;
    };
  }, [projectId]);
  useEffect(() => {
    const timer = setTimeout((): void => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return (): void => clearTimeout(timer);
  }, [searchInput]);
  useEffect(() => {
    if (!sourceId) return;
    let cancelled: boolean = false;
    setPeople(null);
    void fetchParticipantPage(sourceId, {
      page,
      pageSize: 50,
      search,
      teamId: null,
      participantType: null,
      status: null,
    }).then(
      (rows): void => {
        if (!cancelled) setPeople(rows);
      },
      (failure: unknown): void => {
        if (!cancelled)
          setError(
            failure instanceof Error ? failure.message : "读取来源人员失败",
          );
      },
    );
    return (): void => {
      cancelled = true;
    };
  }, [sourceId, page, search, revision]);
  const submit = async (): Promise<void> => {
    if (!projectId || !selected || busy) return;
    let fields: ReturnType<typeof memberRoleFields>;
    try {
      fields = memberRoleFields(
        roles,
        selected.participantType === "MANAGER" ? "WORKER" : role.trim(),
        teamId,
      );
      if (!fields.projectRoleLabel) throw new Error("请填写目标项目岗位。");
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : "请检查项目职级。");
      return;
    }
    const confirmation = await Taro.showModal({
      title: "确认加入本项目",
      content: "沿用此人的人员档案和微信绑定，保留原项目任职及历史。",
      confirmText: "确认加入",
    });
    if (!confirmation.confirm) return;
    setBusy(true);
    setError(null);
    try {
      await reusePerson(projectId, {
        sourceProjectId: selected.projectId,
        sourceMemberId: selected.memberId,
        participantType: selected.participantType,
        expectedSourceUpdatedAt: selected.updatedAt,
        expectedProfileUpdatedAt: selected.profileUpdatedAt,
        ...fields,
        enteredAt,
        requiresAttendance,
      });
      await Taro.showToast({ title: "人员已加入", icon: "success" });
      await Taro.navigateBack();
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : "加入项目失败");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      <PageHeader title="复用项目人员" />
      {targetName ? <Notice>目标项目：{targetName}</Notice> : null}
      <Notice>
        同一公司内复用人员，保留工种、微信绑定和原项目历史。来源项目与目标项目均需管理权限。
      </Notice>
      {error ? <Notice>{error}</Notice> : null}
      {!projectId ? (
        <StateView title="请从目标项目人员页面进入" />
      ) : sources === null && !error ? (
        <StateView title="加载中…" />
      ) : null}
      {sources?.length === 0 ? (
        <StateView
          title="暂无可复用项目"
          sub="需要同一公司内另一个项目的管理权限。"
        />
      ) : null}
      {sources && sources.length > 0 ? (
        <Section title="来源项目">
          {sources.map((source) => (
            <ListItem
              key={source.id}
              primary={source.name}
              chip={source.id === sourceId ? "已选" : "选择"}
              onClick={() => {
                setSourceId(source.id);
                setSelected(null);
                setPage(1);
                setError(null);
              }}
            />
          ))}
        </Section>
      ) : null}
      {sourceId && selected === null ? (
        <Section title="选择已有人员">
          <Field
            value={searchInput}
            placeholder="搜索来源人员姓名前缀、手机号或工种"
            onInput={setSearchInput}
          />
          {people === null ? (
            <StateView title="读取人员…" />
          ) : people.items.length === 0 ? (
            <StateView title="未找到人员" />
          ) : null}
          {people?.items.map((person) => (
            <ListItem
              key={person.memberId}
              primary={person.displayName ?? "姓名待补录"}
              secondary={`${person.workType ?? "工种待补录"} · ${person.phone} · ${person.status === "EXITED" ? "原项目已退场" : person.status === "SUSPENDED" ? "原项目暂停" : "原项目在场"}`}
              chip="选择"
              onClick={() => {
                setSelected(person);
                const primaryRole = participantPermissionRole(person);
                setRoles([
                  {
                    roleCode: primaryRole,
                    teamId:
                      primaryRole === "TEAM_LEADER"
                        ? (initialTeamId ?? "")
                        : null,
                  },
                ]);
                setRole(
                  ["WORKER", "TEAM_LEADER", "PROJECT_ADMIN"].includes(
                    person.projectRoleLabel,
                  )
                    ? (person.workType ?? "")
                    : person.projectRoleLabel,
                );
                setError(null);
              }}
            />
          ))}
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
      ) : null}
      {selected ? (
        <Section
          title="目标项目安排"
          sub={`已选：${selected.displayName ?? "姓名待补录"} · ${selected.workType ?? "工种待补录"}`}
        >
          <MemberRoleEditor
            value={roles}
            onChange={setRoles}
            teams={teams}
            disabled={busy}
          />
          {!roles.some((assignment) => assignment.roleCode !== "WORKER") ? (
            <>
              {selected.participantType === "WORKER" ? (
                <Field
                  label="本项目岗位 *"
                  value={role}
                  placeholder="例如：照明安装"
                  maxLength={40}
                  onInput={setRole}
                />
              ) : null}
              <Picker
                mode="selector"
                range={["暂不分配", ...teams.map((team) => team.name)]}
                value={teams.findIndex((team) => team.id === teamId) + 1}
                onChange={(event) =>
                  setTeamId(teams[Number(event.detail.value) - 1]?.id ?? null)
                }
              >
                <ListItem
                  primary="目标考勤班组"
                  secondary={
                    teams.find((team) => team.id === teamId)?.name ?? "暂不分配"
                  }
                  chip="选择"
                />
              </Picker>
            </>
          ) : null}
          <Picker
            mode="date"
            value={formatChinaDate(enteredAt)}
            end={chinaToday()}
            onChange={(event) =>
              setEnteredAt(
                new Date(`${event.detail.value}T00:00:00+08:00`).toISOString(),
              )
            }
          >
            <ListItem
              primary="本项目进场日期"
              secondary={formatChinaDate(enteredAt)}
              chip="选择"
            />
          </Picker>
          <View className="form-toggle">
            <View>参与考勤</View>
            <Switch
              checked={requiresAttendance}
              color="#246bfd"
              onChange={(event) => setRequiresAttendance(event.detail.value)}
            />
          </View>
          <Button
            loading={busy}
            onClick={() => {
              void submit();
            }}
          >
            加入本项目
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setSelected(null);
              setRevision(revision + 1);
              setError(null);
            }}
          >
            重新选择人员
          </Button>
        </Section>
      ) : null}
    </Screen>
  );
}
