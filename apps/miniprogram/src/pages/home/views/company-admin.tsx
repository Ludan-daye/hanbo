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
import { fetchCompanyDailyReport } from "../../../services/management";
import type { DailyReport } from "../../../services/management.types";
import { chinaToday } from "../../../services/time";
import {
  companyProjectLines,
  countMissingText,
  hoursText,
} from "../home-model";
import { useHomeScope } from "../use-home-scope";

import {
  AttendanceSign,
  go,
  HomeScopeChooser,
  HomeShell,
  scopeTitle,
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
 * 公司管理员首页：标牌说全公司今天到了多少、缺卡多少；
 * 下面一个项目一行，缺得多的排前面，点进去就是这个项目。
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
  const report = useCachedRead<DailyReport>(
    companyId === null ? null : `${userId}:company-daily:${companyId}:${date}`,
    () => fetchCompanyDailyReport(companyId ?? "", date),
    revision,
    "暂时无法读取工作概览",
  );
  const settings = useAnnouncement(userId, revision);
  usePullRefresh(
    refresh,
    choice.loading || choice.refreshing || report.loading || report.refreshing,
  );
  const lines = report.data
    ? companyProjectLines(report.data.participants)
    : [];
  const problem =
    choice.error ??
    (report.data !== null ? report.error : null) ??
    settings.error;

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
            <AttendanceSign
              date={date}
              report={report}
              missing={countMissingText(report.data)}
              onOpen={() =>
                go(featureUrl("/pages/company-reports/index", company))
              }
              onRetry={refresh}
            />
          )}
          {lines.length > 0 ? (
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
                    sub={`${line.people} 人，已记工 ${hoursText(line.workedMinutes)} 小时`}
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
              </Sheet>
            </>
          ) : null}
          <RoleGrid panel="companyAdmin" scope={company} only={ENTRIES} />
        </>
      )}
    </HomeShell>
  );
};
