import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";

import { MemberRoleEditor } from "../../components/member-role-editor";
import {
  DateRow,
  SelectRow,
} from "../../components/member-role-editor/form-rows";
import {
  joinText,
  personInitial,
} from "../../components/member-role-editor/person-text";
import {
  BottomBar,
  Button,
  Check,
  FormInput,
  FormSwitch,
  Links,
  Notice,
  PageHeader,
  Row,
  Screen,
  SearchField,
  SectionTitle,
  Sheet,
  SignLine,
  SkeletonRows,
  StateView,
} from "../../components/ui/index";
import { useManagedProjectId } from "../../hooks/use-management-scope";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { participantPermissionRole } from "../../routing/permissionLevels";
import { memberRoleFields } from "../../services/member-roles";
import type {
  ManagedParticipant,
  MemberRoleAssignment,
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
import { errorMessage } from "../../services/error-messages";

const sourceStatus = (status: ManagedParticipant["status"]): string =>
  status === "EXITED"
    ? "原项目已退场"
    : status === "SUSPENDED"
      ? "原项目暂停"
      : "原项目在场";

export default function PersonReuse(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const projectId: string | null = useManagedProjectId(state.me);
  const initialTeamId: string | undefined = Taro.useRouter().params.teamId;
  // 两步：先选人，再安排岗位。同一个页面里切换。
  const [step, setStep] = useState<"pick" | "arrange">("pick");
  const [sources, setSources] = useState<readonly ReuseProject[] | null>(null);
  const [sourcesAttempt, setSourcesAttempt] = useState<number>(0);
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
  // 点过“加入本项目”、没通过检查之后，把有问题的行标出来。
  const [checked, setChecked] = useState<boolean>(false);
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
        if (!cancelled) setError(errorMessage(failure, "读取可复用项目失败"));
      },
    );
    return (): void => {
      cancelled = true;
    };
  }, [projectId, sourcesAttempt]);
  useEffect(() => {
    const timer = setTimeout((): void => {
      const next = searchInput.trim();
      // 名单换了，原来选的人可能已经不在眼前：不能让“下一步”对着看不见的人。
      if (next !== search || page !== 1) setSelected(null);
      setSearch(next);
      setPage(1);
    }, 350);
    return (): void => clearTimeout(timer);
  }, [searchInput]);
  useEffect(() => {
    if (!sourceId) return;
    let cancelled: boolean = false;
    setPeople(null);
    setError(null);
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
        if (!cancelled) setError(errorMessage(failure, "读取来源人员失败"));
      },
    );
    return (): void => {
      cancelled = true;
    };
  }, [sourceId, page, search, revision]);
  const choose = (person: ManagedParticipant): void => {
    try {
      const primaryRole = participantPermissionRole(person);
      setSelected(person);
      setRoles([
        {
          roleCode: primaryRole,
          teamId: primaryRole === "TEAM_LEADER" ? (initialTeamId ?? "") : null,
        },
      ]);
      setRole(
        ["WORKER", "TEAM_LEADER", "PROJECT_ADMIN"].includes(
          person.projectRoleLabel,
        )
          ? (person.workType ?? "")
          : person.projectRoleLabel,
      );
      setChecked(false);
      setError(null);
    } catch (failure: unknown) {
      setError(errorMessage(failure, "这个人的岗位资料有问题，暂时不能复用。"));
    }
  };
  const reselect = (): void => {
    setSelected(null);
    setRevision(revision + 1);
    setError(null);
    setChecked(false);
    setStep("pick");
  };
  const submit = async (): Promise<void> => {
    if (!projectId || !selected || busy) return;
    let fields: ReturnType<typeof memberRoleFields>;
    try {
      fields = memberRoleFields(
        roles,
        selected.participantType === "MANAGER" ? "WORKER" : role.trim(),
        teamId,
      );
      if (!fields.projectRoleLabel) throw new Error("请填写本项目岗位。");
    } catch (failure: unknown) {
      setChecked(true);
      setError(errorMessage(failure, "请检查本项目的身份。"));
      return;
    }
    const confirmation = await Taro.showModal({
      title: "确认加入本项目",
      content: "沿用档案和微信绑定，保留原项目记录。",
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
      setError(errorMessage(failure, "加入项目失败"));
    } finally {
      setBusy(false);
    }
  };

  if (!projectId)
    return (
      <Screen header={<PageHeader title="复用人员" />}>
        <StateView kind="empty" title="请从项目人员页面进入" />
      </Screen>
    );

  if (step === "arrange" && selected !== null) {
    // 只是工人时，才需要填岗位、选考勤班组；班组长和管理员的班组由身份决定。
    const onlyWorker = !roles.some(
      (assignment) => assignment.roleCode !== "WORKER",
    );
    return (
      <Screen header={<PageHeader title="安排岗位" onBack={reselect} />}>
        <Sheet gap>
          <Row
            title={selected.displayName ?? "姓名待补录"}
            avatar={personInitial(selected.displayName)}
            sub={joinText([
              selected.workType ?? "工种待补录",
              selected.phone,
              sourceStatus(selected.status),
            ])}
          />
        </Sheet>
        <SectionTitle>在本项目</SectionTitle>
        <Sheet>
          <MemberRoleEditor
            value={roles}
            onChange={setRoles}
            teams={teams}
            disabled={busy}
            invalid={checked}
          />
          {onlyWorker && selected.participantType === "WORKER" ? (
            <FormInput
              label="本项目岗位"
              required
              value={role}
              placeholder="例如：照明安装"
              maxLength={40}
              error={checked && !role.trim()}
              onInput={setRole}
            />
          ) : null}
          {onlyWorker ? (
            <SelectRow
              label="班组"
              options={["暂不分配", ...teams.map((team) => team.name)]}
              index={teams.findIndex((team) => team.id === teamId) + 1}
              value={teams.find((team) => team.id === teamId)?.name ?? ""}
              placeholder="暂不分配"
              onChange={(picked) => setTeamId(teams[picked - 1]?.id ?? null)}
            />
          ) : null}
          <DateRow
            label="进场日期"
            value={formatChinaDate(enteredAt)}
            end={chinaToday()}
            onChange={(value) =>
              setEnteredAt(new Date(`${value}T00:00:00+08:00`).toISOString())
            }
          />
          <FormSwitch
            label="参与考勤"
            checked={requiresAttendance}
            onChange={setRequiresAttendance}
          />
        </Sheet>
        <Notice>
          {`加到${targetName ?? "本项目"}后，沿用原档案和微信绑定，原项目的记录保留。`}
        </Notice>
        {error ? <Notice tone="error">{error}</Notice> : null}
        <BottomBar
          primary={busy ? "加入中…" : "加入本项目"}
          busy={busy}
          onPrimary={() => {
            void submit();
          }}
        >
          <Button variant="text" disabled={busy} onClick={reselect}>
            重新选人
          </Button>
        </BottomBar>
      </Screen>
    );
  }

  const source = sources?.find((row) => row.id === sourceId);
  const hasPrevious = page > 1;
  const hasNext = people !== null && page * people.pageSize < people.total;
  return (
    <Screen header={<PageHeader title="复用人员" />}>
      <SignLine
        title={`加到 ${targetName ?? "本项目"}`}
        sub="沿用原档案和微信绑定，原项目的记录保留"
      />
      {sources === null ? (
        error ? (
          <StateView
            kind="error"
            title="可以复用的项目没读到"
            sub={error}
            onRetry={() => {
              setError(null);
              setSourcesAttempt(sourcesAttempt + 1);
            }}
          />
        ) : (
          <StateView kind="loading" title="正在读取可以复用的项目" />
        )
      ) : sources.length === 0 ? (
        <StateView
          kind="empty"
          title="没有可以调人的项目"
          sub="要同时管理本公司的另一个项目，才能把那里的人复用过来。"
        />
      ) : (
        <>
          <Sheet gap>
            <SelectRow
              label="从哪个项目"
              options={sources.map((row) => row.name)}
              index={sources.findIndex((row) => row.id === sourceId)}
              value={source?.name ?? ""}
              placeholder="请选择"
              onChange={(picked) => {
                const next = sources[picked];
                if (!next || next.id === sourceId) return;
                setSourceId(next.id);
                setSelected(null);
                setPage(1);
                setError(null);
              }}
            />
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
                title="人员没读到"
                sub={error}
                onRetry={() => {
                  setError(null);
                  setRevision(revision + 1);
                }}
              />
            ) : (
              <SkeletonRows rows={5} gap />
            )
          ) : people.items.length === 0 ? (
            <StateView
              kind="empty"
              title="没有找到人"
              sub={
                search ? "换个关键词再试。" : "这个项目里还没有可以复用的人。"
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
                    sourceStatus(person.status),
                  ])}
                  onClick={() => choose(person)}
                >
                  <Check
                    round
                    checked={selected?.memberId === person.memberId}
                  />
                </Row>
              ))}
            </Sheet>
          )}
          {hasPrevious || hasNext ? (
            <Links>
              {hasPrevious ? (
                <Button
                  variant="text"
                  onClick={() => {
                    setSelected(null);
                    setPage(page - 1);
                  }}
                >
                  上一页
                </Button>
              ) : null}
              {hasNext ? (
                <Button
                  variant="text"
                  onClick={() => {
                    setSelected(null);
                    setPage(page + 1);
                  }}
                >
                  下一页
                </Button>
              ) : null}
            </Links>
          ) : null}
          {error !== null && people !== null ? (
            <Notice tone="error">{error}</Notice>
          ) : null}
          <BottomBar
            primary="下一步：安排岗位"
            disabled={selected === null}
            onPrimary={() => setStep("arrange")}
          />
        </>
      )}
    </Screen>
  );
}
