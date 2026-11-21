import { RoleGrid } from "../../../components/role-panels/index";
import { featureUrl } from "../../../components/role-panels/scope";
import { Sign, SignText } from "../../../components/ui/index";
import { useCachedRead } from "../../../hooks/use-cached-read";
import { usePageRefresh } from "../../../hooks/use-page-refresh";
import type { MeResponse } from "../../../services/auth.types";
import { fetchProjectOverview } from "../../../services/management";
import type { ProjectOverview } from "../../../services/management.types";
import { chinaToday } from "../../../services/time";
import { overviewMissingText, projectAdminTodos } from "../home-model";
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

// 首页宫格只放最常用的三个，其余在工作台。
const ENTRIES: readonly string[] = [
  "/pages/participants/index",
  "/pages/reports/index",
  "/pages/project-management/index",
];

/**
 * 项目管理员首页：和班组长首页一个结构，范围是整个项目。
 * 标牌说今天到了多少、缺卡多少；补卡申请、违规待复核、底照待审核排在“等你处理”。
 * 数字都来自 /management/projects/:id/overview，等于点进去的列表条数。
 */
export const ProjectAdminHome = ({
  me,
}: {
  readonly me: MeResponse;
}): JSX.Element => {
  const userId = me.user.id;
  const { revision, refresh } = usePageRefresh();
  const choice = useHomeScope({
    me,
    roleCode: "PROJECT_ADMIN",
    scopeType: "PROJECT",
    revision,
  });
  const project = choice.scope;
  const projectId = project?.scopeId ?? null;
  const date = chinaToday();
  // 一个小接口给出标牌和三类待办的数：和点进去的列表同一口径。
  const overview = useCachedRead<ProjectOverview>(
    projectId === null ? null : `${userId}:project-overview:${projectId}:${date}`,
    () => fetchProjectOverview(projectId ?? "", date),
    revision,
    "暂时无法读取工作概览",
  );
  const settings = useAnnouncement(userId, revision);
  usePullRefresh(
    refresh,
    choice.loading ||
      choice.refreshing ||
      overview.loading ||
      overview.refreshing,
  );
  const problem =
    choice.error ??
    (overview.data !== null ? overview.error : null) ??
    settings.error;
  const sign = {
    data:
      overview.data === null
        ? null
        : {
            totals: {
              scheduledDays: overview.data.attendance.expected,
              actualAttendedDays: overview.data.attendance.present,
            },
          },
    error: overview.error,
  };

  return (
    <HomeShell
      title={scopeTitle(project)}
      onSwitch={choice.choosing ? undefined : choice.startChoosing}
      announcement={settings.data?.announcement}
      notRemembered={choice.notRemembered}
      problem={problem}
      onRetry={refresh}
    >
      {choice.choosing ? (
        <HomeScopeChooser title="选择项目" choice={choice} />
      ) : (
        <>
          {projectId === null ? (
            <Sign>
              <SignText
                title="还没有分配项目"
                sub="请联系公司管理员分配要管理的项目。"
              />
            </Sign>
          ) : (
            <>
              <AttendanceSign
                date={date}
                report={sign}
                missing={overviewMissingText(overview.data)}
                missingLabel="未到"
                onOpen={() => go(featureUrl("/pages/reports/index", project))}
                onRetry={refresh}
              />
              <TodoSheet
                todos={projectAdminTodos({
                  projectId,
                  todos: overview.data?.todos ?? null,
                })}
                loading={overview.loading}
                incomplete={overview.data === null && overview.error !== null}
              />
            </>
          )}
          <RoleGrid panel="projectAdmin" scope={project} only={ENTRIES} />
        </>
      )}
    </HomeShell>
  );
};
