import { RoleGrid } from "../../../components/role-panels/index";
import { featureUrl } from "../../../components/role-panels/scope";
import {
  Row,
  SectionTitle,
  Sheet,
  Sign,
  SignText,
} from "../../../components/ui/index";
import { useCachedRead } from "../../../hooks/use-cached-read";
import { usePageRefresh } from "../../../hooks/use-page-refresh";
import type { MeResponse } from "../../../services/auth.types";
import { fetchCompanyOverview } from "../../../services/management";
import type { CompanyOverview } from "../../../services/management.types";
import { chinaToday } from "../../../services/time";
import {
  companyAdminTodos,
  companyProjectLines,
  overviewMissingText,
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

// 首页宫格只放最常用的三个，其余在工作台。
const ENTRIES: readonly string[] = [
  "/pages/company-people/index",
  "/pages/company-reports/index",
  "/pages/create-project/index",
];

/**
 * 公司管理员首页：标牌说全公司今天到了多少、缺卡多少；“等你处理”是调人申请、
 * 只有你能批的补卡和各项目积压的底照、违规；下面一个进行中的项目一行（没人的也列），
 * 缺得多的排前面，点进去就是这个项目。数字都来自 /management/companies/:id/overview。
 */
export const CompanyAdminHome = ({
  me,
}: {
  readonly me: MeResponse;
}): JSX.Element => {
  const userId = me.user.id;
  const { revision, refresh } = usePageRefresh();
  const choice = useHomeScope({
    me,
    roleCode: "COMPANY_ADMIN",
    scopeType: "COMPANY",
    revision,
  });
  const company = choice.scope;
  const companyId = company?.scopeId ?? null;
  const date = chinaToday();
  const overview = useCachedRead<CompanyOverview>(
    companyId === null
      ? null
      : `${userId}:company-overview:${companyId}:${date}`,
    () => fetchCompanyOverview(companyId ?? "", date),
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
  const { lines, others } = companyProjectLines(overview.data);
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
      title={scopeTitle(company)}
      onSwitch={choice.choosing ? undefined : choice.startChoosing}
      announcement={settings.data?.announcement}
      notRemembered={choice.notRemembered}
      problem={problem}
      onRetry={refresh}
    >
      {choice.choosing ? (
        <HomeScopeChooser title="选择公司" choice={choice} />
      ) : (
        <>
          {companyId === null ? (
            <Sign>
              <SignText
                title="还没有分配公司"
                sub="请联系平台管理员分配要管理的公司。"
              />
            </Sign>
          ) : (
            <>
              <AttendanceSign
                date={date}
                report={sign}
                missing={overviewMissingText(overview.data)}
                onOpen={() =>
                  go(featureUrl("/pages/company-reports/index", company))
                }
                onRetry={refresh}
              />
              <TodoSheet
                todos={companyAdminTodos(overview.data)}
                loading={overview.loading}
                incomplete={overview.data === null && overview.error !== null}
              />
            </>
          )}
          {lines.length > 0 || others > 0 ? (
            <>
              <SectionTitle
                action="全部项目"
                onAction={() =>
                  go(featureUrl("/pages/company-projects/index", company))
                }
              >
                今天的项目
              </SectionTitle>
              <Sheet>
                {lines.map((line) => (
                  <Row
                    key={line.projectId}
                    title={line.projectName}
                    sub={
                      line.expected === 0
                        ? "今天没有应到的人"
                        : `到岗 ${line.present}／${line.expected}`
                    }
                    status={
                      line.missing > 0
                        ? { kind: "bad", text: `缺卡 ${line.missing} 人` }
                        : undefined
                    }
                    chevron
                    onClick={() =>
                      go(
                        `/pages/project-detail/index?projectId=${encodeURIComponent(line.projectId)}&view=hub`,
                      )
                    }
                  />
                ))}
                {others > 0 ? (
                  <Row
                    title={`另有 ${others} 个项目`}
                    sub="筹备中、已暂停或已完工"
                    mute
                    chevron
                    onClick={() =>
                      go(featureUrl("/pages/company-projects/index", company))
                    }
                  />
                ) : null}
              </Sheet>
            </>
          ) : null}
          <RoleGrid panel="companyAdmin" scope={company} only={ENTRIES} />
        </>
      )}
    </HomeShell>
  );
};
