import { useEffect, useState } from "react";

import { TeamSiteEntries } from "../../components/team-site/index";
import {
  Notice,
  PageHeader,
  Row,
  Screen,
  SectionTitle,
  Sheet,
  StateView,
} from "../../components/ui/index";
import { useManagedProjectId } from "../../hooks/use-management-scope";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { errorMessage } from "../../services/error-messages";
import { fetchProjectTeams } from "../../services/management";
import type { ProjectTeam } from "../../services/management.types";
import { useSession } from "../../store/session";

/**
 * 班组现场：项目管理员先挑班组，再进入这个班组的工作安排、安全、日报、违规登记和考勤，
 * 和班组长看到的是同一批页面，可以替组长操作（2026-11-20 的决定 4）。
 */
export default function TeamSite(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const projectId = useManagedProjectId(state.me);
  const { revision, refresh } = usePageRefresh();
  const [teams, setTeams] = useState<readonly ProjectTeam[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setError(null);
    void fetchProjectTeams(projectId).then(
      (rows) => {
        if (!cancelled) setTeams(rows);
      },
      (cause: unknown) => {
        if (!cancelled) setError(errorMessage(cause, "班组没读到"));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [projectId, revision]);

  const team = teams?.find((row) => row.id === teamId) ?? null;
  const header = (
    <PageHeader
      title={team?.name ?? "班组现场"}
      onBack={team === null ? undefined : () => setTeamId(null)}
    />
  );
  if (!projectId)
    return (
      <Screen header={header}>
        <StateView kind="empty" title="请从项目工作台进入" />
      </Screen>
    );
  if (teams === null)
    return (
      <Screen header={header}>
        {error ? (
          <StateView title="班组没读到" sub={error} onRetry={refresh} />
        ) : (
          <StateView title="正在读取班组" />
        )}
      </Screen>
    );
  if (team !== null)
    return (
      <Screen header={header}>
        <TeamSiteEntries projectId={projectId} teamId={team.id} />
        <Notice>你在这里办的事和班组长自己办的一样，会记在你名下。</Notice>
      </Screen>
    );
  const active = teams.filter((row) => row.status === "ACTIVE");
  return (
    <Screen header={header}>
      {active.length === 0 ? (
        <StateView
          kind="empty"
          title="项目里还没有在用的班组"
          sub="先到班组管理里建一个。"
        />
      ) : (
        <>
          <SectionTitle>选择班组</SectionTitle>
          <Sheet>
            {active.map((row) => (
              <Row
                key={row.id}
                title={row.name}
                chevron
                onClick={() => setTeamId(row.id)}
              />
            ))}
          </Sheet>
        </>
      )}
    </Screen>
  );
}
