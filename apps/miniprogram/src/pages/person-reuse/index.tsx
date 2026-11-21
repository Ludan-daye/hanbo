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
  Chips,
  FormInput,
  FormRow,
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
import { canGrantProjectAdmin } from "../../routing/projectAdmin";
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
import {
  fetchProjectTransfers,
  fetchTransferCandidates,
  fetchTransferSources,
  requestTransfer,
  transferStatusLabel,
  type TransferMode,
  type TransferRequest,
} from "../../services/transfers";

const TRANSFER_MODES: ReadonlyArray<{ readonly value: TransferMode; readonly label: string }> = [
  { value: "MOVE", label: "调走" },
  { value: "CONCURRENT", label: "兼任" },
];
import { useSession } from "../../store/session";
import { errorMessage } from "../../services/error-messages";

/**
 * 来源项目：自己也管的项目直接复用；本公司别的项目要向公司管理员申请（决定 6）。
 */
type SourceProject = ReuseProject & { readonly request: boolean };

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
  const [sources, setSources] = useState<readonly SourceProject[] | null>(null);
  const [transfers, setTransfers] = useState<readonly TransferRequest[]>([]);
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
  // 向公司申请时选调走（默认，原项目办退场）还是兼任（Q11）。
  const [mode, setMode] = useState<TransferMode>("MOVE");
  const [busy, setBusy] = useState<boolean>(false);
  // 提交后停在结果上说清楚办成了什么，不再一声不响地退回去。
  const [done, setDone] = useState<{ readonly title: string; readonly sub: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 点过“加入本项目”、没通过检查之后，把有问题的行标出来。
  const [checked, setChecked] = useState<boolean>(false);
  useEffect(() => {
    if (!projectId) return;
    let cancelled: boolean = false;
    void Promise.all([
      fetchReuseProjects(projectId),
      fetchTransferSources(projectId),
      fetchProjectTeams(projectId),
      fetchProject(projectId),
      // 申请记录没读到不挡选人。
      fetchProjectTransfers(projectId).catch(
        (): readonly TransferRequest[] => [],
      ),
    ]).then(
      ([projects, others, rows, project, requests]): void => {
        if (!cancelled) {
          const all: readonly SourceProject[] = [
            ...projects.map((row) => ({ ...row, request: false })),
            ...others.map((row) => ({ ...row, request: true })),
          ];
          setSources(all);
          setTeams(rows);
          setSourceId(all[0]?.id ?? null);
          setTargetName(project.name);
          setTransfers(requests);
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
  const source = sources?.find((row) => row.id === sourceId);
  const requesting: boolean = source?.request === true;
  useEffect(() => {
    if (!sourceId || !projectId) return;
    let cancelled: boolean = false;
    setPeople(null);
    setError(null);
    void (
      requesting
        ? fetchTransferCandidates(projectId, sourceId, {
            page,
            pageSize: 50,
            search,
          })
        : fetchParticipantPage(sourceId, {
            page,
            pageSize: 50,
            search,
            teamId: null,
            participantType: null,
            status: null,
            notInProjectId: projectId,
          })
    ).then(
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
  }, [sourceId, requesting, projectId, page, search, revision]);
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
      title: requesting ? "向公司管理员申请" : "确认加入本项目",
      content: requesting
        ? mode === "MOVE"
          ? "公司管理员同意后，他沿用档案和微信绑定加入本项目，原项目办退场。"
          : "公司管理员同意后，他沿用档案和微信绑定加入本项目，原项目身份照旧。"
        : "沿用档案和微信绑定，保留原项目记录。",
      confirmText: requesting ? "提交申请" : "确认加入",
    });
    if (!confirmation.confirm) return;
    setBusy(true);
    setError(null);
    try {
      if (requesting) {
        await requestTransfer(projectId, {
          sourceProjectId: selected.projectId,
          sourceMemberId: selected.memberId,
          participantType: selected.participantType,
          ...fields,
          enteredAt,
          mode,
          requiresAttendance,
        });
        setDone({
          title: "申请已提交",
          sub: `${selected.displayName ?? "这个人"}从${source?.name ?? "原项目"}调到${targetName ?? "本项目"}，等公司管理员同意后加入${mode === "MOVE" ? "，原项目在进场前一天办退场" : "，原项目身份照旧"}。进度在下面“调人申请”里看。`,
        });
        setStep("pick");
        setSelected(null);
        setTransfers(await fetchProjectTransfers(projectId).catch((): readonly TransferRequest[] => transfers));
        return;
      }
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
      setDone({
        title: "已加入本项目",
        sub: `${selected.displayName ?? "这个人"}已加入${targetName ?? "本项目"}，沿用原档案和微信绑定。`,
      });
      setStep("pick");
      setSelected(null);
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
            locked={canGrantProjectAdmin(state.me) ? [] : ["PROJECT_ADMIN"]}
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
          {requesting ? (
            <FormRow label="原项目">
              <Chips
                onSheet
                options={TRANSFER_MODES}
                selected={[mode]}
                onToggle={(value) => {
                  if (!busy) setMode(value);
                }}
              />
            </FormRow>
          ) : null}
        </Sheet>
        <Notice>
          {requesting
            ? `公司管理员同意后加到${targetName ?? "本项目"}，沿用原档案和微信绑定。${mode === "MOVE" ? "调走：原项目在进场前一天办退场，记录保留。" : "兼任：原项目的身份照旧。"}`
            : `加到${targetName ?? "本项目"}后，沿用原档案和微信绑定，原项目的记录保留。`}
        </Notice>
        {error ? <Notice tone="error">{error}</Notice> : null}
        <BottomBar
          primary={
            requesting
              ? busy
                ? "提交中…"
                : "提交申请"
              : busy
                ? "加入中…"
                : "加入本项目"
          }
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

  if (done !== null)
    return (
      <Screen header={<PageHeader title="复用人员" />}>
        <SignLine title={done.title} sub={done.sub} />
        {transfers.length > 0 ? (
          <>
            <SectionTitle>调人申请</SectionTitle>
            <Sheet>
              {transfers.slice(0, 5).map((row) => (
                <Row
                  key={row.id}
                  title={row.displayName ?? "姓名待补录"}
                  sub={`从${row.sourceProjectName}，${formatChinaDate(row.createdAt)}申请`}
                  status={transferStatusLabel(row.status)}
                />
              ))}
            </Sheet>
          </>
        ) : null}
        <BottomBar primary="完成" onPrimary={() => void Taro.navigateBack()}>
          <Button
            variant="text"
            onClick={() => {
              setDone(null);
              setRevision(revision + 1);
            }}
          >
            再加一个人
          </Button>
        </BottomBar>
      </Screen>
    );

  const hasPrevious = page > 1;
  const hasNext = people !== null && page * people.pageSize < people.total;
  return (
    <Screen header={<PageHeader title="复用人员" />}>
      <SignLine
        title={`加到 ${targetName ?? "本项目"}`}
        sub={
          requesting
            ? `${source?.name ?? "这个来源项目"}不归你管，从那里调人要公司管理员同意后才加入`
            : "沿用原档案和微信绑定，原项目的记录保留；已经在本项目的人不列出"
        }
      />
      {transfers.length > 0 ? (
        <>
          <SectionTitle>调人申请</SectionTitle>
          <Sheet>
            {transfers.slice(0, 5).map((row) => (
              <Row
                key={row.id}
                title={row.displayName ?? "姓名待补录"}
                sub={`从${row.sourceProjectName}，${formatChinaDate(row.createdAt)}申请`}
                status={transferStatusLabel(row.status)}
              />
            ))}
          </Sheet>
        </>
      ) : null}
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
          sub="本公司还没有别的项目。"
        />
      ) : (
        <>
          <Sheet gap>
            <SelectRow
              label="从哪个项目"
              options={sources.map((row) =>
                row.request ? `${row.name}（需申请）` : row.name,
              )}
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
