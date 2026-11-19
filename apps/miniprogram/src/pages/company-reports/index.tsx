import { useEffect, useState } from "react";

import { PageHeader, Screen, StateView } from "../../components/ui/index";
import { useManagedCompanyId } from "../../hooks/use-management-scope";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { errorMessage } from "../../services/error-messages";
import {
  fetchCompanyDailyReport,
  fetchCompanyMonthlyReport,
  fetchCompanyWeeklyReport,
} from "../../services/management";
import type { DailyReport, RangeReport } from "../../services/management.types";
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

  useEffect(() => {
    if (companyId === null) return;
    let cancelled = false;
    setReport(null);
    setError(null);
    void (async () => {
      try {
        const data =
          period === "DAILY"
            ? await fetchCompanyDailyReport(companyId, date)
            : period === "WEEKLY"
              ? await fetchCompanyWeeklyReport(companyId, weekStart)
              : await fetchCompanyMonthlyReport(companyId, month);
        if (!cancelled) setReport(data);
      } catch (e) {
        if (!cancelled) setError(errorMessage(e, "操作未完成，请稍后重试。"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, period, date, weekStart, month, revision]);

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
    />
  );
}
