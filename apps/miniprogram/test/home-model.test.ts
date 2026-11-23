import { describe, expect, test } from "vitest";

import {
  companyAdminStatuses,
  companyAdminTodos,
  companyProjectLines,
  countMissingText,
  leaderMakeupTodos,
  leaderMissingText,
  leaderPunchTodos,
  missingPeople,
  peopleValue,
  projectAdminTodos,
  projectAdminStatuses,
  overviewMissingText,
  resolveHomeScope,
  signDateLabel,
  systemAdminSign,
  systemAdminStatuses,
  systemAdminTodos,
} from "../src/pages/home/home-model";
import type {
  DailyReportParticipant,
  ReportTotals,
  WorkRoleScope,
} from "../src/services/management.types";

const person = (
  overrides: Partial<DailyReportParticipant>,
): DailyReportParticipant => ({
  projectKind: "REGULAR",
  isTemporary: false,
  safetyCreditScore: null,
  safetyCreditAsOf: null,
  projectId: "p-1",
  projectName: "滨江花园一期",
  evaluation: null,
  displayName: "张建国",
  memberId: "m-1",
  memberStatus: "ACTIVE",
  participantId: "w-1",
  participantType: "WORKER",
  phone: "13800000001",
  projectRoleLabel: "WORKER",
  requiresAttendance: true,
  teamId: "t-1",
  teamName: "钢筋一班",
  workType: "钢筋工",
  abnormalRecordCount: 0,
  approvedMakeupCount: 0,
  isAbsent: false,
  isEarlyLeave: false,
  isLate: false,
  isMissingPunch: false,
  workedMinutes: 0,
  normalMinutes: 0,
  overtimeMinutes: 0,
  unclassifiedMinutes: 0,
  confirmedViolationCount: 0,
  ...overrides,
});

const totals = (overrides: Partial<ReportTotals>): ReportTotals => ({
  abnormalRecordCount: 0,
  absenceCount: 0,
  actualAttendedDays: 0,
  approvedMakeupCount: 0,
  earlyLeaveCount: 0,
  lateCount: 0,
  missingPunchCount: 0,
  participantCount: 0,
  scheduledDays: 0,
  workedMinutes: 0,
  normalMinutes: 0,
  overtimeMinutes: 0,
  unclassifiedMinutes: 0,
  confirmedViolationCount: 0,
  ...overrides,
});

const scope = (
  roleCode: WorkRoleScope["roleCode"],
  scopeType: WorkRoleScope["scopeType"],
  scopeId: string,
  scopeName: string,
): WorkRoleScope => ({
  roleCode,
  scopeType,
  scopeId,
  scopeName,
  projectId: scopeType === "TEAM" ? "p-1" : null,
});

describe("signDateLabel", () => {
  test("writes the China date with a short weekday and no separator dot", () => {
    expect(signDateLabel("2026-11-18")).toBe("11月18日 周三");
    expect(signDateLabel("2026-11-22")).toBe("11月22日 周日");
    expect(signDateLabel("2027-01-01")).toBe("1月1日 周五");
  });
});

describe("resolveHomeScope", () => {
  const scopes = [
    scope("PROJECT_ADMIN", "PROJECT", "p-1", "滨江花园一期"),
    scope("PROJECT_ADMIN", "PROJECT", "p-2", "城市更新"),
    scope("TEAM_LEADER", "TEAM", "t-1", "滨江花园一期 / 钢筋一班"),
  ];

  test("before the list arrives an admin uses the session default, as the old home did", () => {
    const result = resolveHomeScope({
      roleCode: "PROJECT_ADMIN",
      scopeType: "PROJECT",
      scopes: null,
      sessionIds: ["p-1", "p-2"],
      preferredId: null,
    });
    expect(result.available).toBeNull();
    expect(result.scope).toMatchObject({ scopeId: "p-1", projectId: "p-1" });
  });

  test("a remembered choice is used straight away only if the session still grants it", () => {
    const base = {
      roleCode: "PROJECT_ADMIN",
      scopeType: "PROJECT",
      scopes: null,
      sessionIds: ["p-1", "p-2"],
    } as const;
    expect(
      resolveHomeScope({ ...base, preferredId: "p-2" }).scope?.scopeId,
    ).toBe("p-2");
    expect(
      resolveHomeScope({ ...base, preferredId: "p-gone" }).scope?.scopeId,
    ).toBe("p-1");
  });

  test("a team leader waits for the list instead of guessing a team", () => {
    expect(
      resolveHomeScope({
        roleCode: "TEAM_LEADER",
        scopeType: "TEAM",
        scopes: null,
        sessionIds: [],
        preferredId: "t-1",
      }).scope,
    ).toBeNull();
  });

  test("with the list, only this role's scopes are offered and the choice must be among them", () => {
    const chosen = resolveHomeScope({
      roleCode: "PROJECT_ADMIN",
      scopeType: "PROJECT",
      scopes,
      sessionIds: ["p-1", "p-2"],
      preferredId: "p-2",
    });
    expect(chosen.available?.map((item) => item.scopeId)).toEqual([
      "p-1",
      "p-2",
    ]);
    expect(chosen.scope?.scopeName).toBe("城市更新");

    const stale = resolveHomeScope({
      roleCode: "PROJECT_ADMIN",
      scopeType: "PROJECT",
      scopes,
      sessionIds: ["p-2", "p-1"],
      preferredId: "t-1",
    });
    expect(stale.scope?.scopeId).toBe("p-2");

    const leader = resolveHomeScope({
      roleCode: "TEAM_LEADER",
      scopeType: "TEAM",
      scopes,
      sessionIds: [],
      preferredId: null,
    });
    expect(leader.scope?.scopeId).toBe("t-1");
  });

  test("no scope of this role means nothing to show", () => {
    const result = resolveHomeScope({
      roleCode: "COMPANY_ADMIN",
      scopeType: "COMPANY",
      scopes,
      sessionIds: [],
      preferredId: null,
    });
    expect(result.available).toEqual([]);
    expect(result.scope).toBeNull();
  });
});

describe("who is missing", () => {
  test("counts missing punches and absences, but not people who need no attendance", () => {
    const rows = [
      person({ memberId: "a", isMissingPunch: true }),
      person({ memberId: "b", isAbsent: true }),
      person({
        memberId: "c",
        isMissingPunch: true,
        requiresAttendance: false,
      }),
      person({ memberId: "d", isLate: true }),
    ];
    expect(missingPeople(rows).map((row) => row.memberId)).toEqual(["a", "b"]);
  });

  test("the black strip names one person, shortens several, and never overflows", () => {
    expect(peopleValue([])).toBe("");
    expect(peopleValue(["李卫东"])).toBe("李卫东");
    expect(peopleValue(["李卫东", "张建国", "赵大勇"])).toBe("李卫东 等 3 人");
    expect(peopleValue(["欧阳建国", "张建国"])).toBe("2 人");
    expect(peopleValue([null])).toBe("1 人");
    expect(peopleValue(["阿卜杜热合曼买买提"])).toBe("1 人");
  });

  test("the leader sees names; a count is the fallback when nobody can be named", () => {
    expect(leaderMissingText(null)).toBe("");
    expect(
      leaderMissingText({
        participants: [person({ displayName: "李卫东", isMissingPunch: true })],
        totals: totals({ missingPunchCount: 1 }),
      }),
    ).toBe("李卫东");
    expect(
      leaderMissingText({
        participants: [person({})],
        totals: totals({ missingPunchCount: 2 }),
      }),
    ).toBe("2 人");
    expect(
      leaderMissingText({ participants: [person({})], totals: totals({}) }),
    ).toBe("");
  });

  test("admins see a count, and nothing when nobody is missing", () => {
    expect(countMissingText(null)).toBe("");
    expect(countMissingText({ totals: totals({}) })).toBe("");
    expect(countMissingText({ totals: totals({ missingPunchCount: 5 }) })).toBe(
      "5 人",
    );
  });
});

describe("leaderPunchTodos", () => {
  test("a card to punch is one row that goes to the punch page", () => {
    expect(
      leaderPunchTodos({
        kind: "pending",
        projectId: "p 1",
        projectName: "滨江花园一期",
        pointLabel: "上班",
        scheduledTime: "08:00",
        completed: 0,
        total: 2,
        otherProjects: 0,
      }),
    ).toEqual([
      {
        key: "punch",
        title: "我的上班卡",
        sub: undefined,
        time: "08:00",
        url: "/pages/punch/index?projectId=p%201",
      },
    ]);
  });

  test("cards in other projects get their own row and the project is named", () => {
    const todos = leaderPunchTodos({
      kind: "pending",
      projectId: "p-1",
      projectName: "滨江花园一期",
      pointLabel: "下班",
      scheduledTime: "17:30",
      completed: 1,
      total: 2,
      otherProjects: 2,
    });
    expect(todos.map((todo) => todo.title)).toEqual([
      "我的下班卡",
      "另外 2 个项目还有卡要打",
    ]);
    expect(todos[0]?.sub).toBe("滨江花园一期");
    expect(todos[1]?.url).toBe("/pages/my-projects/index");
  });

  test("an unread schedule and an abnormal record need the leader; a clean day is one plain row", () => {
    expect(leaderPunchTodos({ kind: "unknown" })[0]?.url).toBe(
      "/pages/my-projects/index",
    );
    expect(
      leaderPunchTodos({
        kind: "done",
        completed: 2,
        total: 2,
        abnormal: true,
      }),
    ).toEqual([
      {
        key: "punch-abnormal",
        title: "我的打卡有异常",
        note: "去核对",
        url: "/pages/my-records/index?range=TODAY",
      },
    ]);
    expect(
      leaderPunchTodos({
        kind: "done",
        completed: 2,
        total: 2,
        abnormal: false,
      }),
    ).toEqual([
      {
        key: "punch-done",
        title: "我今天的卡都打了",
        note: "2 张",
        url: "/pages/my-records/index?range=TODAY",
        plain: true,
      },
    ]);
    expect(
      leaderPunchTodos({ kind: "done", completed: 0, total: 0, abnormal: false }),
    ).toEqual([]);
    expect(leaderPunchTodos({ kind: "none" })).toEqual([]);
  });
});

describe("leaderMakeupTodos", () => {
  const people = [
    person({ participantId: "w-1", displayName: "张建国" }),
    person({ participantId: "w-2", displayName: "李卫东" }),
    person({
      participantId: "w-1",
      participantType: "MANAGER",
      displayName: "王师傅",
    }),
  ];
  const request = (
    participantId: string,
  ): { participantId: string; participantType: "WORKER" } => ({
    participantId,
    participantType: "WORKER",
  });

  test("nothing pending means no row", () => {
    expect(leaderMakeupTodos([], people, "/x")).toEqual([]);
  });

  test("names the requester from today's report, matching the profile type too", () => {
    expect(leaderMakeupTodos([request("w-1")], people, "/x")).toEqual([
      { key: "makeups", title: "补卡申请 1 条", note: "张建国", url: "/x" },
    ]);
  });

  test("several requests show the count; several people are shortened; unknown people are left out", () => {
    const todo = leaderMakeupTodos(
      [request("w-1"), request("w-1"), request("w-2"), request("w-9")],
      people,
      "/x",
    )[0];
    expect(todo?.title).toBe("补卡申请 4 条");
    expect(todo?.note).toBe("张建国 等 2 人");
    expect(leaderMakeupTodos([request("w-9")], people, "/x")[0]?.note).toBe(
      undefined,
    );
  });
});

describe("projectAdminTodos", () => {
  const todos = (
    counts: Partial<{
      makeupPending: number;
      violationPending: number;
      appealPending: number;
      facePending: number;
    }>,
  ) => ({
    appealPending: 0,
    facePending: 0,
    makeupPending: 0,
    violationPending: 0,
    ...counts,
  });
  test("each kind appears only when something is waiting, with the project carried in the link", () => {
    expect(
      projectAdminTodos({
        projectId: "p 1",
        todos: todos({
          makeupPending: 2,
          violationPending: 1,
          appealPending: 1,
          facePending: 2,
        }),
      }),
    ).toEqual([
      {
        key: "makeups",
        title: "补卡申请 2 条",
        url: "/pages/team-makeups/index?projectId=p%201",
      },
      {
        key: "violations",
        title: "违规待复核 2 条",
        url: "/pages/safety-review/index?projectId=p%201",
      },
      {
        key: "faces",
        title: "底照待审核 2 人",
        url: "/pages/face-review/index?projectId=p%201",
      },
    ]);
  });

  test("only appeals waiting opens the appeal tab", () => {
    expect(
      projectAdminTodos({ projectId: "p-1", todos: todos({ appealPending: 3 }) })[0]
        ?.url,
    ).toBe("/pages/safety-review/index?projectId=p-1&tab=APPEAL");
  });

  test("nothing read and nothing waiting both give an empty list", () => {
    expect(projectAdminTodos({ projectId: "p-1", todos: null })).toEqual([]);
    expect(projectAdminTodos({ projectId: "p-1", todos: todos({}) })).toEqual(
      [],
    );
  });
});

describe("projectAdminStatuses", () => {
  test("workspace entries show the same counts as the home todos", () => {
    expect(
      projectAdminStatuses({
        appealPending: 1,
        facePending: 0,
        makeupPending: 4,
        violationPending: 2,
      }),
    ).toEqual({
      "/pages/team-makeups/index": { kind: "warn", text: "4 条" },
      "/pages/safety-review/index": { kind: "warn", text: "3 条" },
    });
    expect(projectAdminStatuses(null)).toEqual({});
  });
});

describe("overviewMissingText", () => {
  test("writes the missing count, or nothing", () => {
    const overview = (missing: number) => ({
      attendance: { expected: 5, missing, present: 3, waiting: 0, workedMinutes: 0 },
    });
    expect(overviewMissingText(overview(2))).toBe("2 人");
    expect(overviewMissingText(overview(0))).toBe("");
    expect(overviewMissingText(null)).toBe("");
  });
});

const companyOverview = {
  companyId: "c-1",
  projects: [
    { attendance: { expected: 48, missing: 0, present: 43, waiting: 0 }, name: "滨江花园", projectId: "p-1", status: "ACTIVE" as const, todos: { facePending: 2, violationPending: 0 } },
    { attendance: { expected: 10, missing: 3, present: 6, waiting: 0 }, name: "城市更新", projectId: "p-2", status: "ACTIVE" as const, todos: { facePending: 0, violationPending: 1 } },
    { attendance: { expected: 0, missing: 0, present: 0, waiting: 0 }, name: "新地块", projectId: "p-3", status: "PREPARING" as const, todos: { facePending: 0, violationPending: 0 } },
    { attendance: { expected: 0, missing: 0, present: 0, waiting: 0 }, name: "空项目", projectId: "p-4", status: "ACTIVE" as const, todos: { facePending: 0, violationPending: 0 } },
  ],
  todos: { makeupOnlyYou: 1, makeupPending: 5, transferPending: 2 },
};

describe("companyProjectLines", () => {
  test("lists active projects, empty ones too, the one with more missing first; folds the rest", () => {
    const { lines, others } = companyProjectLines(companyOverview);
    expect(lines.map((line) => line.projectId)).toEqual(["p-2", "p-1", "p-4"]);
    expect(lines[1]).toEqual({ projectId: "p-1", projectName: "滨江花园", expected: 48, present: 43, missing: 0 });
    expect(others).toBe(1);
  });

  test("nothing read yet means no rows", () => {
    expect(companyProjectLines(null)).toEqual({ lines: [], others: 0 });
  });
});

describe("companyAdminTodos", () => {
  test("transfers, only-you makeups, then each project's violations and photos", () => {
    const todos = companyAdminTodos(companyOverview);
    expect(todos.map((todo) => [todo.title, todo.url])).toEqual([
      ["调人申请 2 条", "/pages/transfer-approvals/index?companyId=c-1"],
      ["补卡申请 1 条只有你能批", "/pages/team-makeups/index"],
      ["底照待审核 2 人", "/pages/face-review/index?projectId=p-1"],
      ["违规待复核 1 条", "/pages/safety-review/index?projectId=p-2"],
    ]);
  });

  test("nothing pending, nothing listed; statuses only for non-zero counts", () => {
    expect(companyAdminTodos({ ...companyOverview, projects: [], todos: { makeupOnlyYou: 0, makeupPending: 3, transferPending: 0 } })).toEqual([]);
    expect(companyAdminStatuses(companyOverview.todos)).toEqual({
      "/pages/team-makeups/index": { kind: "warn", text: "1 条" },
      "/pages/transfer-approvals/index": { kind: "warn", text: "2 条" },
    });
    expect(companyAdminStatuses(null)).toEqual({});
  });
});

const systemOverview = {
  accounts: { active: 412, disabled: 0 },
  companies: { active: 3, suspended: 0 },
  projects: { active: 7 },
  todos: { companiesWithoutAdmin: 2, makeupOnlyYou: 1, pendingAdminInvitations: 1 },
};

describe("systemAdminSign", () => {
  test("says how big the platform is; suspended companies and disabled accounts only when there are any", () => {
    expect(systemAdminSign(systemOverview)).toEqual({ title: "3 家公司，7 个进行中项目", sub: "412 个账号在用" });
    expect(
      systemAdminSign({ ...systemOverview, accounts: { active: 40, disabled: 2 }, companies: { active: 3, suspended: 1 } }),
    ).toEqual({ title: "3 家公司，7 个进行中项目", sub: "40 个账号在用，1 家公司已暂停，2 个账号已停用" });
    expect(systemAdminSign({ ...systemOverview, companies: { active: 0, suspended: 0 }, projects: { active: 0 } })).toEqual({
      title: "还没有公司",
      sub: "在平台管理里新增第一家公司。",
    });
  });
});

describe("systemAdminTodos", () => {
  test("companies without an administrator, administrators still to bind, only-you makeups; each opens its list", () => {
    expect(systemAdminTodos(systemOverview).map((todo) => [todo.title, todo.url])).toEqual([
      ["没有管理员的公司 2 家", "/pages/system-management/index?tab=COMPANIES&admin=NONE"],
      ["公司管理员还没绑定 1 人", "/pages/system-management/index?tab=COMPANIES&admin=NOT_BOUND"],
      ["补卡申请 1 条只有你能批", "/pages/team-makeups/index"],
    ]);
  });

  test("nothing pending, nothing listed; the workbench count is the only-you makeups", () => {
    expect(
      systemAdminTodos({ ...systemOverview, todos: { companiesWithoutAdmin: 0, makeupOnlyYou: 0, pendingAdminInvitations: 0 } }),
    ).toEqual([]);
    expect(systemAdminTodos(null)).toEqual([]);
    expect(systemAdminStatuses(systemOverview.todos)).toEqual({
      "/pages/system-management/index": { kind: "warn", text: "3 件" },
      "/pages/team-makeups/index": { kind: "warn", text: "1 条" },
    });
    expect(systemAdminStatuses(null)).toEqual({});
  });
});
