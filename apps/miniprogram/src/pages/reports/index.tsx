import { useEffect, useState } from "react";

import { PageHeader, Screen, StateView } from "../../components/ui/index";
import { useManagedProjectId } from "../../hooks/use-management-scope";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { errorMessage } from "../../services/error-messages";
import {
  fetchDailyReport,
  fetchMonthlyReport,
  fetchWeeklyReport,
} from "../../services/management";
import type { DailyReport, RangeReport } from "../../services/management.types";
import { chinaMonday, chinaMonth, chinaToday } from "../../services/time";
import { useSession } from "../../store/session";

import { ReportView } from "./report-view";
import type { ReportPeriod } from "./view-model";

type Report = DailyReport | RangeReport;

export default function Reports(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const { revision, refresh } = usePageRefresh();
  const projectId = useManagedProjectId(state.me);
  const [period, setPeriod] = useState<ReportPeriod>("DAILY");
  const [date, setDate] = useState<string>(chinaToday());
  const [weekStart, setWeekStart] = useState<string>(chinaMonday());
  const [month, setMonth] = useState<string>(chinaMonth());
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (projectId === null) {
      return;
    }
    let cancelled = false;
    setReport(null);
    setError(null);
    void (async () => {
      try {
        const data =
          period === "DAILY"
            ? await fetchDailyReport(projectId, date)
            : period === "WEEKLY"
              ? await fetchWeeklyReport(projectId, weekStart)
              : await fetchMonthlyReport(projectId, month);
        if (!cancelled) {
          setReport(data);
        }
      } catch (e) {
        if (!cancelled) {
          setError(errorMessage(e, "操作未完成，请稍后重试。"));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, period, date, weekStart, month, revision]);

  if (projectId === null) {
    return (
      <Screen header={<PageHeader title="考勤报表" />}>
        <StateView
          kind="empty"
          title="没有可以看的项目"
          sub="这个账号不是项目管理员。"
        />
      </Screen>
    );
  }

  return (
    <ReportView
      title="考勤报表"
      scope="PROJECT"
      scopeId={projectId}
      teamId={null}
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
