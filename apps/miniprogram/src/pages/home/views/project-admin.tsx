import type { SafetyCreditBoard } from "@construction/domain";

import { RoleGrid } from "../../../components/role-panels/index";
import { featureUrl } from "../../../components/role-panels/scope";
import { Sign, SignText } from "../../../components/ui/index";
import { useCachedRead } from "../../../hooks/use-cached-read";
import { usePageRefresh } from "../../../hooks/use-page-refresh";
import type { MeResponse } from "../../../services/auth.types";
import { fetchProjectFaces, type FaceProfile } from "../../../services/face";
import { fetchMakeupInbox, type MakeupInbox } from "../../../services/makeups";
import { fetchDailyReport } from "../../../services/management";
import type { DailyReport } from "../../../services/management.types";
import { fetchProjectSafetyCredit } from "../../../services/safety-credit";
import { chinaToday } from "../../../services/time";
import { countMissingText, projectAdminTodos } from "../home-model";
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
  const report = useCachedRead<DailyReport>(
    projectId === null ? null : `${userId}:project-daily:${projectId}:${date}`,
    () => fetchDailyReport(projectId ?? "", date),
    revision,
    "暂时无法读取工作概览",
  );
  // 三类待办各读各的：哪一类没读到，不耽误标牌和另外两类。
  const inbox = useCachedRead<MakeupInbox>(
    projectId === null ? null : `${userId}:makeup-inbox`,
    () => fetchMakeupInbox(null),
    revision,
    "补卡申请没读到，请重试。",
  );
  const board = useCachedRead<SafetyCreditBoard>(
    projectId === null ? null : `${userId}:project-safety-credit:${projectId}`,
    () => fetchProjectSafetyCredit(projectId ?? ""),
    revision,
    "违规记录没读到，请重试。",
  );
  const faces = useCachedRead<readonly FaceProfile[]>(
    projectId === null ? null : `${userId}:project-faces:${projectId}`,
    () => fetchProjectFaces(projectId ?? ""),
    revision,
    "底照审核没读到，请重试。",
  );
  const settings = useAnnouncement(userId, revision);
  usePullRefresh(
    refresh,
    choice.loading ||
      choice.refreshing ||
      report.loading ||
      report.refreshing ||
      inbox.loading ||
      inbox.refreshing ||
      board.loading ||
      board.refreshing ||
      faces.loading ||
      faces.refreshing,
  );
  const problem =
    choice.error ??
    (report.data !== null ? report.error : null) ??
    inbox.error ??
    board.error ??
    faces.error ??
    settings.error;

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
                report={report}
                missing={countMissingText(report.data)}
                onOpen={() => go(featureUrl("/pages/reports/index", project))}
                onRetry={refresh}
              />
              <TodoSheet
                todos={projectAdminTodos({
                  projectId,
                  inbox: inbox.data,
                  board: board.data,
                  faces: faces.data,
                })}
                loading={inbox.loading || board.loading || faces.loading}
                incomplete={[inbox, board, faces].some(
                  (read) => read.data === null && read.error !== null,
                )}
              />
            </>
          )}
          <RoleGrid panel="projectAdmin" scope={project} only={ENTRIES} />
        </>
      )}
    </HomeShell>
  );
};
