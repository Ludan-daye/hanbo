import { Picker, View } from "@tarojs/components";
import { useEffect, useState } from "react";

import { ListItem, PageHeader, Screen, Segmented, StateView, StatCards } from "../../components/ui/index";
import { resolveAdminProjectId } from "../../routing/projectAdmin";
import { fetchDailyReport, fetchMonthlyReport, fetchWeeklyReport } from "../../services/management";
import type { DailyReport, RangeReport, ReportTotals } from "../../services/management.types";
import { useSession } from "../../store/session";

import { totalsStatItems } from "./view-model";

type Period = "DAILY" | "WEEKLY" | "MONTHLY";

const PERIOD_OPTIONS = [
  { label: "日", value: "DAILY" as const },
  { label: "周", value: "WEEKLY" as const },
  { label: "月", value: "MONTHLY" as const }
];

const pad = (n: number): string => String(n).padStart(2, "0");

const todayDate = (): string => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

const todayMonth = (): string => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
};

const lastMondayDate = (): string => {
  const d = new Date();
  const day = d.getUTCDay(); // 0=Sunday
  const diff = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

type Report = DailyReport | RangeReport;

export default function Reports(): JSX.Element {
  const { state } = useSession();
  const projectId = resolveAdminProjectId(state.me);
  const [period, setPeriod] = useState<Period>("DAILY");
  const [date, setDate] = useState<string>(todayDate());
  const [weekStart, setWeekStart] = useState<string>(lastMondayDate());
  const [month, setMonth] = useState<string>(todayMonth());
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
    return () => { cancelled = true; };
  }, [projectId, period, date, weekStart, month]);

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
      <Segmented options={PERIOD_OPTIONS} value={period} onChange={(v) => { setPeriod(v); }} />
      <View style={{ marginTop: "20rpx" }}>
        {period === "DAILY" ? (
          <Picker mode="date" value={date} onChange={(e) => setDate(String((e.detail as { value: string }).value))}>
            <ListItem primary={`日期 · ${date}`} secondary="点选其它日期" />
          </Picker>
        ) : null}
        {period === "WEEKLY" ? (
          <Picker mode="date" value={weekStart} onChange={(e) => setWeekStart(String((e.detail as { value: string }).value))}>
            <ListItem primary={`周起始 · ${weekStart}`} secondary="点选周一日期" />
          </Picker>
        ) : null}
        {period === "MONTHLY" ? (
          <Picker mode="date" fields="month" value={month} onChange={(e) => setMonth(String((e.detail as { value: string }).value))}>
            <ListItem primary={`月份 · ${month}`} secondary="点选月份" />
          </Picker>
        ) : null}
      </View>
      {error !== null ? <StateView title="加载失败" sub={error} /> : null}
      {report === null && error === null ? <StateView title="加载中…" /> : null}
      {totals !== null ? <StatCards items={totalsStatItems(totals)} /> : null}
      <View>
        {(report?.participants ?? []).map((p) => (
          <ListItem
            key={p.memberId}
            primary={p.displayName ?? "(未填写)"}
            secondary={`${p.projectRoleLabel} · ${p.teamName ?? "无班组"}`}
            chip={`${(p.workedMinutes / 60).toFixed(1)}h`}
          />
        ))}
      </View>
    </Screen>
  );
}
