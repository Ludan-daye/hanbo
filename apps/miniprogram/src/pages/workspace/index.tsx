import { useEffect, useState } from "react";

import { RolePanel, ScopeChooser } from "../../components/role-panels/index";
import { scopeKey, scopeLine } from "../../components/role-panels/scope";
import {
  AppHeader,
  BottomNav,
  Row,
  Screen,
  SectionTitle,
  Sheet,
  StateView,
} from "../../components/ui/index";
import { useCachedRead } from "../../hooks/use-cached-read";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { PANEL_LABELS } from "../../routing/features";
import { roleHomePanel, type PanelKey } from "../../routing/roleHome";
import { errorMessage } from "../../services/error-messages";
import {
  fetchPendingMakeups,
  type PendingMakeup,
} from "../../services/makeups";
import {
  fetchMyRoleScopes,
  fetchProjectOverview,
} from "../../services/management";
import type {
  ProjectOverview,
  WorkRoleScope,
} from "../../services/management.types";
import { chinaToday } from "../../services/time";
import { projectAdminStatuses } from "../home/home-model";
import { useSession } from "../../store/session";

// 每个职级的入口归在哪个标题下。
const GROUP_TITLE: Readonly<Record<PanelKey, string>> = {
  worker: "本人",
  teamLeader: "班组",
  projectAdmin: "项目",
  companyAdmin: "公司",
  systemAdmin: "平台",
  none: "",
};
const APPROVALS_URL = "/pages/team-makeups/index";

/**
 * 工作台只放管理的事，每个入口带一句说明。兼任几个职级的人在顶上切换。
 * 本人的项目、任务、考勤和补卡在“我的”里。
 */
export default function Workspace(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const { revision, refresh } = usePageRefresh();
  const [scopes, setScopes] = useState<readonly WorkRoleScope[] | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choosing, setChoosing] = useState<boolean>(false);
  const userId = state.me?.user.id;
  useEffect(() => {
    let cancelled = false;
    setError(null);
    void fetchMyRoleScopes()
      .then((rows) => {
        if (!cancelled) setScopes(rows);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(errorMessage(cause, "读取工作范围失败"));
      });
    return () => {
      cancelled = true;
    };
  }, [revision, userId]);
  const selected: WorkRoleScope | undefined =
    scopes?.find((scope) => scopeKey(scope) === selectedKey) ?? scopes?.[0];
  const panel = roleHomePanel(selected?.roleCode ?? null);
  // 班组长的补卡审批后面写还有几条没批。和首页用同一份缓存，刚从首页过来不用再读。
  const teamId =
    selected?.roleCode === "TEAM_LEADER" && selected.scopeType === "TEAM"
      ? selected.scopeId
      : null;
  const pending = useCachedRead<readonly PendingMakeup[]>(
    userId === undefined || teamId === null
      ? null
      : `${userId}:team-pending-makeups:${teamId}`,
    () => fetchPendingMakeups(teamId ?? ""),
    revision,
  );
  const pendingCount = pending.data?.length ?? 0;
  // 项目管理员的补卡、违规、底照三项后面写待办数，和首页同一份概览缓存。
  const projectId =
    selected?.roleCode === "PROJECT_ADMIN" && selected.scopeType === "PROJECT"
      ? selected.scopeId
      : null;
  const date = chinaToday();
  const overview = useCachedRead<ProjectOverview>(
    userId === undefined || projectId === null
      ? null
      : `${userId}:project-overview:${projectId}:${date}`,
    () => fetchProjectOverview(projectId ?? "", date),
    revision,
  );
  const statuses =
    projectId !== null
      ? projectAdminStatuses(overview.data?.todos ?? null)
      : pendingCount > 0
        ? {
            [APPROVALS_URL]: {
              kind: "warn" as const,
              text: `${pendingCount} 条`,
            },
          }
        : undefined;

  return (
    <Screen header={<AppHeader title="工作台" />}>
      {error ? (
        <StateView title="工作范围读取失败" sub={error} onRetry={refresh} />
      ) : scopes === null ? (
        <StateView title="正在读取工作范围" />
      ) : selected === undefined ? (
        <StateView
          kind="empty"
          title="还没有分配角色"
          sub="管理员给你分配角色以后，这里会出现你能管的事。"
        />
      ) : choosing ? (
        <ScopeChooser
          title="选择职级和范围"
          scopes={scopes}
          current={selected}
          showRole
          onChoose={(scope) => {
            setSelectedKey(scopeKey(scope));
            setChoosing(false);
          }}
          onCancel={() => setChoosing(false)}
        />
      ) : (
        <>
          <Sheet gap>
            <Row
              title={PANEL_LABELS[panel]}
              sub={scopeLine(selected)}
              value={scopes.length > 1 ? "切换" : undefined}
              chevron={scopes.length > 1}
              onClick={scopes.length > 1 ? () => setChoosing(true) : undefined}
            />
          </Sheet>
          <SectionTitle>{GROUP_TITLE[panel]}</SectionTitle>
          <RolePanel
            panel={panel}
            scope={selected}
            statuses={statuses}
          />
        </>
      )}
      <BottomNav active="workspace" />
    </Screen>
  );
}
