import type { TeamTask, TeamTaskWorker } from "@construction/domain";
import { describe, expect, it } from "vitest";

import { graceLabel, pointRule } from "../src/pages/schedules/plan-view";
import {
  dayTimeRange,
  filterWorkers,
  peopleSummary,
  summarizeTasks,
  taskDayLabel,
  taskEditable,
  taskHours,
  taskListTime,
  taskPeople,
  taskTimeRange,
  toggleAllWorkers,
  toggleWorker,
  workerTrades,
} from "../src/pages/team-work/task-view";

type Assignment = TeamTask["assignments"][number];

const person = (
  values: Partial<Assignment> & { memberId: string },
): Assignment => ({
  name: values.memberId,
  source: "ASSIGNED",
  taskAttendanceOnly: false,
  startedAt: null,
  finishedAt: null,
  workedMinutes: 0,
  exitConfirmedAt: null,
  ...values,
});
const task = (values: Partial<TeamTask> = {}): TeamTask => ({
  id: "task-1",
  teamId: "team-1",
  teamName: "钢筋一班",
  projectId: "project-1",
  projectName: "滨江花园一期",
  supervisorName: "王师傅",
  status: "OPEN",
  title: "3 号楼照明维修",
  description: "",
  workType: "",
  startsAt: "2026-11-18T08:00:00+08:00",
  endsAt: "2026-11-18T17:30:00+08:00",
  assignments: [],
  ...values,
});
const worker = (
  memberId: string,
  name: string,
  workType: string,
  phoneMasked: string,
): TeamTaskWorker => ({
  memberId,
  name,
  workType,
  phoneMasked,
  projectId: "project-1",
  projectName: "滨江花园一期",
  teamId: "team-1",
  teamName: "钢筋一班",
});
const crew = [
  worker("m1", "张建国", "钢筋工", "138****0001"),
  worker("m2", "赵大勇", "钢筋工", "137****0012"),
  worker("m3", "刘海", "普工", "136****0031"),
  worker("m4", "陈国强", "", "135****0044"),
];

describe("工作安排的时间怎么说", () => {
  it("今天、明天、昨天用口语，其余写几月几日", () => {
    expect(taskDayLabel("2026-11-18", "2026-11-18")).toBe("今天");
    expect(taskDayLabel("2026-11-19", "2026-11-18")).toBe("明天");
    expect(taskDayLabel("2026-11-17", "2026-11-18")).toBe("昨天");
    expect(taskDayLabel("2026-12-01", "2026-11-18")).toBe("12月1日");
  });

  it("当天的安排只写一次日期，夜班的结束写次日", () => {
    expect(
      dayTimeRange("2026-11-18", "08:00", "2026-11-18", "17:30", "2026-11-18"),
    ).toBe("今天 08:00 到 17:30");
    expect(
      dayTimeRange("2026-11-18", "22:00", "2026-11-19", "06:00", "2026-11-18"),
    ).toBe("今天 22:00 到 次日 06:00");
    expect(
      dayTimeRange("2026-11-20", "08:00", "2026-11-22", "06:00", "2026-11-18"),
    ).toBe("11月20日 08:00 到 11月22日 06:00");
  });

  it("按中国时间读安排的起止，不受存的是哪个时区影响", () => {
    const night = task({
      startsAt: "2026-11-18T14:00:00.000Z",
      endsAt: "2026-11-18T22:00:00.000Z",
    });
    expect(taskTimeRange(night, "2026-11-18")).toBe("今天 22:00 到 次日 06:00");
    expect(taskHours(night)).toBe("8.0");
    expect(taskHours(task())).toBe("9.5");
  });

  it("列表按天看：开始在这一天只写几点，前一天开始的写上日期", () => {
    expect(taskListTime(task(), "2026-11-18")).toBe("08:00 到 17:30");
    const night = task({
      startsAt: "2026-11-17T22:00:00+08:00",
      endsAt: "2026-11-18T06:00:00+08:00",
    });
    expect(taskListTime(night, "2026-11-17")).toBe("22:00 到 次日 06:00");
    expect(taskListTime(night, "2026-11-18")).toBe(
      "11月17日 22:00 到 次日 06:00",
    );
  });
});

describe("列表顶上的一句话", () => {
  it("同一个人排了两项只算一个人，取消的安排不算人", () => {
    const summary = summarizeTasks(
      [
        task({
          id: "a",
          assignments: [person({ memberId: "m1" }), person({ memberId: "m2" })],
        }),
        task({
          id: "b",
          status: "COMPLETED",
          assignments: [person({ memberId: "m2" }), person({ memberId: "m3" })],
        }),
        task({
          id: "c",
          status: "CANCELLED",
          assignments: [person({ memberId: "m4" })],
        }),
      ],
      "2026-11-18",
      "2026-11-18",
    );
    expect(summary).toEqual({
      title: "今天 3 项安排",
      sub: "已安排 3 人，1 项待完成",
    });
  });

  it("没有待完成的就直说，不是今天就写日期", () => {
    expect(
      summarizeTasks(
        [
          task({
            status: "COMPLETED",
            assignments: [person({ memberId: "m1" })],
          }),
        ],
        "2026-11-20",
        "2026-11-18",
      ),
    ).toEqual({ title: "11月20日 1 项安排", sub: "已安排 1 人，没有待完成的" });
  });
});

describe("表单里“安排人员”一行", () => {
  it("两个短名字都写出来，多了加上总人数", () => {
    expect(peopleSummary([])).toBe("");
    expect(peopleSummary(["张建国"])).toBe("张建国");
    expect(peopleSummary(["张建国", "刘海"])).toBe("张建国、刘海");
    expect(peopleSummary(["张建国", "赵大勇", "刘海"])).toBe(
      "张建国、赵大勇 等 3 人",
    );
  });

  it("名字长就只写第一个，免得把人数挤掉", () => {
    expect(peopleSummary(["欧阳建国", "赵大勇", "刘海"])).toBe(
      "欧阳建国 等 3 人",
    );
    expect(peopleSummary(["阿卜杜热合曼", "刘海"])).toBe("阿卜杜热… 等 2 人");
  });
});

describe("安排详情里每个人一行", () => {
  it("本班的人写工种：没开工的可以撤下，开工了显示几点开的工", () => {
    const rows = taskPeople(
      task({
        assignments: [
          person({
            memberId: "m1",
            name: "张建国",
            startedAt: "2026-11-18T00:05:00.000Z",
          }),
          person({ memberId: "m2", name: "赵大勇" }),
          person({ memberId: "m4", name: "陈国强" }),
        ],
      }),
      crew,
    );
    expect(rows).toEqual([
      {
        memberId: "m1",
        name: "张建国",
        sub: "钢筋工",
        status: { kind: "ok", text: "08:05 开工" },
        action: null,
      },
      {
        memberId: "m2",
        name: "赵大勇",
        sub: "钢筋工，还没开工",
        status: null,
        action: "remove",
      },
      {
        memberId: "m4",
        name: "陈国强",
        sub: "还没开工",
        status: null,
        action: "remove",
      },
    ]);
  });

  it("临时工干完了等确认退场，确认过就只显示已退场", () => {
    const rows = taskPeople(
      task({
        assignments: [
          person({
            memberId: "t1",
            name: "周强",
            source: "TEMPORARY_INVITE",
            taskAttendanceOnly: true,
            startedAt: "2026-11-18T00:00:00.000Z",
            finishedAt: "2026-11-18T07:00:00.000Z",
            workedMinutes: 420,
          }),
          person({
            memberId: "t2",
            name: "孙立",
            source: "TEMPORARY_INVITE",
            taskAttendanceOnly: true,
            startedAt: "2026-11-18T00:00:00.000Z",
            finishedAt: "2026-11-18T07:00:00.000Z",
            workedMinutes: 420,
            exitConfirmedAt: "2026-11-18T08:00:00.000Z",
          }),
          person({
            memberId: "t3",
            name: "吴兵",
            source: "TEMPORARY_INVITE",
            taskAttendanceOnly: true,
            startedAt: "2026-11-18T00:00:00.000Z",
          }),
        ],
      }),
      crew,
    );
    expect(
      rows.map((row) => [row.sub, row.status?.text ?? null, row.action]),
    ).toEqual([
      ["临时工，420 分钟", null, "exit"],
      ["临时工，420 分钟", "已退场", null],
      ["临时工，等完工打卡", "08:00 开工", null],
    ]);
  });

  it("安排结束以后不能再撤人，但干完的临时工还能确认退场", () => {
    const rows = taskPeople(
      task({
        status: "COMPLETED",
        assignments: [
          person({ memberId: "m2", name: "赵大勇" }),
          person({
            memberId: "t1",
            name: "周强",
            taskAttendanceOnly: true,
            startedAt: "2026-11-18T00:00:00.000Z",
            finishedAt: "2026-11-18T07:00:00.000Z",
            workedMinutes: 420,
          }),
        ],
      }),
      null,
    );
    expect(rows.map((row) => row.action)).toEqual([null, "exit"]);
    // 人员名单还没读到时不知道工种，只写进度
    expect(rows[0]?.sub).toBe("还没开工");
  });

  it("有人开过工就不能再改内容和时间", () => {
    expect(
      taskEditable(task({ assignments: [person({ memberId: "m1" })] })),
    ).toBe(true);
    expect(
      taskEditable(
        task({
          assignments: [
            person({ memberId: "m1", startedAt: "2026-11-18T00:05:00.000Z" }),
          ],
        }),
      ),
    ).toBe(false);
    expect(taskEditable(task({ status: "COMPLETED" }))).toBe(false);
  });
});

describe("选择人员", () => {
  it("工种不重复，没填工种的不单列", () => {
    expect(workerTrades(crew)).toEqual(["钢筋工", "普工"]);
  });

  it("按工种和关键字一起筛，手机尾号也能搜", () => {
    expect(filterWorkers(crew, "", "").map((row) => row.memberId)).toEqual([
      "m1",
      "m2",
      "m3",
      "m4",
    ]);
    expect(
      filterWorkers(crew, "", "钢筋工").map((row) => row.memberId),
    ).toEqual(["m1", "m2"]);
    expect(
      filterWorkers(crew, " 0031 ", "").map((row) => row.memberId),
    ).toEqual(["m3"]);
    expect(filterWorkers(crew, "刘", "钢筋工")).toEqual([]);
  });

  it("点一个人就是选上或者去掉", () => {
    expect(toggleWorker(["m1"], "m2")).toEqual(["m1", "m2"]);
    expect(toggleWorker(["m1", "m2"], "m1")).toEqual(["m2"]);
  });

  it("全选只动眼前筛出来的人，别处选的不受影响", () => {
    const rebar = filterWorkers(crew, "", "钢筋工");
    const first = toggleAllWorkers(["m3"], rebar, []);
    expect(first).toEqual({ allSelected: false, next: ["m3", "m1", "m2"] });
    const second = toggleAllWorkers(first?.next ?? [], rebar, []);
    expect(second).toEqual({ allSelected: true, next: ["m3"] });
  });

  it("已经在安排里的人不参与全选；筛出来的都在安排里就没有全选", () => {
    expect(toggleAllWorkers([], crew, ["m1", "m2"])).toEqual({
      allSelected: false,
      next: ["m3", "m4"],
    });
    expect(
      toggleAllWorkers([], filterWorkers(crew, "", "钢筋工"), ["m1", "m2"]),
    ).toBeNull();
  });
});

describe("打卡安排里每张卡的要求", () => {
  it("下班卡说早退，其余说迟到；中途签到把类型写上", () => {
    expect(graceLabel("START")).toBe("迟到宽限");
    expect(graceLabel("END")).toBe("早退宽限");
    expect(pointRule({ kind: "START", graceMins: 10 })).toBe(
      "迟到宽限 10 分钟",
    );
    expect(pointRule({ kind: "END", graceMins: 0 })).toBe("早退宽限 0 分钟");
    expect(pointRule({ kind: "CHECKPOINT", graceMins: 5 })).toBe(
      "中途签到，迟到宽限 5 分钟",
    );
  });
});
