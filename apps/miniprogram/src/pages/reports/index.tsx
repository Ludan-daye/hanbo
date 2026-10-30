import { MonthlyExport } from "../../components/monthly-export";
import { Picker, View } from "@tarojs/components";
import { useEffect, useState } from "react";
import { ReportParticipants } from "../../components/report-participants";
import { useSessionGuard } from "../../hooks/use-session-guard";

import {
  ListItem,
  PageHeader,
  Screen,
  Segmented,
  StateView,
  StatCards,
} from "../../components/ui/index";
import { useManagedProjectId } from "../../hooks/use-management-scope";
import {
  fetchDailyReport,
  fetchMonthlyReport,
  fetchWeeklyReport,
} from "../../services/management";
import type {
  DailyReport,
  RangeReport,
  ReportTotals,
} from "../../services/management.types";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import {
  chinaToday,
  chinaMonth,
  chinaMonday,
  mondayForDate,
} from "../../services/time";
import { useSession } from "../../store/session";

import { totalsStatItems } from "./view-model";

type Period = "DAILY" | "WEEKLY" | "MONTHLY";

const PERIOD_OPTIONS = [
  { label: "日报", value: "DAILY" as const },
  { label: "周报", value: "WEEKLY" as const },
  { label: "月报", value: "MONTHLY" as const },
];

type Report = DailyReport | RangeReport;

export default function Reports(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const { revision, refresh } = usePageRefresh();
  const projectId = useManagedProjectId(state.me);
  const [period, setPeriod] = useState<Period>("DAILY");
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
          setError(e instanceof Error ? e.message : "REQUEST_FAILED");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, period, date, weekStart, month, revision]);

  if (projectId === null) {
    return (
      <Screen>
        <PageHeader title="考勤报表" />
        <StateView title="无项目" sub="当前账号没有项目管理员身份。" />
      </Screen>
    );
  }

  const totals: ReportTotals | null = report?.totals ?? null;

  return (
    <Screen>
      <PageHeader title="考勤报表" />
      <Segmented
        options={PERIOD_OPTIONS}
        value={period}
        onChange={(v) => {
          setPeriod(v);
        }}
      />
      <View>
        {period === "DAILY" ? (
          <Picker
            mode="date"
            value={date}
            onChange={(e) =>
              setDate(String((e.detail as { value: string }).value))
            }
          >
            <ListItem primary={`日期 · ${date}`} secondary="点选其它日期" />
          </Picker>
        ) : null}
        {period === "WEEKLY" ? (
          <Picker
            mode="date"
            value={weekStart}
            onChange={(e) =>
              setWeekStart(
                mondayForDate(String((e.detail as { value: string }).value)),
              )
            }
          >
            <ListItem
              primary={`周起始 · ${weekStart}`}
              secondary="选择任一天，自动查看所属周"
            />
          </Picker>
        ) : null}
        {period === "MONTHLY" ? (
          <Picker
            mode="date"
            fields="month"
            value={month}
            onChange={(e) =>
              setMonth(String((e.detail as { value: string }).value))
            }
          >
            <ListItem primary={`月份 · ${month}`} secondary="点选月份" />
          </Picker>
        ) : null}
      </View>
      {error !== null ? (
        <StateView title="加载失败" sub={error} onRetry={refresh} />
      ) : null}
      {report === null && error === null ? <StateView title="加载中…" /> : null}
      {report !== null ? (
        <View className="report-range">
          统计区间：{report.startDate} — {report.endDate}
        </View>
      ) : null}
      {totals !== null ? <StatCards items={totalsStatItems(totals)} /> : null}
      {period === "MONTHLY" && report !== null ? (
        <MonthlyExport
          key={`${projectId}:${month}`}
          scope="PROJECT"
          scopeId={projectId}
          month={month}
        />
      ) : null}
      {report ? (
        <ReportParticipants
          key={`${report.projectId}:${report.startDate}:${report.endDate}`}
          report={report}
          teamId={null}
          onChanged={refresh}
        />
      ) : null}
    </Screen>
  );
}
