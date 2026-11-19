import type { TeamDailySummary } from "@construction/domain";

type Person = TeamDailySummary["people"][number];

/** 分钟换成小时，一位小数，不带单位。 */
export const hoursNumber = (minutes: number): string =>
  (minutes / 60).toFixed(1);
const hours = (minutes: number): string => `${hoursNumber(minutes)} 小时`;

/** 页面顶上那句结论：几人出勤、记了多少工时，缺卡和任务完成情况。 */
export const logHeadline = (
  summary: Pick<
    TeamDailySummary,
    | "actualAttendedDays"
    | "workedMinutes"
    | "missingPunchCount"
    | "taskCount"
    | "cancelledTaskCount"
    | "completedTaskCount"
  >,
): { readonly title: string; readonly sub: string } => {
  const tasks = summary.taskCount - summary.cancelledTaskCount;
  return {
    title: `${summary.actualAttendedDays} 人出勤，记工 ${hours(summary.workedMinutes)}`,
    sub: `${
      summary.missingPunchCount > 0
        ? `缺卡 ${summary.missingPunchCount} 人次`
        : "没有缺卡"
    }，${
      tasks === 0
        ? "没有任务"
        : `任务完成 ${summary.completedTaskCount} / ${tasks}`
    }`,
  };
};

/** 有异常的人排在前面，其余保持原来的顺序。 */
export const peopleByException = (
  people: readonly Person[],
): readonly Person[] => [
  ...people.filter((person) => person.flags.length > 0),
  ...people.filter((person) => person.flags.length === 0),
];

/** 每个人名字下面的分项。有异常的人右侧显示的是异常，所以把记工也写在这里。 */
export const personSub = (person: Person): string =>
  [
    person.flags.length > 0 ? `记工 ${hours(person.workedMinutes)}` : null,
    `正常 ${hoursNumber(person.normalMinutes)}`,
    `加班 ${hoursNumber(person.overtimeMinutes)}`,
    `未分类 ${hoursNumber(person.unclassifiedMinutes)}`,
    person.safetyCreditScore === null
      ? null
      : `信用 ${person.safetyCreditScore}`,
  ]
    .filter((part): part is string => part !== null)
    .join("，");

/** 复制出去发给别人的汇报文字。 */
export const reportText = (shown: TeamDailySummary): string =>
  `${shown.workDate} ${shown.projectName} / ${shown.teamName}\n任务完成 ${shown.completedTaskCount}/${shown.taskCount - shown.cancelledTaskCount}，取消 ${shown.cancelledTaskCount}\n出勤 ${shown.actualAttendedDays} 人，实际 ${hours(shown.workedMinutes)}，缺卡 ${shown.missingPunchCount} 人次\n正常 ${hours(shown.normalMinutes)}，加班 ${hours(shown.overtimeMinutes)}，未分类 ${hours(shown.unclassifiedMinutes)}\n临时任务参与 ${shown.temporaryWorkerCount} 人\n交底 ${shown.briefingCount} 条，确认 ${shown.acknowledgementCount} 人次，待整改 ${shown.openIssueCount} 条\n${shown.tasks
    .filter((task) => task.status !== "CANCELLED")
    .map(
      (task) =>
        `• ${task.title}：${task.assignments.map((person) => person.name).join("、") || "待安排"}`,
    )
    .join("\n")}`;
