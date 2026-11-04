import type {
  TeamTaskDefaults,
  TeamTaskDetails,
  TeamTaskTemplate,
  TeamTaskWorker,
} from "@construction/domain";

export const taskChinaParts = (value: string): readonly [string, string] => {
  const timestamp: string = new Date(
    Date.parse(value) + 8 * 3600000,
  ).toISOString();
  return [timestamp.slice(0, 10), timestamp.slice(11, 16)];
};

export const newTaskDetails = (
  date: string,
  defaults: TeamTaskDefaults,
): TeamTaskDetails => {
  const first = defaults.points[0];
  const last = defaults.points.at(-1);
  if (first === undefined || last === undefined)
    throw new Error("当前班组班次缺少上下班时间，请先完善排班。");
  return {
    title: "",
    description: "",
    workType: defaults.workType,
    startsAt: `${date}T${first.time}:00+08:00`,
    endsAt: `${date}T${last.time}:00+08:00`,
  };
};

/** Reuse task content on the chosen date; never copy punches, invitations or departed workers. */
export const reuseTaskTemplate = (
  template: TeamTaskTemplate,
  date: string,
  workers: readonly TeamTaskWorker[],
): {
  readonly details: TeamTaskDetails;
  readonly memberIds: readonly string[];
  readonly omittedCount: number;
} => {
  const startsAt: string = `${date}T${taskChinaParts(template.startsAt)[1]}:00+08:00`;
  const duration: number =
    Date.parse(template.endsAt) - Date.parse(template.startsAt);
  const memberIds: readonly string[] = template.memberIds.filter((id) =>
    workers.some((worker) => worker.memberId === id),
  );
  return {
    details: {
      title: template.title,
      description: template.description,
      workType: template.workType,
      startsAt,
      endsAt: new Date(Date.parse(startsAt) + duration).toISOString(),
    },
    memberIds,
    omittedCount: template.previousMemberCount - memberIds.length,
  };
};
