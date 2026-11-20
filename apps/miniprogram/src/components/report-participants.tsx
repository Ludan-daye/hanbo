import { Picker, Text, View } from "@tarojs/components";

import {
  reportLeaderOptions,
  rowSummary,
  teamFilterLabel,
  type ReportPersonGroup,
  type ReportProjectGroup,
  type ReportRow,
} from "../pages/reports/view-model";
import { displayProjectRole } from "../routing/features";
import type { ReportTeamFilter } from "../services/management";
import type { ReportTeamOption } from "../services/management.types";
import { Button, FormRow, Row, Sheet, StateView } from "./ui/index";

import "../pages/reports/report.scss";

export type PersonFilter = "ALL" | "WORKER" | "MANAGER";
export type ReportFilters = {
  readonly search: string;
  readonly type: PersonFilter;
  /** 班组编号，空串是全部班组。 */
  readonly team: string;
  /** 人员列表先显示多少人。 */
  readonly visibleCount: number;
};
/** 人员一次显示这么多，多的点“显示更多”。 */
export const REPORT_PAGE_SIZE = 30;
export const INITIAL_REPORT_FILTERS: ReportFilters = {
  search: "",
  type: "ALL",
  team: "",
  visibleCount: REPORT_PAGE_SIZE,
};
const TYPES: ReadonlyArray<{
  readonly value: PersonFilter;
  readonly label: string;
}> = [
  { value: "ALL", label: "全部人员" },
  { value: "WORKER", label: "工人" },
  { value: "MANAGER", label: "管理员" },
];

export type ReportTeam = { readonly id: string; readonly label: string };

/** 报表里出现过的班组。 */
export const reportTeams = (
  rows: readonly ReportRow[],
): readonly ReportTeam[] => [
  ...new Map(
    rows
      .filter((row) => row.teamId !== null)
      .map((row) => [
        row.teamId!,
        { id: row.teamId!, label: row.teamName ?? "未命名班组" },
      ]),
  ).values(),
];

/** 按搜索、身份、班组筛。searchOnly 时只按搜索筛（公司报表按项目分行的那一层）。 */
export const filterReportRows = (
  rows: readonly ReportRow[],
  filters: ReportFilters,
  searchOnly?: boolean,
): readonly ReportRow[] =>
  rows.filter(
    (row) =>
      (searchOnly === true ||
        ((filters.type === "ALL" || row.participantType === filters.type) &&
          (!filters.team || row.teamId === filters.team))) &&
      `${row.displayName ?? ""} ${row.phone} ${displayProjectRole(row.projectRoleLabel)}`.includes(
        filters.search.trim(),
      ),
  );

export const personName = (row: ReportRow): string =>
  row.displayName ?? `手机尾号 ${row.phone.slice(-4)}`;

/** 复制到剪贴板的明细：一行一个人一个班组，制表符分列，能直接贴进表格。 */
export const reportClipboardText = (
  range: { readonly startDate: string; readonly endDate: string },
  rows: readonly ReportRow[],
): string =>
  [
    `考勤明细 ${range.startDate} 至 ${range.endDate}`,
    "项目\t姓名\t工种\t岗位\t班组\t工时(h)\t出勤情况\t当前项目评分\t评语\t评分人\t评分时间\t正常工时(h)\t加班工时(h)\t未分类工时(h)\t安全信用分\t已确认违规",
    ...rows.map((row) =>
      [
        row.projectName,
        row.displayName ?? row.phone,
        row.workType ?? "未填写",
        displayProjectRole(row.projectRoleLabel),
        row.teamName ?? "无班组",
        (row.workedMinutes / 60).toFixed(1),
        rowSummary(row),
        row.evaluation?.score ?? "未评分",
        row.evaluation?.comment ?? "",
        row.evaluation?.reviewerName ?? "",
        row.evaluation?.reviewedAt ?? "",
        (row.normalMinutes / 60).toFixed(1),
        (row.overtimeMinutes / 60).toFixed(1),
        (row.unclassifiedMinutes / 60).toFixed(1),
        row.safetyCreditScore ?? "不适用",
        row.confirmedViolationCount,
      ].join("\t"),
    ),
  ].join("\n");

/** 筛选：“班组”“身份”两行，没得选的那行不显示；两行都没有就什么也不显示。 */
export const ReportFilterRows = ({
  filters,
  teams,
  showType,
  onChange,
}: {
  readonly filters: ReportFilters;
  /** 可选的班组；空的就不显示班组那一行。 */
  readonly teams: readonly ReportTeam[];
  /** 报表里既有工人又有管理员时才有必要按身份筛。 */
  readonly showType: boolean;
  readonly onChange: (patch: Partial<ReportFilters>) => void;
}): JSX.Element | null => {
  if (!showType && teams.length === 0) return null;
  const typeIndex = Math.max(
    0,
    TYPES.findIndex((item) => item.value === filters.type),
  );
  return (
    <Sheet gap>
      {teams.length > 0 ? (
        <View className="rpt-pick">
          <Picker
            mode="selector"
            range={["全部班组", ...teams.map((item) => item.label)]}
            value={teams.findIndex((item) => item.id === filters.team) + 1}
            onChange={(event) =>
              onChange({
                team: teams[Number(event.detail.value) - 1]?.id ?? "",
              })
            }
          >
            <FormRow
              label="班组"
              value={
                teams.find((item) => item.id === filters.team)?.label ??
                "全部班组"
              }
              chevron
            />
          </Picker>
        </View>
      ) : null}
      {showType ? (
        <View className="rpt-pick">
          <Picker
            mode="selector"
            range={TYPES.map((item) => item.label)}
            value={typeIndex}
            onChange={(event) =>
              onChange({
                type: TYPES[Number(event.detail.value)]?.value ?? "ALL",
              })
            }
          >
            <FormRow label="身份" value={TYPES[typeIndex].label} chevron />
          </Picker>
        </View>
      ) : null}
    </Sheet>
  );
};

/**
 * 按班组、按组长筛（服务端筛）：两行二选一，选了一个另一个回到“全部”。
 * 组长是各班组现在的组长。
 */
export const ReportTeamFilterRows = ({
  teams,
  filter,
  withProject,
  onChange,
}: {
  readonly teams: readonly ReportTeamOption[];
  readonly filter: ReportTeamFilter;
  /** 公司报表：班组名后带项目。 */
  readonly withProject: boolean;
  readonly onChange: (filter: ReportTeamFilter) => void;
}): JSX.Element | null => {
  if (teams.length === 0) return null;
  const leaders = reportLeaderOptions(teams);
  const team = teams.find((item) => item.teamId === filter.teamId);
  const leader = leaders.find((item) => item.memberId === filter.leaderMemberId);
  return (
    <Sheet gap>
      <View className="rpt-pick">
        <Picker
          mode="selector"
          range={["全部班组", ...teams.map((item) => teamFilterLabel(item, withProject))]}
          value={team === undefined ? 0 : teams.indexOf(team) + 1}
          onChange={(event) =>
            onChange({
              teamId: teams[Number(event.detail.value) - 1]?.teamId ?? null,
              leaderMemberId: null,
            })
          }
        >
          <FormRow
            label="班组"
            value={team === undefined ? "全部班组" : teamFilterLabel(team, withProject)}
            chevron
          />
        </Picker>
      </View>
      {leaders.length > 0 ? (
        <View className="rpt-pick">
          <Picker
            mode="selector"
            range={["全部组长", ...leaders.map((item) => item.label)]}
            value={leader === undefined ? 0 : leaders.indexOf(leader) + 1}
            onChange={(event) =>
              onChange({
                teamId: null,
                leaderMemberId:
                  leaders[Number(event.detail.value) - 1]?.memberId ?? null,
              })
            }
          >
            <FormRow
              label="组长"
              value={leader?.label ?? "全部组长"}
              chevron
            />
          </Picker>
        </View>
      ) : null}
    </Sheet>
  );
};

/** 班组名，有组长时带上组长：“钢筋一班（组长 张建国）”。 */
export const teamWithLeader = (row: ReportRow): string =>
  row.teamName === null
    ? "项目直属"
    : row.teamLeaderName
      ? `${row.teamName}（组长 ${row.teamLeaderName}）`
      : row.teamName;

/** 一个人的副行：工种、岗位、是不是临时工；项目报表再带上班组和组长。 */
const personSub = (person: ReportPersonGroup, showTeam: boolean): string => {
  const first = person.rows[0];
  const role = displayProjectRole(first.projectRoleLabel);
  const teams = [...new Set(person.rows.map(teamWithLeader))];
  // 岗位和工种写的是同一个词时只说一遍。
  return [
    ...new Set([
      first.workType ?? (first.participantType === "WORKER" ? "工种没填" : ""),
      role === "普通工人" ? "" : role,
      first.isTemporary ? "临时工" : "",
      showTeam ? teams.join("、") : "",
    ]),
  ]
    .filter(Boolean)
    .join("，");
};

/** 人员：一人一行，有考勤问题的在最前面。点一行看这个人的明细。 */
export const ReportPeople = ({
  people,
  visibleCount,
  showTeam,
  emptyTitle,
  onOpen,
  onMore,
}: {
  readonly people: readonly ReportPersonGroup[];
  readonly visibleCount: number;
  readonly showTeam: boolean;
  /** 一个人也没有时说什么：是报表本来就空，还是筛没了。 */
  readonly emptyTitle: string;
  readonly onOpen: (person: ReportPersonGroup) => void;
  readonly onMore: () => void;
}): JSX.Element => {
  if (people.length === 0) return <StateView kind="empty" title={emptyTitle} />;
  const left = people.length - visibleCount;
  return (
    <>
      <Sheet gap>
        {people.slice(0, visibleCount).map((person) => {
          const name = personName(person.rows[0]);
          const { bad, exempt, hours } = person.outcome;
          // 右边只说一件事：有问题说问题，免考勤又没记工的说免考勤，其余说工时。
          const idle = bad === null && exempt && hours === "0.0";
          return (
            <Row
              key={person.key}
              avatar={name.slice(0, 1)}
              title={name}
              sub={personSub(person, showTeam) || undefined}
              status={bad === null ? undefined : { kind: "bad", text: bad }}
              value={idle ? "免考勤" : undefined}
              mute={idle}
              chevron
              onClick={() => onOpen(person)}
            >
              {bad === null && !idle ? (
                <View>
                  <Text className="num">{hours}</Text> 小时
                </View>
              ) : null}
            </Row>
          );
        })}
      </Sheet>
      {left > 0 ? (
        <Button variant="outline" wide onClick={onMore}>
          再显示 {Math.min(left, REPORT_PAGE_SIZE)} 人，还有 {left} 人
        </Button>
      ) : null}
    </>
  );
};

/** 按项目分行：公司报表用。点一行看这个项目的人员。 */
export const ReportProjects = ({
  projects,
  onOpen,
}: {
  readonly projects: readonly ReportProjectGroup[];
  readonly onOpen: (project: ReportProjectGroup) => void;
}): JSX.Element =>
  projects.length === 0 ? (
    <StateView kind="empty" title="没有符合条件的人" />
  ) : (
    <Sheet gap>
      {projects.map((project) => (
        <Row
          key={project.projectId}
          title={project.projectName}
          sub={`${project.people} 人，${project.hours} 小时`}
          status={
            project.rate === null && project.troubled > 0
              ? { kind: "bad", text: `${project.troubled} 人有异常` }
              : undefined
          }
          chevron
          onClick={() => onOpen(project)}
        >
          {project.rate !== null ? (
            <View>
              <Text className="num">{project.rate}</Text>%
            </View>
          ) : null}
        </Row>
      ))}
    </Sheet>
  );
