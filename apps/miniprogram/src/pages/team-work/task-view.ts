import type { TeamTask, TeamTaskWorker } from "@construction/domain";

import { taskChinaParts } from "../../services/team-task-draft";
import { formatChinaHm } from "../../services/time";

// 工作安排页面上要显示的字：时间怎么说、一天的结论、每个人一行、选人时的筛选。
// 都是纯函数，页面和几个视图只管摆放。

const dayGap = (from: string, to: string): number =>
  Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86400000,
  );
const monthDay = (day: string): string => {
  const [, month, date] = day.split("-");
  return `${Number(month)}月${Number(date)}日`;
};

/** 哪一天：今天、明天、昨天，其余写成“11月18日”。 */
export const taskDayLabel = (day: string, today: string): string => {
  const gap = dayGap(today, day);
  return gap === 0
    ? "今天"
    : gap === 1
      ? "明天"
      : gap === -1
        ? "昨天"
        : monthDay(day);
};

const endLabel = (
  startDay: string,
  endDay: string,
  endTime: string,
): string => {
  const gap = dayGap(startDay, endDay);
  return gap === 0
    ? endTime
    : gap === 1
      ? `次日 ${endTime}`
      : `${monthDay(endDay)} ${endTime}`;
};

/** 表单里的时间一行：“今天 08:00 到 17:30”，夜班是“今天 22:00 到 次日 06:00”。 */
export const dayTimeRange = (
  startDay: string,
  startTime: string,
  endDay: string,
  endTime: string,
  today: string,
): string =>
  `${taskDayLabel(startDay, today)} ${startTime} 到 ${endLabel(startDay, endDay, endTime)}`;

/** 一项安排从什么时候到什么时候，带上是哪一天。 */
export const taskTimeRange = (
  task: Pick<TeamTask, "startsAt" | "endsAt">,
  today: string,
): string => {
  const [startDay, startTime] = taskChinaParts(task.startsAt);
  const [endDay, endTime] = taskChinaParts(task.endsAt);
  return dayTimeRange(startDay, startTime, endDay, endTime, today);
};

/** 列表里的时间：列表本来就是按天看的，开始在这一天就只写几点。 */
export const taskListTime = (
  task: Pick<TeamTask, "startsAt" | "endsAt">,
  listDay: string,
): string => {
  const [startDay, startTime] = taskChinaParts(task.startsAt);
  const [endDay, endTime] = taskChinaParts(task.endsAt);
  const start =
    startDay === listDay ? startTime : `${monthDay(startDay)} ${startTime}`;
  return `${start} 到 ${endLabel(startDay, endDay, endTime)}`;
};

/** 大约几个小时，留一位小数。 */
export const taskHours = (
  task: Pick<TeamTask, "startsAt" | "endsAt">,
): string =>
  ((Date.parse(task.endsAt) - Date.parse(task.startsAt)) / 3600000).toFixed(1);

/** 列表顶上的一句话：这天排了几项、安排了几个人、还有几项没完成。 */
export const summarizeTasks = (
  tasks: readonly TeamTask[],
  day: string,
  today: string,
): { readonly title: string; readonly sub: string } => {
  const open = tasks.filter((task) => task.status === "OPEN").length;
  const people = new Set(
    tasks
      .filter((task) => task.status !== "CANCELLED")
      .flatMap((task) => task.assignments.map((person) => person.memberId)),
  ).size;
  return {
    title: `${taskDayLabel(day, today)} ${tasks.length} 项安排`,
    sub: `已安排 ${people} 人，${open > 0 ? `${open} 项待完成` : "没有待完成的"}`,
  };
};

const shortName = (name: string): string =>
  name.length > 4 ? `${name.slice(0, 4)}…` : name;

/** 表单里“安排人员”一行的值：“张建国、赵大勇 等 3 人”。名字长就只写第一个。 */
export const peopleSummary = (names: readonly string[]): string => {
  const [first, second] = names;
  if (first === undefined) return "";
  if (second === undefined) return shortName(first);
  if (first.length + second.length <= 6)
    return `${first}、${second}${names.length > 2 ? ` 等 ${names.length} 人` : ""}`;
  return `${shortName(first)} 等 ${names.length} 人`;
};

export type TaskPersonRow = {
  readonly memberId: string;
  readonly name: string;
  readonly sub: string;
  readonly status: {
    readonly kind: "ok" | "idle";
    readonly text: string;
  } | null;
  /** remove：还没开工，可以撤下。exit：临时工干完了，等班组长确认退场。 */
  readonly action: "remove" | "exit" | null;
};

/** 安排详情里每个人一行：是谁、干到哪一步、现在能对他做什么。 */
export const taskPeople = (
  task: TeamTask,
  workers: readonly TeamTaskWorker[] | null,
): readonly TaskPersonRow[] =>
  task.assignments.map((person) => {
    const timed = person.taskAttendanceOnly === true;
    const who =
      timed || person.source === "TEMPORARY_INVITE"
        ? "临时工"
        : (workers?.find((worker) => worker.memberId === person.memberId)
            ?.workType ?? "");
    const progress = timed
      ? person.finishedAt
        ? `${person.workedMinutes ?? 0} 分钟`
        : person.startedAt
          ? "等完工打卡"
          : "还没开工"
      : person.startedAt
        ? ""
        : "还没开工";
    const exit = timed && Boolean(person.finishedAt) && !person.exitConfirmedAt;
    const status: TaskPersonRow["status"] =
      timed && person.exitConfirmedAt
        ? { kind: "idle", text: "已退场" }
        : exit
          ? null
          : person.finishedAt
            ? { kind: "ok", text: `${formatChinaHm(person.finishedAt)} 完工` }
            : person.startedAt
              ? { kind: "ok", text: `${formatChinaHm(person.startedAt)} 开工` }
              : null;
    return {
      memberId: person.memberId,
      name: person.name,
      sub: [who, progress].filter(Boolean).join("，"),
      status,
      action: exit
        ? "exit"
        : !person.startedAt && task.status === "OPEN"
          ? "remove"
          : null,
    };
  });

/** 还没开过工的安排才能改内容和时间。 */
export const taskEditable = (task: TeamTask): boolean =>
  task.status === "OPEN" &&
  !task.assignments.some((person) => person.startedAt);

/** 班组里有哪些工种，用来筛人。没填工种的不单列。 */
export const workerTrades = (
  workers: readonly TeamTaskWorker[],
): readonly string[] => [
  ...new Set(workers.map((worker) => worker.workType).filter(Boolean)),
];

/** 按工种和关键字（姓名、工种、手机尾号）筛人。trade 为空是全部工种。 */
export const filterWorkers = (
  workers: readonly TeamTaskWorker[],
  search: string,
  trade: string,
): readonly TeamTaskWorker[] => {
  const keyword = search.trim().toLowerCase();
  return workers.filter(
    (worker) =>
      (trade === "" || worker.workType === trade) &&
      `${worker.name} ${worker.workType} ${worker.phoneMasked}`
        .toLowerCase()
        .includes(keyword),
  );
};

/** 点一个人：选上或者去掉。 */
export const toggleWorker = (
  selectedIds: readonly string[],
  memberId: string,
): readonly string[] =>
  selectedIds.includes(memberId)
    ? selectedIds.filter((id) => id !== memberId)
    : [...selectedIds, memberId];

/** 全选只管眼前筛出来的、还不在这项安排里的人；已经都选了就是取消全选。 */
export const toggleAllWorkers = (
  selectedIds: readonly string[],
  visible: readonly TeamTaskWorker[],
  assignedIds: readonly string[],
): {
  readonly allSelected: boolean;
  readonly next: readonly string[];
} | null => {
  const ids = visible
    .filter((worker) => !assignedIds.includes(worker.memberId))
    .map((worker) => worker.memberId);
  if (ids.length === 0) return null;
  const allSelected = ids.every((id) => selectedIds.includes(id));
  return {
    allSelected,
    next: allSelected
      ? selectedIds.filter((id) => !ids.includes(id))
      : [...new Set([...selectedIds, ...ids])],
  };
};
