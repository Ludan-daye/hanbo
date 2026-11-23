import type { PendingMakeup } from "../../services/makeups";
import type {
  CompanyOverview,
  DailyReport,
  DailyReportParticipant,
  ProjectOverview,
  WorkRoleScope,
} from "../../services/management.types";
import { projectPunchUrl } from "../../services/project-attendance";
import type { SystemOverview } from "../../services/workflows";
import type { LeaderPunchSummary } from "../../services/worker-home-selection";
import { cardName } from "../../services/worker-home-sign";

// 管理人员首页（班组长、项目管理员、公司管理员、超级管理员）上要算的东西都在这里，不碰界面，方便单测。

const WEEKDAY = "日一二三四五六";

/** 标牌左上角的日期：“11月18日 周三”。date 是中国日期 YYYY-MM-DD。 */
export const signDateLabel = (date: string): string => {
  const day = new Date(`${date}T00:00:00Z`);
  return `${day.getUTCMonth() + 1}月${day.getUTCDate()}日 周${WEEKDAY[day.getUTCDay()]}`;
};

/** 工时写成小时，一位小数。 */
export const hoursText = (minutes: number): string => (minutes / 60).toFixed(1);

/**
 * 首页现在看的是哪个范围（哪个班组、哪个项目、哪家公司）。
 * - 范围列表读回来之前：管理员先用会话里的角色分配（和原来取默认项目的办法一样），
 *   班组长没有传 sessionIds，要等列表。
 * - 记在本机的选择只有还在范围里才算数。
 */
export const resolveHomeScope = (input: {
  readonly roleCode: WorkRoleScope["roleCode"];
  readonly scopeType: WorkRoleScope["scopeType"];
  /** 读回来的全部范围；null 表示还没读到。 */
  readonly scopes: readonly WorkRoleScope[] | null;
  readonly sessionIds: readonly string[];
  readonly preferredId: string | null;
}): {
  /** 这个职级能选的范围；null 表示还没读到。 */
  readonly available: readonly WorkRoleScope[] | null;
  /** 当前范围。列表没读到时名字是空的，只有编号能用。 */
  readonly scope: WorkRoleScope | null;
} => {
  const { roleCode, scopeType, scopes, sessionIds, preferredId } = input;
  if (scopes === null) {
    const scopeId =
      preferredId !== null && sessionIds.includes(preferredId)
        ? preferredId
        : (sessionIds[0] ?? null);
    return {
      available: null,
      scope:
        scopeId === null
          ? null
          : {
              roleCode,
              scopeType,
              scopeId,
              scopeName: "",
              projectId: scopeType === "PROJECT" ? scopeId : null,
            },
    };
  }
  const available = scopes.filter(
    (scope) => scope.roleCode === roleCode && scope.scopeType === scopeType,
  );
  return {
    available,
    scope:
      available.find((scope) => scope.scopeId === preferredId) ??
      available.find((scope) => scope.scopeId === sessionIds[0]) ??
      available[0] ??
      null,
  };
};

/** 今天该打没打的人：缺卡或缺勤，不用考勤的人不算。 */
export const missingPeople = (
  participants: readonly DailyReportParticipant[],
): readonly DailyReportParticipant[] =>
  participants.filter(
    (person) =>
      person.requiresAttendance && (person.isMissingPunch || person.isAbsent),
  );

/**
 * 标牌黑条里写谁：一个人写名字，几个人写“某某 等 N 人”。
 * 黑条只有一行，名字长了就只写人数，免得把“查看”挤出去。
 */
export const peopleValue = (names: readonly (string | null)[]): string => {
  if (names.length === 0) return "";
  const first = names[0] ?? "";
  if (names.length === 1)
    return first.length > 0 && first.length <= 6 ? first : "1 人";
  return first.length > 0 && first.length <= 3
    ? `${first} 等 ${names.length} 人`
    : `${names.length} 人`;
};

/** 班组长首页黑条里写的内容：有名字写名字，认不出人时写人数；没人缺卡就是空的。 */
export const leaderMissingText = (
  report: Pick<DailyReport, "participants" | "totals"> | null,
): string => {
  if (report === null) return "";
  const people = missingPeople(report.participants);
  if (people.length > 0)
    return peopleValue(people.map((person) => person.displayName));
  return countMissingText(report);
};

/** 项目和公司首页黑条里写的内容：缺卡几个人；没人缺卡就是空的。 */
export const countMissingText = (
  report: Pick<DailyReport, "totals"> | null,
): string =>
  report !== null && report.totals.missingPunchCount > 0
    ? `${report.totals.missingPunchCount} 人`
    : "";

/** “等你处理”里的一行。 */
export type HomeTodo = {
  readonly key: string;
  readonly title: string;
  readonly sub?: string;
  /** 右边的时间，用数字字体。 */
  readonly time?: string;
  /** 右边的灰字。 */
  readonly note?: string;
  readonly url: string;
  /** 不用处理、只是告诉一声的行：不带警戒条，排在最后。 */
  readonly plain?: boolean;
};

const MY_PROJECTS_URL = "/pages/my-projects/index";
const TODAY_RECORDS_URL = "/pages/my-records/index?range=TODAY";

/**
 * 班组长自己的卡：该打的、别的项目还有的、没读全的、有异常的。
 * 打完且正常时是一行不带警戒条的“我今天的卡都打了”，点进去看今天的记录。
 */
export const leaderPunchTodos = (
  summary: LeaderPunchSummary,
): readonly HomeTodo[] => {
  if (summary.kind === "pending")
    return [
      {
        key: "punch",
        title: `我的${cardName({ label: summary.pointLabel })}`,
        sub: summary.otherProjects > 0 ? summary.projectName : undefined,
        time: summary.scheduledTime,
        url: projectPunchUrl(summary.projectId),
      },
      ...(summary.otherProjects > 0
        ? [
            {
              key: "punch-others",
              title: `另外 ${summary.otherProjects} 个项目还有卡要打`,
              url: MY_PROJECTS_URL,
            },
          ]
        : []),
    ];
  if (summary.kind === "unknown")
    return [
      {
        key: "punch-unknown",
        title: "我的卡没读全",
        note: "去我的项目看",
        url: MY_PROJECTS_URL,
      },
    ];
  if (summary.kind === "done" && summary.abnormal)
    return [
      {
        key: "punch-abnormal",
        title: "我的打卡有异常",
        note: "去核对",
        url: TODAY_RECORDS_URL,
      },
    ];
  if (summary.kind === "done" && summary.total > 0)
    return [
      {
        key: "punch-done",
        title: "我今天的卡都打了",
        note: `${summary.completed} 张`,
        url: TODAY_RECORDS_URL,
        plain: true,
      },
    ];
  return [];
};

/** 本班等审批的补卡申请；右边写是谁申请的（名字从今天的日报里认）。 */
export const leaderMakeupTodos = (
  pending: readonly Pick<PendingMakeup, "participantId" | "participantType">[],
  participants: readonly Pick<
    DailyReportParticipant,
    "participantId" | "participantType" | "displayName"
  >[],
  url: string,
): readonly HomeTodo[] => {
  if (pending.length === 0) return [];
  const names = [
    ...new Set(
      pending.flatMap((request) => {
        const name = participants.find(
          (person) =>
            person.participantId === request.participantId &&
            person.participantType === request.participantType,
        )?.displayName;
        return name ? [name] : [];
      }),
    ),
  ];
  return [
    {
      key: "makeups",
      title: `补卡申请 ${pending.length} 条`,
      // 和标牌黑条同一个写法：名字长了只写人数，不把左边的标题挤掉。
      note: names.length === 0 ? undefined : peopleValue(names),
      url,
    },
  ];
};

/** 项目管理员的三类待办：补卡申请、违规待复核（含申诉）、底照待审核。没有的那类不出现。 */
export const projectAdminTodos = (input: {
  readonly projectId: string;
  /** 项目概览里的待办数；null 表示还没读到。 */
  readonly todos: ProjectOverview["todos"] | null;
}): readonly HomeTodo[] => {
  const query = `projectId=${encodeURIComponent(input.projectId)}`;
  const todos = input.todos;
  if (todos === null) return [];
  const violations = todos.violationPending + todos.appealPending;
  return [
    ...(todos.makeupPending > 0
      ? [
          {
            key: "makeups",
            title: `补卡申请 ${todos.makeupPending} 条`,
            url: `/pages/team-makeups/index?${query}`,
          },
        ]
      : []),
    ...(violations > 0
      ? [
          {
            key: "violations",
            title: `违规待复核 ${violations} 条`,
            url: `/pages/safety-review/index?${query}${todos.violationPending === 0 ? "&tab=APPEAL" : ""}`,
          },
        ]
      : []),
    ...(todos.facePending > 0
      ? [
          {
            key: "faces",
            title: `底照待审核 ${todos.facePending} 人`,
            url: `/pages/face-review/index?${query}`,
          },
        ]
      : []),
  ];
};

/** 项目概览的待办数写在工作台入口上：补卡审批、违规复核、底照审核。 */
export const projectAdminStatuses = (
  todos: ProjectOverview["todos"] | null,
): Readonly<Record<string, { readonly kind: "warn"; readonly text: string }>> => {
  if (todos === null) return {};
  const counts: readonly (readonly [string, number])[] = [
    ["/pages/team-makeups/index", todos.makeupPending],
    [
      "/pages/safety-review/index",
      todos.violationPending + todos.appealPending,
    ],
    ["/pages/face-review/index", todos.facePending],
  ];
  return Object.fromEntries(
    counts
      .filter(([, count]) => count > 0)
      .map(([url, count]) => [url, { kind: "warn" as const, text: `${count} 条` }]),
  );
};

/** 项目、公司首页黑条：未到几个人（应到、已过打卡点、一张卡都没有）；没有就是空的。 */
export const overviewMissingText = (
  overview: Pick<ProjectOverview, "attendance"> | null,
): string =>
  overview !== null && overview.attendance.missing > 0
    ? `${overview.attendance.missing} 人`
    : "";

/** 公司首页上一个进行中的项目一行：“到岗 43／48”，未到几人。 */
export type ProjectLine = {
  readonly projectId: string;
  readonly projectName: string;
  readonly expected: number;
  readonly present: number;
  readonly missing: number;
};

/**
 * 公司概览里进行中的项目一行一个（没人的也列），未到多的排前面（公司日报按项目也这样排）；
 * 筹备中、暂停、完工的不列，只数一个数，合成一行“另有 N 个”（2026-11-21 Q1）。
 */
export const companyProjectLines = (
  overview: Pick<CompanyOverview, "projects"> | null,
): { readonly lines: readonly ProjectLine[]; readonly others: number } => {
  if (overview === null) return { lines: [], others: 0 };
  const active = overview.projects.filter((row) => row.status === "ACTIVE");
  return {
    lines: active
      .map(
        (row): ProjectLine => ({
          projectId: row.projectId,
          projectName: row.name,
          expected: row.attendance.expected,
          present: row.attendance.present,
          missing: row.attendance.missing,
        }),
      )
      .sort(
        (a, b) =>
          b.missing - a.missing ||
          a.projectName.localeCompare(b.projectName, "zh"),
      ),
    others: overview.projects.length - active.length,
  };
};

/**
 * 公司首页“等你处理”：调人申请、只有你能批的补卡，再按项目列底照和违规的积压。
 * 每一条的数等于点进去的列表条数。
 */
export const companyAdminTodos = (
  overview: Pick<CompanyOverview, "companyId" | "projects" | "todos"> | null,
): readonly HomeTodo[] => {
  if (overview === null) return [];
  const company = `companyId=${encodeURIComponent(overview.companyId)}`;
  const todos = overview.todos;
  const projects = [...overview.projects].sort((a, b) =>
    a.name.localeCompare(b.name, "zh"),
  );
  return [
    ...(todos.transferPending > 0
      ? [
          {
            key: "transfers",
            title: `调人申请 ${todos.transferPending} 条`,
            sub: "项目之间调人，等你同意",
            url: `/pages/transfer-approvals/index?${company}`,
          },
        ]
      : []),
    ...(todos.makeupOnlyYou > 0
      ? [
          {
            key: "makeups",
            title: `补卡申请 ${todos.makeupOnlyYou} 条只有你能批`,
            sub: "申请人是项目管理员，或项目里没有更高职级的人",
            url: "/pages/team-makeups/index",
          },
        ]
      : []),
    ...projects.flatMap((row) => {
      const project = `projectId=${encodeURIComponent(row.projectId)}`;
      return [
        ...(row.todos.violationPending > 0
          ? [
              {
                key: `violations:${row.projectId}`,
                title: `违规待复核 ${row.todos.violationPending} 条`,
                sub: row.name,
                url: `/pages/safety-review/index?${project}`,
              },
            ]
          : []),
        ...(row.todos.facePending > 0
          ? [
              {
                key: `faces:${row.projectId}`,
                title: `底照待审核 ${row.todos.facePending} 人`,
                sub: row.name,
                url: `/pages/face-review/index?${project}`,
              },
            ]
          : []),
      ];
    }),
  ];
};

/** 公司概览的数写在工作台入口上：补卡审批（只有你能批的）、调人申请。 */
export const companyAdminStatuses = (
  todos: CompanyOverview["todos"] | null,
): Readonly<Record<string, { readonly kind: "warn"; readonly text: string }>> => {
  if (todos === null) return {};
  const counts: readonly (readonly [string, number])[] = [
    ["/pages/team-makeups/index", todos.makeupOnlyYou],
    ["/pages/transfer-approvals/index", todos.transferPending],
  ];
  return Object.fromEntries(
    counts
      .filter(([, count]) => count > 0)
      .map(([url, count]) => [url, { kind: "warn" as const, text: `${count} 条` }]),
  );
};

/**
 * 超级管理员首页的标牌（五级第五期，Q10）：只说平台的规模，不放全平台出勤。
 * 暂停的公司、停用的账号有才说。
 */
export const systemAdminSign = (
  overview: SystemOverview,
): { readonly title: string; readonly sub: string } => {
  const { accounts, companies, projects } = overview;
  if (companies.active + companies.suspended === 0)
    return { title: "还没有公司", sub: "在平台管理里新增第一家公司。" };
  const extra = [
    ...(companies.suspended > 0 ? [`${companies.suspended} 家公司已暂停`] : []),
    ...(accounts.disabled > 0 ? [`${accounts.disabled} 个账号已停用`] : []),
  ];
  return {
    title: `${companies.active} 家公司，${projects.active} 个进行中项目`,
    sub: [`${accounts.active} 个账号在用`, ...extra].join("，"),
  };
};

const PLATFORM_COMPANIES_URL = "/pages/system-management/index?tab=COMPANIES";

/**
 * 超级管理员的“等你处理”：没有管理员的公司、还没绑定的公司管理员、只有你能批的补卡。
 * 点进去就是平台管理里筛好的公司列表和补卡审批（默认“需要你批”），条数和这里一样。
 */
export const systemAdminTodos = (
  overview: Pick<SystemOverview, "todos"> | null,
): readonly HomeTodo[] => {
  if (overview === null) return [];
  const todos = overview.todos;
  return [
    ...(todos.companiesWithoutAdmin > 0
      ? [
          {
            key: "companies-without-admin",
            title: `没有管理员的公司 ${todos.companiesWithoutAdmin} 家`,
            sub: "任命公司管理员，或录入新人发邀请码",
            url: `${PLATFORM_COMPANIES_URL}&admin=NONE`,
          },
        ]
      : []),
    ...(todos.pendingAdminInvitations > 0
      ? [
          {
            key: "admin-invitations",
            title: `公司管理员还没绑定 ${todos.pendingAdminInvitations} 人`,
            sub: "等他用邀请码绑定微信；过期了可以重新生成",
            url: `${PLATFORM_COMPANIES_URL}&admin=NOT_BOUND`,
          },
        ]
      : []),
    ...(todos.makeupOnlyYou > 0
      ? [
          {
            key: "makeups",
            title: `补卡申请 ${todos.makeupOnlyYou} 条只有你能批`,
            sub: "申请人是公司管理员，或这家公司没有别人能批",
            url: "/pages/team-makeups/index",
          },
        ]
      : []),
  ];
};

/** 平台首页的数写在工作台入口上：平台管理（公司的两类待办）、补卡审批（只有你能批的）。 */
export const systemAdminStatuses = (
  todos: SystemOverview["todos"] | null,
): Readonly<Record<string, { readonly kind: "warn"; readonly text: string }>> => {
  if (todos === null) return {};
  const companies = todos.companiesWithoutAdmin + todos.pendingAdminInvitations;
  return {
    ...(companies > 0 ? { "/pages/system-management/index": { kind: "warn" as const, text: `${companies} 件` } } : {}),
    ...(todos.makeupOnlyYou > 0 ? { "/pages/team-makeups/index": { kind: "warn" as const, text: `${todos.makeupOnlyYou} 条` } } : {}),
  };
};
