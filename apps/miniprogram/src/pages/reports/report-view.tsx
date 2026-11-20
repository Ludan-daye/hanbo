import { Picker, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useRef, useState } from "react";

import { MonthlyExport } from "../../components/monthly-export";
import {
  INITIAL_REPORT_FILTERS,
  REPORT_PAGE_SIZE,
  ReportFilterRows,
  ReportPeople,
  ReportProjects,
  ReportTeamFilterRows,
  filterReportRows,
  personName,
  reportClipboardText,
  reportTeams,
  type ReportFilters,
} from "../../components/report-participants";
import { ReportPerson } from "../../components/report-person-detail";
import { WorkDate } from "../../components/team-work-fields";
import {
  Button,
  DateSwitch,
  Links,
  Notice,
  Numbers,
  PageHeader,
  Screen,
  SearchField,
  SectionTitle,
  Segmented,
  SignLine,
  SkeletonRows,
  SkeletonSign,
  StateView,
} from "../../components/ui/index";
import { errorMessage } from "../../services/error-messages";
import {
  NO_REPORT_TEAM_FILTER,
  type ReportTeamFilter,
} from "../../services/management";
import type {
  DailyReport,
  RangeReport,
  ReportTeamOption,
} from "../../services/management.types";
import type { ExportScope } from "../../services/report-exports";
import { mondayForDate } from "../../services/time";

import {
  groupReportPeople,
  groupReportProjects,
  monthLabel,
  rangeLabel,
  reportExportTarget,
  reportNumbers,
  reportSummary,
  shiftDate,
  shiftMonth,
  type ReportPeriod,
  type ReportPersonGroup,
  type ReportRow,
} from "./view-model";

import "./report.scss";

const PERIOD_OPTIONS = [
  { label: "日报", value: "DAILY" as const },
  { label: "周报", value: "WEEKLY" as const },
  { label: "月报", value: "MONTHLY" as const },
];

type Report = DailyReport | RangeReport;
/** 点开的那个人。打开时就把要用的都记下，报表在后面重读也不影响这一屏。 */
type OpenPerson = {
  readonly projectId: string;
  readonly memberId: string;
  readonly name: string;
  readonly from: string;
  readonly to: string;
  readonly period: ReportPeriod;
  readonly teamId: string | null;
  readonly rows: readonly ReportRow[];
};

/**
 * 班组考勤、考勤报表、公司报表共用的一页三个视图：
 * 报表（结论、三个数、分行）→ 公司报表多一层“某个项目的人员”→ 个人考勤明细。
 * 读报表的状态和请求留在各自的页面里，这里只管怎么显示。
 */
export const ReportView = ({
  title,
  scope,
  scopeId,
  teamId,
  byProject,
  period,
  date,
  weekStart,
  month,
  report,
  error,
  onPeriod,
  onDate,
  onWeekStart,
  onMonth,
  onRefresh,
  teamOptions,
  teamFilter = NO_REPORT_TEAM_FILTER,
  onTeamFilter,
}: {
  readonly title: string;
  /** 月度 Excel 归谁。 */
  readonly scope: ExportScope;
  readonly scopeId: string;
  /** 班组考勤传班组编号，人员明细按班组查；其余传 null。 */
  readonly teamId: string | null;
  /** 公司报表：先按项目分行，点进项目再看人。 */
  readonly byProject?: boolean;
  readonly period: ReportPeriod;
  readonly date: string;
  readonly weekStart: string;
  readonly month: string;
  readonly report: Report | null;
  readonly error: string | null;
  readonly onPeriod: (value: ReportPeriod) => void;
  readonly onDate: (value: string) => void;
  readonly onWeekStart: (value: string) => void;
  readonly onMonth: (value: string) => void;
  readonly onRefresh: () => void;
  /**
   * 项目、公司报表：可按班组或组长筛（服务端筛）。没读到时为 null，不显示筛选；
   * 班组考勤不传。
   */
  readonly teamOptions?: readonly ReportTeamOption[] | null;
  readonly teamFilter?: ReportTeamFilter;
  readonly onTeamFilter?: (filter: ReportTeamFilter) => void;
}): JSX.Element => {
  // 服务端按班组筛的报表，页面里不再给“班组”本地筛选。
  const serverTeams = teamOptions !== undefined;
  const [filters, setFilters] = useState<ReportFilters>(INITIAL_REPORT_FILTERS);
  const [allStats, setAllStats] = useState<boolean>(false);
  // 公司报表里点进了哪个项目。
  const [project, setProject] = useState<{
    readonly id: string;
    readonly name: string;
  } | null>(null);
  const [person, setPerson] = useState<OpenPerson | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  // 进下一层前记下滚到哪了，回来时滚回去：点开第二十个人再返回，不用重新找。
  const scrollStack = useRef<number[]>([]);
  const entering = useRef<boolean>(false);
  const enter = (apply: () => void): void => {
    // 连点两下只进一次。
    if (entering.current) return;
    entering.current = true;
    let done = false;
    const go = (top: number): void => {
      if (done) return;
      done = true;
      entering.current = false;
      scrollStack.current.push(top);
      apply();
      void Taro.pageScrollTo({ scrollTop: 0, duration: 0 });
    };
    try {
      Taro.createSelectorQuery()
        .selectViewport()
        .scrollOffset((offset) => go(offset?.scrollTop ?? 0))
        .exec();
    } catch {
      go(0);
    }
    // 量不到滚动位置也要进得去。
    setTimeout(() => go(0), 150);
  };
  const leave = (apply: () => void): void => {
    const top = scrollStack.current.pop() ?? 0;
    apply();
    Taro.nextTick(() => {
      void Taro.pageScrollTo({ scrollTop: top, duration: 0 });
    });
  };
  // 换了日期或周期就是另一份报表：筛选从头来，和原来每份报表各管各的一样。
  const changeRange = (apply: () => void): void => {
    setFilters(INITIAL_REPORT_FILTERS);
    setProject(null);
    setCopyError(null);
    apply();
  };
  const patchFilters = (patch: Partial<ReportFilters>): void =>
    setFilters((current) => ({
      ...current,
      ...patch,
      visibleCount: REPORT_PAGE_SIZE,
    }));
  const copy = async (rows: readonly ReportRow[]): Promise<void> => {
    if (report === null) return;
    setCopyError(null);
    try {
      await Taro.setClipboardData({ data: reportClipboardText(report, rows) });
    } catch (failure: unknown) {
      setCopyError(errorMessage(failure, "复制失败，请检查剪贴板权限。"));
    }
  };
  const openPerson = (group: ReportPersonGroup): void => {
    if (report === null) return;
    const opened: OpenPerson = {
      projectId: group.projectId,
      memberId: group.memberId,
      name: personName(group.rows[0]),
      from: report.startDate,
      to: report.endDate,
      period,
      teamId: teamId ?? teamFilter.teamId ?? (filters.team || null),
      rows: group.rows,
    };
    enter(() => setPerson(opened));
  };

  // ---------- 个人考勤明细 ----------
  if (person !== null)
    return (
      <Screen
        header={
          <PageHeader
            title={person.name}
            onBack={() => leave(() => setPerson(null))}
          />
        }
      >
        <ReportPerson
          key={`${person.projectId}:${person.memberId}:${person.from}:${person.to}:${person.teamId ?? ""}`}
          projectId={person.projectId}
          memberId={person.memberId}
          teamId={person.teamId}
          from={person.from}
          to={person.to}
          rows={person.rows}
          period={person.period}
          onChanged={onRefresh}
        />
      </Screen>
    );

  const all: readonly ReportRow[] = report?.participants ?? [];
  const copyLink = (rows: readonly ReportRow[]): JSX.Element => (
    <>
      <Links>
        <Button
          variant="text"
          disabled={rows.length === 0}
          onClick={() => {
            void copy(rows);
          }}
        >
          复制明细
        </Button>
      </Links>
      {copyError ? <Notice tone="error">{copyError}</Notice> : null}
    </>
  );
  const peopleBlock = (
    source: readonly ReportRow[],
    showTeam: boolean,
    heading: (count: number) => JSX.Element,
  ): JSX.Element => {
    const rows = filterReportRows(source, filters);
    const people = groupReportPeople(rows);
    return (
      <>
        <ReportFilterRows
          filters={filters}
          teams={teamId === null && !serverTeams ? reportTeams(source) : []}
          showType={
            filters.type !== "ALL" ||
            new Set(source.map((row) => row.participantType)).size > 1
          }
          onChange={patchFilters}
        />
        {heading(people.length)}
        <SearchField
          value={filters.search}
          placeholder="搜索姓名、手机号或岗位"
          onInput={(search) => patchFilters({ search })}
        />
        <ReportPeople
          people={people}
          visibleCount={filters.visibleCount}
          showTeam={showTeam}
          emptyTitle={
            source.length === 0 ? "这段时间没有人员" : "没有符合条件的人"
          }
          onOpen={openPerson}
          onMore={() =>
            setFilters((current) => ({
              ...current,
              visibleCount: current.visibleCount + REPORT_PAGE_SIZE,
            }))
          }
        />
        {copyLink(rows)}
      </>
    );
  };

  // ---------- 公司报表：某个项目的人员 ----------
  if (byProject && project !== null) {
    const leaveProject = (): void =>
      leave(() => {
        setProject(null);
        // 身份和班组是这个项目里的筛选，出去就不带了；搜索的字留着。
        setFilters((current) => ({
          ...INITIAL_REPORT_FILTERS,
          search: current.search,
        }));
      });
    const projectRows = all.filter((row) => row.projectId === project.id);
    const group = groupReportProjects(projectRows)[0];
    return (
      <Screen
        header={<PageHeader title={project.name} onBack={leaveProject} />}
      >
        {error !== null ? (
          <StateView
            kind="error"
            title="报表没读到"
            sub={error}
            onRetry={onRefresh}
          />
        ) : report === null ? (
          <View aria-label="正在读取报表">
            <SkeletonSign />
            <SkeletonRows rows={3} gap />
          </View>
        ) : group ? (
          <>
            <SignLine
              title={`${group.people} 人，记工 ${group.hours} 小时`}
              sub={
                period === "MONTHLY"
                  ? monthLabel(month)
                  : rangeLabel(report.startDate, report.endDate)
              }
            />
            {peopleBlock(projectRows, true, (count) => (
              <SectionTitle>{`人员 ${count} 人`}</SectionTitle>
            ))}
          </>
        ) : (
          <StateView
            kind="empty"
            title="这个项目这段时间没有人员"
            retryLabel="回到公司报表"
            onRetry={leaveProject}
          />
        )}
      </Screen>
    );
  }

  // ---------- 报表 ----------
  const statsToggle = {
    action: allStats ? "收起统计" : "全部统计",
    onAction: (): void => setAllStats((value) => !value),
  };
  const numbers = report === null ? null : reportNumbers(report.totals, period);
  const searched = byProject ? filterReportRows(all, filters, true) : all;
  const projects = byProject ? groupReportProjects(searched) : [];
  const summary =
    report === null
      ? null
      : reportSummary(
          report.totals,
          period,
          byProject ? groupReportProjects(all).length : null,
        );
  const exportTarget = reportExportTarget(scope, scopeId, teamFilter);
  const excel =
    period === "MONTHLY" && report !== null ? (
      exportTarget === null ? (
        <Notice>按组长筛的结果不单独导出 Excel。要导出请改选班组。</Notice>
      ) : (
        <MonthlyExport
          key={`${exportTarget.scope}:${exportTarget.scopeId}:${month}`}
          scope={exportTarget.scope}
          scopeId={exportTarget.scopeId}
          month={month}
        />
      )
    ) : null;
  return (
    <Screen header={<PageHeader title={title} />}>
      <Segmented
        options={PERIOD_OPTIONS}
        value={period}
        onChange={(value) => {
          if (value !== period) changeRange(() => onPeriod(value));
        }}
      />
      {period === "DAILY" ? (
        <WorkDate
          value={date}
          onChange={(value) => changeRange(() => onDate(value))}
        />
      ) : period === "WEEKLY" ? (
        <DateSwitch
          label={
            <Picker
              mode="date"
              value={weekStart}
              onChange={(event) =>
                changeRange(() =>
                  onWeekStart(mondayForDate(String(event.detail.value))),
                )
              }
            >
              <View className="rpt-date">
                {rangeLabel(weekStart, shiftDate(weekStart, 6))}
              </View>
            </Picker>
          }
          onPrev={() =>
            changeRange(() => onWeekStart(shiftDate(weekStart, -7)))
          }
          onNext={() => changeRange(() => onWeekStart(shiftDate(weekStart, 7)))}
        />
      ) : (
        <DateSwitch
          label={
            <Picker
              mode="date"
              fields="month"
              value={month}
              onChange={(event) =>
                changeRange(() => onMonth(String(event.detail.value)))
              }
            >
              <View className="rpt-date">{monthLabel(month)}</View>
            </Picker>
          }
          onPrev={() => changeRange(() => onMonth(shiftMonth(month, -1)))}
          onNext={() => changeRange(() => onMonth(shiftMonth(month, 1)))}
        />
      )}

      {teamOptions && onTeamFilter ? (
        <ReportTeamFilterRows
          teams={teamOptions}
          filter={teamFilter}
          withProject={Boolean(byProject)}
          onChange={(next) => changeRange(() => onTeamFilter(next))}
        />
      ) : null}
      {error !== null ? (
        <StateView
          kind="error"
          title="报表没读到"
          sub={error}
          onRetry={onRefresh}
        />
      ) : report === null || summary === null || numbers === null ? (
        <View aria-label="正在读取报表">
          <SkeletonSign />
          <SkeletonRows rows={1} gap />
          <SkeletonRows rows={3} gap />
        </View>
      ) : (
        <>
          <SignLine title={summary.title} sub={summary.sub} />
          <Numbers items={numbers.top} gap />
          {allStats ? (
            <View className="m-fade">
              <Numbers items={numbers.rest} wrap gap />
            </View>
          ) : null}
          {byProject ? (
            <>
              <SectionTitle {...statsToggle}>按项目</SectionTitle>
              <SearchField
                value={filters.search}
                placeholder="搜索姓名、手机号或岗位"
                onInput={(search) => patchFilters({ search })}
              />
              <ReportProjects
                projects={projects}
                onOpen={(opened) =>
                  enter(() => {
                    setProject({
                      id: opened.projectId,
                      name: opened.projectName,
                    });
                    setCopyError(null);
                  })
                }
              />
              {copyLink(searched)}
              {excel}
            </>
          ) : (
            <>
              {excel}
              {peopleBlock(all, teamId === null, (count) => (
                <SectionTitle
                  {...statsToggle}
                >{`人员 ${count} 人`}</SectionTitle>
              ))}
            </>
          )}
        </>
      )}
    </Screen>
  );
};
