import { useEffect, useState } from "react";

import { PageHeader, Screen, StateView } from "../../components/ui/index";
import { useManagedCompanyId } from "../../hooks/use-management-scope";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { errorMessage } from "../../services/error-messages";
import {
  NO_REPORT_TEAM_FILTER,
  fetchReportTeamOptions,
  type ReportTeamFilter,
  fetchCompanyDailyReport,
  fetchCompanyMonthlyReport,
  fetchCompanyWeeklyReport,
} from "../../services/management";
import type {
  DailyReport,
  RangeReport,
  ReportTeamOption,
} from "../../services/management.types";
import { chinaMonday, chinaMonth, chinaToday } from "../../services/time";
import { useSession } from "../../store/session";

import { ReportView } from "../reports/report-view";
import type { ReportPeriod } from "../reports/view-model";

type Report = DailyReport | RangeReport;

export default function CompanyReports(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const { revision, refresh } = usePageRefresh();
  const companyId = useManagedCompanyId(state.me);
  const [period, setPeriod] = useState<ReportPeriod>("DAILY");
  const [date, setDate] = useState<string>(chinaToday());
  const [weekStart, setWeekStart] = useState<string>(chinaMonday());
  const [month, setMonth] = useState<string>(chinaMonth());
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [teamFilter, setTeamFilter] = useState<ReportTeamFilter>(
    NO_REPORT_TEAM_FILTER,
  );
  const [teamOptions, setTeamOptions] = useState<
    readonly ReportTeamOption[] | null
  >(null);

  // 班组和组长的选项读不到也不挡报表：只是不显示筛选。
  useEffect(() => {
    if (companyId === null) return;
    let cancelled = false;
    setTeamOptions(null);
    setTeamFilter(NO_REPORT_TEAM_FILTER);
    fetchReportTeamOptions("COMPANY", companyId).then(
      (rows) => {
        if (!cancelled) setTeamOptions(rows);
      },
      () => {
        if (!cancelled) setTeamOptions(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  useEffect(() => {
    if (companyId === null) return;
    let cancelled = false;
    setReport(null);
    setError(null);
    void (async () => {
      try {
        const data =
          period === "DAILY"
            ? await fetchCompanyDailyReport(companyId, date, teamFilter)
            : period === "WEEKLY"
              ? await fetchCompanyWeeklyReport(companyId, weekStart, teamFilter)
              : await fetchCompanyMonthlyReport(companyId, month, teamFilter);
        if (!cancelled) setReport(data);
      } catch (e) {
        if (!cancelled) setError(errorMessage(e, "操作未完成，请稍后重试。"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, period, date, weekStart, month, teamFilter, revision]);

  if (companyId === null) {
    return (
      <Screen header={<PageHeader title="公司报表" />}>
        <StateView
          kind="empty"
          title="没有可以看的公司"
          sub="这个账号不是公司管理员。"
        />
      </Screen>
    );
  }

  return (
    <ReportView
      title="公司报表"
      scope="COMPANY"
      scopeId={companyId}
      teamId={null}
      byProject
      period={period}
      date={date}
      weekStart={weekStart}
      month={month}
      report={report}
      error={error}
      onPeriod={setPeriod}
      onDate={setDate}
      onWeekStart={setWeekStart}
      onMonth={setMonth}
      onRefresh={refresh}
      teamOptions={teamOptions}
      teamFilter={teamFilter}
      onTeamFilter={setTeamFilter}
    />
  );
}
