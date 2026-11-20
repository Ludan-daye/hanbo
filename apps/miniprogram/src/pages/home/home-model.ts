import type { SafetyCreditBoard } from "@construction/domain";

import type { FaceProfile } from "../../services/face";
import type { MakeupInbox, PendingMakeup } from "../../services/makeups";
import type {
  DailyReport,
  DailyReportParticipant,
  WorkRoleScope,
} from "../../services/management.types";
import { projectPunchUrl } from "../../services/project-attendance";
import type { LeaderPunchSummary } from "../../services/worker-home-selection";
import { cardName } from "../../services/worker-home-sign";

// 管理人员首页（班组长、项目管理员、公司管理员）上要算的东西都在这里，不碰界面，方便单测。

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

/** 项目管理员的三类待办：补卡申请、违规待复核、底照待审核。没有的那类不出现。 */
export const projectAdminTodos = (input: {
  readonly projectId: string;
  readonly inbox:
    | (Pick<MakeupInbox, "nextCursor"> & {
        readonly items: readonly { readonly projectId: string }[];
      })
    | null;
  readonly board: {
    readonly violations: readonly {
      readonly status: SafetyCreditBoard["violations"][number]["status"];
      readonly appeals: readonly { readonly status: string }[];
    }[];
  } | null;
  readonly faces:
    | readonly Pick<FaceProfile, "ownerId" | "ownerType" | "status">[]
    | null;
}): readonly HomeTodo[] => {
  const query = `projectId=${encodeURIComponent(input.projectId)}`;
  const makeups =
    input.inbox?.items.filter((item) => item.projectId === input.projectId)
      .length ?? 0;
  const violations =
    input.board?.violations.filter(
      (row) =>
        row.status === "PENDING" ||
        row.appeals.some((appeal) => appeal.status === "PENDING"),
    ).length ?? 0;
  const faces = new Set(
    (input.faces ?? [])
      .filter((profile) => profile.status === "PENDING")
      .map((profile) => `${profile.ownerType}:${profile.ownerId}`),
  ).size;
  return [
    ...(makeups > 0
      ? [
          {
            key: "makeups",
            // 收件箱是分页的：还有下一页时，这里只是“至少这么多”。
            title: `补卡申请 ${makeups}${input.inbox?.nextCursor ? " 条以上" : " 条"}`,
            url: `/pages/team-makeups/index?${query}`,
          },
        ]
      : []),
    ...(violations > 0
      ? [
          {
            key: "violations",
            title: `违规待复核 ${violations} 条`,
            url: `/pages/safety-review/index?${query}`,
          },
        ]
      : []),
    ...(faces > 0
      ? [
          {
            key: "faces",
            title: `底照待审核 ${faces} 人`,
            url: `/pages/face-review/index?${query}`,
          },
        ]
      : []),
  ];
};

/** 公司首页上一个项目一行。 */
export type ProjectLine = {
  readonly projectId: string;
  readonly projectName: string;
  readonly people: number;
  /** 缺卡或缺勤的人数。 */
  readonly missing: number;
  readonly workedMinutes: number;
};

/** 把公司日报按项目分开，缺得多的排前面。 */
export const companyProjectLines = (
  participants: readonly DailyReportParticipant[],
): readonly ProjectLine[] => {
  const byProject = new Map<string, DailyReportParticipant[]>();
  for (const person of participants) {
    const rows = byProject.get(person.projectId);
    if (rows) rows.push(person);
    else byProject.set(person.projectId, [person]);
  }
  return [...byProject.entries()]
    .map(
      ([projectId, rows]): ProjectLine => ({
        projectId,
        projectName: rows[0]?.projectName ?? "",
        people: new Set(rows.map((person) => person.memberId)).size,
        missing: new Set(missingPeople(rows).map((person) => person.memberId))
          .size,
        workedMinutes: rows.reduce(
          (sum, person) => sum + person.workedMinutes,
          0,
        ),
      }),
    )
    .sort(
      (a, b) =>
        b.missing - a.missing ||
        a.projectName.localeCompare(b.projectName, "zh"),
    );
};
