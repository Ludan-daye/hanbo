import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";

import {
  joinText,
  personInitial,
  personRoleText,
} from "../../components/member-role-editor/person-text";
import {
  BottomBar,
  Button,
  Links,
  PageHeader,
  Row,
  Screen,
  SearchField,
  SectionTitle,
  Segmented,
  Sheet,
  SkeletonRows,
  StateView,
} from "../../components/ui/index";
import { useManagedProjectId } from "../../hooks/use-management-scope";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSessionGuard } from "../../hooks/use-session-guard";
import type { ProjectPermissionRole } from "../../routing/permissionLevels";
import type {
  ManagedParticipant,
  ParticipantPage,
} from "../../services/management.types";
import { fetchParticipantPage } from "../../services/workflows";
import { useSession } from "../../store/session";
import { errorMessage } from "../../services/error-messages";

type Filter = "ALL" | ProjectPermissionRole;
const FILTER_OPTIONS = [
  { label: "全部", value: "ALL" as const },
  { label: "工人", value: "WORKER" as const },
  { label: "班组长", value: "TEAM_LEADER" as const },
  { label: "管理员", value: "PROJECT_ADMIN" as const },
];

const personName = (person: ManagedParticipant): string | null =>
  person.nameStatus === "REQUIRES_UPDATE" ? null : person.displayName;

/** 行右侧：退场、暂停的写状态，其余写身份（普通工人不写）。 */
const PersonRow = ({
  person,
  onClick,
}: {
  readonly person: ManagedParticipant;
  readonly onClick: () => void;
}): JSX.Element => {
  const name = personName(person);
  const status =
    person.status === "EXITED"
      ? ({ kind: "idle", text: "已退场" } as const)
      : person.status === "SUSPENDED"
        ? ({ kind: "warn", text: "已暂停" } as const)
        : undefined;
  return (
    <Row
      title={name ?? "姓名待补录"}
      avatar={personInitial(name)}
      sub={joinText([person.workType ?? "工种待补录", person.teamName])}
      value={status ? undefined : personRoleText(person) || undefined}
      status={status}
      mute
      chevron
      onClick={onClick}
    />
  );
};

export default function Participants(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const { revision, refresh } = usePageRefresh();
  const teamId: string | undefined = Taro.useRouter().params.teamId;
  const projectId: string | null = useManagedProjectId(state.me);
  const [searchInput, setSearchInput] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [page, setPage] = useState<number>(1);
  const [result, setResult] = useState<ParticipantPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout((): void => {
      setPage(1);
      setSearch(searchInput.trim());
    }, 350);
    return (): void => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (projectId === null) return;
    let cancelled: boolean = false;
    setError(null);
    setResult(null);
    void fetchParticipantPage(projectId, {
      page,
      pageSize: 50,
      search,
      participantType: null,
      permissionRole: filter === "ALL" ? null : filter,
      teamId: teamId ?? null,
      status: null,
    }).then(
      (data): void => {
        if (!cancelled) setResult(data);
      },
      (failure: unknown): void => {
        if (!cancelled) setError(errorMessage(failure, "读取人员失败"));
      },
    );
    return (): void => {
      cancelled = true;
    };
  }, [projectId, page, search, filter, teamId, revision]);

  if (projectId === null)
    return (
      <Screen header={<PageHeader title="项目人员" />}>
        <StateView
          kind="empty"
          title="请先选择项目"
          sub="当前账号需要项目管理权限。"
        />
      </Screen>
    );

  const scope = teamId ? `&teamId=${teamId}` : "";
  const hasPrevious = result !== null && page > 1;
  const hasNext = result !== null && page * result.pageSize < result.total;
  const narrowed = search !== "" || filter !== "ALL";
  return (
    <Screen header={<PageHeader title="项目人员" />}>
      <SearchField
        value={searchInput}
        placeholder="搜索姓名、手机号、班组或工种"
        onInput={setSearchInput}
      />
      <Segmented
        options={FILTER_OPTIONS}
        value={filter}
        onChange={(value) => {
          setFilter(value);
          setPage(1);
        }}
      />
      <SectionTitle
        action="底照审核"
        onAction={() => {
          void Taro.navigateTo({
            url: `/pages/face-review/index?projectId=${projectId}`,
          });
        }}
      >
        {result === null
          ? teamId
            ? "这个班组的成员"
            : "成员"
          : `${teamId ? "这个班组" : ""}共 ${result.total} 人${
              hasPrevious || hasNext ? `，第 ${page} 页` : ""
            }`}
      </SectionTitle>
      {error !== null ? (
        <StateView
          kind="error"
          title="人员没读到"
          sub={error}
          onRetry={refresh}
        />
      ) : result === null ? (
        <SkeletonRows rows={6} />
      ) : result.items.length === 0 ? (
        <StateView
          kind="empty"
          title={narrowed ? "没有符合条件的成员" : "还没有成员"}
          sub={
            narrowed
              ? "换个关键词或筛选再试。"
              : "点下面的“添加成员”建档，或从别的项目复用。"
          }
        />
      ) : (
        <Sheet>
          {result.items.map((person) => (
            <PersonRow
              key={person.memberId}
              person={person}
              onClick={() => {
                void Taro.navigateTo({
                  url: `/pages/person-form/index?projectId=${projectId}&memberId=${person.memberId}`,
                });
              }}
            />
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
      <BottomBar
        primary="添加成员"
        onPrimary={() => {
          void Taro.navigateTo({
            url: `/pages/person-form/index?projectId=${projectId}${scope}`,
          });
        }}
      >
        <Button
          variant="outline"
          onClick={() => {
            void Taro.navigateTo({
              url: `/pages/person-reuse/index?projectId=${projectId}${scope}`,
            });
          }}
        >
          复用人员
        </Button>
      </BottomBar>
    </Screen>
  );
}
