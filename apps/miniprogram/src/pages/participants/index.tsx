import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";

import {
  Field,
  Button,
  Subtitle,
  ListItem,
  PageHeader,
  Screen,
  Segmented,
  StateView,
} from "../../components/ui/index";
import { useManagedProjectId } from "../../hooks/use-management-scope";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSessionGuard } from "../../hooks/use-session-guard";
import {
  participantPermissionRole,
  permissionLevel,
  type ProjectPermissionRole,
} from "../../routing/permissionLevels";
import { displayProjectRole } from "../../routing/features";
import type {
  ManagedParticipant,
  ParticipantPage,
} from "../../services/management.types";
import { fetchParticipantPage } from "../../services/workflows";
import { useSession } from "../../store/session";

type Filter = "ALL" | ProjectPermissionRole;
const FILTER_OPTIONS = [
  { label: "全部", value: "ALL" as const },
  { label: "一级", value: "WORKER" as const },
  { label: "二级", value: "TEAM_LEADER" as const },
  { label: "三级", value: "PROJECT_ADMIN" as const },
];

const participantDescription = (person: ManagedParticipant): string =>
  [
    ...new Set([
      person.workType ?? "工种待补录",
      displayProjectRole(person.projectRoleLabel),
      person.teamName ?? "无班组",
      person.phone,
    ]),
  ].join(" · ");

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
        if (!cancelled)
          setError(failure instanceof Error ? failure.message : "读取人员失败");
      },
    );
    return (): void => {
      cancelled = true;
    };
  }, [projectId, page, search, filter, teamId, revision]);

  if (projectId === null)
    return (
      <Screen>
        <PageHeader title="项目人员" />
        <StateView title="请先选择项目" sub="当前账号需要项目管理权限。" />
      </Screen>
    );
  return (
    <Screen>
      <PageHeader title="项目人员" />
      <View className="management-actions">
        <Button
          onClick={() => {
            void Taro.navigateTo({
              url: `/pages/person-form/index?projectId=${projectId}${teamId ? `&teamId=${teamId}` : ""}`,
            });
          }}
        >
          ＋ 添加成员
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            void Taro.navigateTo({
              url: `/pages/person-reuse/index?projectId=${projectId}${teamId ? `&teamId=${teamId}` : ""}`,
            });
          }}
        >
          复用人员
        </Button>
      </View>
      <View
        className="management-link"
        onClick={() => {
          void Taro.navigateTo({
            url: `/pages/face-review/index?projectId=${projectId}`,
          });
        }}
      >
        人脸档案审核 ›
      </View>
      <Field
        value={searchInput}
        placeholder="搜索姓名前缀、手机号、班组或工种"
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
      <Subtitle>一级：本人 · 二级：班组 · 三级：项目管理</Subtitle>
      {result === null && error === null ? <StateView title="加载中…" /> : null}
      {error !== null ? (
        <StateView title="加载失败" sub={error} onRetry={refresh} />
      ) : null}
      {result !== null ? (
        <Subtitle>
          共 {result.total} 名成员 · 第 {page} 页
        </Subtitle>
      ) : null}
      {result !== null && result.items.length === 0 ? (
        <StateView title="没有符合条件的成员" />
      ) : null}
      <View>
        {result?.items.map((person) => (
          <ListItem
            key={person.memberId}
            primary={
              person.nameStatus === "REQUIRES_UPDATE"
                ? "姓名待补录"
                : (person.displayName ?? "姓名待补录")
            }
            secondary={participantDescription(person)}
            chip={
              person.status === "EXITED"
                ? "已退场"
                : person.status === "SUSPENDED"
                  ? "已暂停"
                  : permissionLevel(
                      participantPermissionRole(person),
                    ).label.split(" · ")[0]
            }
            onClick={() => {
              void Taro.navigateTo({
                url: `/pages/person-form/index?projectId=${projectId}&memberId=${person.memberId}`,
              });
            }}
          />
        ))}
      </View>
      {result !== null && page > 1 ? (
        <Button variant="outline" onClick={() => setPage(page - 1)}>
          上一页
        </Button>
      ) : null}
      {result !== null && page * result.pageSize < result.total ? (
        <Button variant="outline" onClick={() => setPage(page + 1)}>
          下一页
        </Button>
      ) : null}
    </Screen>
  );
}
