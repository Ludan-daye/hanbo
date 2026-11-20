import type {
  SafetyIssue,
  SafetyViolationView,
  TeamDailySummary,
} from "@construction/domain";
import { describe, expect, it } from "vitest";

import {
  creditHeadline,
  creditSub,
} from "../src/pages/safety-credit/credit-view";
import {
  logHeadline,
  peopleByException,
  personSub,
  reportText,
} from "../src/pages/team-log/log-view";
import {
  ALL_SCOPES,
  arrangePending,
  inScope,
  makeupDay,
  pointName,
  projectScope,
  scopeLabel,
} from "../src/pages/team-makeups/makeup-view";
import {
  arrangeIssues,
  namesInRow,
  needsFullText,
  unconfirmedNames,
} from "../src/pages/team-safety/safety-view";

const issue = (id: string, resolvedAt: string | null): SafetyIssue => ({
  id,
  workDate: "2026-11-17",
  memberId: null,
  memberName: null,
  description: `隐患 ${id}`,
  severity: "GENERAL",
  resolution: resolvedAt === null ? null : "已整改",
  resolvedAt,
});

describe("班组安全", () => {
  it("还没确认的人：在场工人里去掉确认过的，没名字的写“姓名待补录”", () => {
    expect(
      unconfirmedNames(
        {
          acknowledgements: [
            { memberId: "a", name: "张建国", acknowledgedAt: "" },
          ],
        },
        [
          { memberId: "a", displayName: "张建国" },
          { memberId: "b", displayName: "李卫东" },
          { memberId: "c", displayName: null },
        ],
      ),
    ).toEqual(["李卫东", "姓名待补录"]);
  });

  it("名单短就直接写在行里，长了只写人数、名单另外列出", () => {
    expect(namesInRow(["李卫东"])).toEqual({ value: "李卫东", listed: false });
    expect(namesInRow(["李卫东", "赵大勇", "陈国强"])).toEqual({
      value: "3 人",
      listed: true,
    });
  });

  it("隐患说明写得长或分了行，展开时要放全文", () => {
    expect(needsFullText("临边防护缺失")).toBe(false);
    expect(needsFullText("3 号楼 6 层东侧临边防护缺失，要补装")).toBe(true);
    expect(needsFullText("防护缺失\n今天补")).toBe(true);
  });

  it("没整改的里展开点过的那条；没点过或那条不在了，展开第一条", () => {
    const issues = [
      issue("a", null),
      issue("b", "2026-11-18T01:00:00Z"),
      issue("c", null),
    ];
    expect(arrangeIssues(issues, null).active?.id).toBe("a");
    expect(arrangeIssues(issues, "c").active?.id).toBe("c");
    expect(arrangeIssues(issues, "b").active?.id).toBe("a");
    expect(arrangeIssues(issues, "c").waiting.map((row) => row.id)).toEqual([
      "a",
      "c",
    ]);
    expect(arrangeIssues(issues, null).done.map((row) => row.id)).toEqual([
      "b",
    ]);
    expect(
      arrangeIssues([issue("b", "2026-11-18T01:00:00Z")], null).active,
    ).toBe(null);
  });
});

describe("安全信用", () => {
  const worker = (score: number) => ({
    workerId: `w${score}`,
    memberId: `m${score}`,
    name: "工人",
    rank: 1,
    score,
    confirmedViolationCount: 0,
    recoveryPoints: 0,
    recoveryWorkdays: 0,
    asOf: "",
  });
  const violation = (
    status: SafetyViolationView["status"],
  ): SafetyViolationView => ({
    id: status,
    workerId: "w",
    projectId: "p",
    teamId: "t",
    memberId: "m",
    category: "未佩戴安全帽",
    severity: "SERIOUS",
    occurredAt: "",
    description: "",
    evidenceObjectKeys: [],
    points: 10,
    policyVersion: 1,
    status,
    createdAt: "",
    reviewedAt: null,
    reviewReason: null,
    decisions: [],
    appeals: [],
  });

  it("结论：平均分取整，等审核的违规单独数", () => {
    expect(
      creditHeadline({
        workers: [worker(85), worker(95), worker(100)],
        violations: [violation("PENDING"), violation("CONFIRMED")],
      }),
    ).toEqual({ title: "本班平均 93 分", sub: "1 条违规等项目管理员审核" });
  });

  it("没有工人、没有待审核时各有一句话", () => {
    expect(creditHeadline({ workers: [], violations: [] })).toEqual({
      title: "本班还没有工人",
      sub: "没有等审核的违规",
    });
  });

  it("每个人的副行：违规次数，恢复过分才写恢复", () => {
    expect(creditSub({ confirmedViolationCount: 0, recoveryPoints: 0 })).toBe(
      "没有违规",
    );
    expect(creditSub({ confirmedViolationCount: 2, recoveryPoints: 5 })).toBe(
      "累计 2 次，已恢复 5 分",
    );
  });
});

describe("班组日报", () => {
  const person = (
    name: string,
    flags: readonly string[],
  ): TeamDailySummary["people"][number] => ({
    name,
    safetyCreditScore: 95,
    workedMinutes: 510,
    normalMinutes: 480,
    overtimeMinutes: 30,
    unclassifiedMinutes: 0,
    confirmedViolationCount: 0,
    flags,
  });
  const summary: TeamDailySummary = {
    snapshotVersion: 2,
    teamId: "t",
    teamName: "钢筋一班",
    projectName: "滨江花园一期",
    workDate: "2026-11-18",
    generatedAt: "2026-11-18T09:50:00Z",
    taskCount: 3,
    completedTaskCount: 1,
    cancelledTaskCount: 1,
    temporaryWorkerCount: 1,
    briefingCount: 1,
    acknowledgementCount: 4,
    openIssueCount: 1,
    resolvedIssueCount: 0,
    actualAttendedDays: 4,
    workedMinutes: 1890,
    normalMinutes: 1680,
    overtimeMinutes: 210,
    unclassifiedMinutes: 0,
    confirmedViolationCount: 0,
    missingPunchCount: 1,
    tasks: [
      {
        id: "1",
        teamId: "t",
        teamName: "钢筋一班",
        projectId: "p",
        projectName: "滨江花园一期",
        supervisorName: "王师傅",
        status: "OPEN",
        title: "3 号楼照明维修",
        description: "",
        workType: "",
        startsAt: "",
        endsAt: "",
        assignments: [
          { memberId: "a", name: "张建国", source: "TEAM" },
          { memberId: "b", name: "赵大勇", source: "TEAM" },
        ],
      },
      {
        id: "2",
        teamId: "t",
        teamName: "钢筋一班",
        projectId: "p",
        projectName: "滨江花园一期",
        supervisorName: "王师傅",
        status: "CANCELLED",
        title: "取消的任务",
        description: "",
        workType: "",
        startsAt: "",
        endsAt: "",
        assignments: [],
      },
    ],
    people: [],
  };

  it("结论：出勤和记工在上，缺卡和任务完成在下，取消的任务不算", () => {
    expect(logHeadline(summary)).toEqual({
      title: "4 人出勤，记工 31.5 小时",
      sub: "缺卡 1 人次，任务完成 1 / 2",
    });
    expect(
      logHeadline({
        ...summary,
        missingPunchCount: 0,
        taskCount: 1,
        cancelledTaskCount: 1,
      }).sub,
    ).toBe("没有缺卡，没有任务");
  });

  it("有异常的人排在前面，其余顺序不变", () => {
    expect(
      peopleByException([
        person("张建国", []),
        person("李卫东", ["缺卡"]),
        person("赵大勇", []),
      ]).map((row) => row.name),
    ).toEqual(["李卫东", "张建国", "赵大勇"]);
  });

  it("每个人的分项都在；有异常的人把记工也写进副行", () => {
    expect(personSub(person("张建国", []))).toBe(
      "正常 8.0，加班 0.5，未分类 0.0，信用 95",
    );
    expect(personSub(person("李卫东", ["缺卡"]))).toBe(
      "记工 8.5 小时，正常 8.0，加班 0.5，未分类 0.0，信用 95",
    );
    expect(personSub({ ...person("周强", []), safetyCreditScore: null })).toBe(
      "正常 8.0，加班 0.5，未分类 0.0",
    );
  });

  it("复制出去的汇报文字和原来一样", () => {
    expect(reportText(summary)).toBe(
      [
        "2026-11-18 滨江花园一期 / 钢筋一班",
        "任务完成 1/2，取消 1",
        "出勤 4 人，实际 31.5 小时，缺卡 1 人次",
        "正常 28.0 小时，加班 3.5 小时，未分类 0.0 小时",
        "临时任务参与 1 人",
        "交底 1 条，确认 4 人次，待整改 1 条",
        "• 3 号楼照明维修：张建国、赵大勇",
      ].join("\n"),
    );
  });
});

describe("补卡审批", () => {
  it("范围写成“项目，班组”，没有班组的是项目直属", () => {
    expect(
      scopeLabel({ projectName: "滨江花园一期", teamName: "钢筋一班" }),
    ).toBe("滨江花园一期，钢筋一班");
    expect(scopeLabel({ projectName: "滨江花园一期", teamName: null })).toBe(
      "滨江花园一期，项目直属",
    );
  });

  it("卡的名称先用接口给的，再用内置的，都没有也不显示英文代码", () => {
    expect(pointName({ pointLabel: "下班", pointCode: "SEGMENT_1_END" })).toBe(
      "下班",
    );
    expect(pointName({ pointLabel: null, pointCode: "SEGMENT_2_START" })).toBe(
      "下午上班",
    );
    expect(pointName({ pointCode: "TASK_START" })).toBe("打卡");
  });

  it("日期写成几月几日", () => {
    expect(makeupDay("2026-11-07")).toBe("11月7日");
    expect(makeupDay("未知")).toBe("未知");
  });

  it("一次只展开一条：点过的那条，否则第一条；前后的位置不变", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(arrangePending(items, null)).toEqual({
      before: [],
      open: { id: "a" },
      after: [{ id: "b" }, { id: "c" }],
    });
    expect(arrangePending(items, "b")).toEqual({
      before: [{ id: "a" }],
      open: { id: "b" },
      after: [{ id: "c" }],
    });
    expect(arrangePending(items, "gone").open).toEqual({ id: "a" });
    expect(arrangePending([], "a")).toEqual({
      before: [],
      open: null,
      after: [],
    });
  });

  it("从项目首页带 projectId 进来：多一项“某项目，全部班组”，只算这个项目的申请", () => {
    const items = [
      { projectId: "p1", projectName: "滨江花园一期", teamName: "钢筋一班" },
      { projectId: "p1", projectName: "滨江花园一期", teamName: null },
      { projectId: "p2", projectName: "城西学校", teamName: "木工班" },
    ];
    const project = projectScope(items, "p1");
    expect(project).toEqual({
      projectId: "p1",
      label: "滨江花园一期，全部班组",
    });
    expect(
      items.filter((item) => inScope(item, project!.label, project)),
    ).toHaveLength(2);
    expect(
      items.filter((item) => inScope(item, ALL_SCOPES, project)),
    ).toHaveLength(3);
    expect(
      items.filter((item) =>
        inScope(item, "城西学校，木工班", project),
      ),
    ).toEqual([items[2]]);
    expect(projectScope(items, null)).toBeNull();
    expect(projectScope(items, "p9")).toBeNull();
  });
});
