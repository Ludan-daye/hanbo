import { RoleGrid } from "../../../components/role-panels/index";
import {
  Sign,
  SignButton,
  SignText,
  SkeletonSign,
} from "../../../components/ui/index";
import { useCachedRead } from "../../../hooks/use-cached-read";
import { useMyProjectAttendance } from "../../../hooks/use-my-project-attendance";
import { usePageRefresh } from "../../../hooks/use-page-refresh";
import type { MeResponse } from "../../../services/auth.types";
import {
  fetchPendingMakeups,
  type PendingMakeup,
} from "../../../services/makeups";
import { fetchTeamDailyReport } from "../../../services/management";
import type { DailyReport } from "../../../services/management.types";
import { chinaToday } from "../../../services/time";
import { leaderPunchSummary } from "../../../services/worker-home-selection";
import {
  leaderMakeupTodos,
  leaderMissingText,
  leaderPunchTodos,
} from "../home-model";
import { useHomeScope } from "../use-home-scope";

import {
  AttendanceSign,
  go,
  HomeScopeChooser,
  HomeShell,
  scopeTitle,
  TodoSheet,
  useAnnouncement,
  usePullRefresh,
} from "./parts";

/**
 * 班组长首页：标牌说今天几个人到岗、谁缺卡；自己的卡和本班待审批的补卡排在“等你处理”；
 * 下面是班组的六个入口。工人名单在班组考勤里，本人的考勤、补卡、任务在“我的”里。
 */
export const LeaderHome = ({
  me,
}: {
  readonly me: MeResponse;
}): JSX.Element => {
  const userId = me.user.id;
  const { revision, refresh } = usePageRefresh();
  const choice = useHomeScope({
    me,
    roleCode: "TEAM_LEADER",
    scopeType: "TEAM",
    revision,
    waitForList: true,
  });
  const team = choice.scope;
  const teamId = team?.scopeId ?? null;
  const date = chinaToday();
  // 都先用上次的数据显示，再去核对；键里带用户编号。
  const report = useCachedRead<DailyReport>(
    teamId === null ? null : `${userId}:team-daily:${teamId}:${date}`,
    () => fetchTeamDailyReport(teamId ?? "", date),
    revision,
    "读取班组工作信息失败，请重试。",
  );
  const pending = useCachedRead<readonly PendingMakeup[]>(
    teamId === null ? null : `${userId}:team-pending-makeups:${teamId}`,
    () => fetchPendingMakeups(teamId ?? ""),
    revision,
    "补卡申请没读到，请重试。",
  );
  const mine = useMyProjectAttendance(revision, refresh);
  const settings = useAnnouncement(userId, revision);
  usePullRefresh(
    refresh,
    choice.loading ||
      choice.refreshing ||
      report.loading ||
      report.refreshing ||
      pending.loading ||
      pending.refreshing ||
      mine.loading ||
      mine.refreshing,
  );

  // 自己的卡：这次没读到但手里有上次的安排时照常显示，另外说明一声。
  const mineUsable =
    !mine.loading && (mine.error === null || mine.entries.length > 0);
  const todos = [
    ...(mineUsable
      ? leaderPunchTodos(
          leaderPunchSummary(mine.entries, new Date().toISOString()),
        )
      : []),
    ...(team && pending.data
      ? leaderMakeupTodos(
          pending.data,
          report.data?.participants ?? [],
          `/pages/team-makeups/index?teamId=${encodeURIComponent(team.scopeId)}&teamName=${encodeURIComponent(team.scopeName)}`,
        )
      : []),
  ];
  const problem =
    (choice.available !== null ? choice.error : null) ??
    (report.data !== null ? report.error : null) ??
    pending.error ??
    mine.error ??
    settings.error;

  return (
    <HomeShell
      title={scopeTitle(team)}
      onSwitch={choice.choosing ? undefined : choice.startChoosing}
      announcement={settings.data?.announcement}
      notRemembered={choice.notRemembered}
      problem={problem}
      onRetry={refresh}
    >
      {choice.choosing ? (
        <HomeScopeChooser title="选择班组" choice={choice} />
      ) : (
        <>
          {team ? (
            <AttendanceSign
              date={date}
              report={report}
              missing={leaderMissingText(report.data)}
              onOpen={() =>
                go(
                  `/pages/team-attendance/index?teamId=${encodeURIComponent(team.scopeId)}&date=${date}`,
                )
              }
              onRetry={refresh}
            />
          ) : choice.available !== null ? (
            <Sign>
              <SignText
                title="还没有分配班组"
                sub="请联系项目管理员分配班组。"
              />
            </Sign>
          ) : choice.error !== null ? (
            <Sign>
              <SignText title="班组没读到" sub={choice.error} />
              <SignButton onClick={refresh}>重新读取</SignButton>
            </Sign>
          ) : (
            <SkeletonSign />
          )}
          <TodoSheet
            todos={todos}
            loading={mine.loading || pending.loading || choice.loading}
            incomplete={
              (!mine.loading && !mineUsable) ||
              (pending.data === null && pending.error !== null)
            }
          />
          {team ? <RoleGrid panel="teamLeader" scope={team} /> : null}
        </>
      )}
    </HomeShell>
  );
};
