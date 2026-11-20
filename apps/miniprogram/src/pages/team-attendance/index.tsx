import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";

import { useManagedTeamId } from "../../hooks/use-management-scope";
import { NoTeamScreen } from "../../components/team-site/index";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { errorMessage } from "../../services/error-messages";
import {
  fetchTeamDailyReport,
  fetchTeamMonthlyReport,
  fetchTeamWeeklyReport,
} from "../../services/management";
import type { DailyReport, RangeReport } from "../../services/management.types";
import { chinaMonday, chinaMonth, chinaToday } from "../../services/time";
import { useSession } from "../../store/session";

import { ReportView } from "../reports/report-view";
import type { ReportPeriod } from "../reports/view-model";

type Report = DailyReport | RangeReport;

/** 班组考勤。班组长首页原来的工人名单现在在这里：日报里一人一行，有问题的排在前面。 */
export default function TeamAttendance(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const { revision, refresh } = usePageRefresh();
  const teamId = useManagedTeamId(state.me);
  const requestedDate = Taro.useRouter().params.date;
  const [period, setPeriod] = useState<ReportPeriod>("DAILY");
  const [date, setDate] = useState<string>(
    requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
      ? requestedDate
      : chinaToday(),
  );
  const [weekStart, setWeekStart] = useState<string>(chinaMonday());
  const [month, setMonth] = useState<string>(chinaMonth());
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (teamId === null) {
      return;
    }
    let cancelled = false;
    setReport(null);
    setError(null);
    void (async () => {
      try {
        const data =
          period === "DAILY"
            ? await fetchTeamDailyReport(teamId, date)
            : period === "WEEKLY"
              ? await fetchTeamWeeklyReport(teamId, weekStart)
              : await fetchTeamMonthlyReport(teamId, month);
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
  }, [teamId, period, date, weekStart, month, revision]);

  if (teamId === null) {
    return <NoTeamScreen title="班组考勤" me={state.me} />;
  }

  return (
    <ReportView
      title="班组考勤"
      scope="TEAM"
      scopeId={teamId}
      teamId={teamId}
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
