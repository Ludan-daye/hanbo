import type {
  AttendanceRecord,
  Makeup,
  MyAttendanceDay,
  MyProjectMembership,
} from "./me.types";

export type AttendanceRange = "TODAY" | "WEEK" | "MONTH" | "CUSTOM";
export type AttendanceWindow = { readonly from: string; readonly to: string };
export type AttendanceLayers = {
  readonly days: readonly MyAttendanceDay[];
  readonly records: readonly AttendanceRecord[];
  readonly makeups: readonly Makeup[];
};
export const attendanceRequestKey = (
  from: string,
  to: string,
  revision: number,
  today: string,
): string => `${from}:${to}:${revision}:${today}`;
export const attendanceProjectOptions = (
  projects: readonly MyProjectMembership[],
  layers: AttendanceLayers | null,
  selectedId: string | null,
): { id: string; name: string }[] => {
  const names = new Map<string, string>();
  projects.forEach((project) =>
    names.set(project.projectId, project.projectName),
  );
  layers?.days.forEach((day) => {
    if (day.projectName && !names.has(day.projectId))
      names.set(day.projectId, day.projectName);
  });
  const ids = [
    ...new Set([
      ...projects.map((row) => row.projectId),
      ...(layers
        ? [...layers.days, ...layers.records, ...layers.makeups].map(
            (row) => row.projectId,
          )
        : []),
      ...(selectedId ? [selectedId] : []),
    ]),
  ];
  return [
    { id: "", name: "全部项目" },
    ...ids.map((id) => ({ id, name: names.get(id) ?? `项目 ${id}` })),
  ];
};
export type WorkerRecordDay = {
  readonly key: string;
  readonly date: string;
  readonly projectId: string;
  summary: MyAttendanceDay | null;
  readonly records: AttendanceRecord[];
  readonly makeups: Makeup[];
};

export const attendanceWindow = (
  range: AttendanceRange,
  today: string,
  custom: AttendanceWindow,
): AttendanceWindow => {
  if (range === "CUSTOM") return custom;
  if (range === "TODAY") return { from: today, to: today };
  if (range === "MONTH") return { from: `${today.slice(0, 7)}-01`, to: today };
  const first = new Date(`${today}T00:00:00Z`);
  first.setUTCDate(first.getUTCDate() - 6);
  return { from: first.toISOString().slice(0, 10), to: today };
};

export const attendanceRangeError = (
  from: string,
  to: string,
): string | null => {
  if (from > to) return "开始日期不能晚于结束日期。";
  const elapsed =
    Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  if (!Number.isFinite(elapsed)) return "请选择有效日期。";
  return elapsed / 86400000 > 92 ? "单次最多查询 93 天，请调整日期。" : null;
};

export const filterAttendance = (
  source: AttendanceLayers,
  projectId: string | null,
  from: string,
  to: string,
): AttendanceLayers => {
  const visible = (row: {
    readonly projectId: string;
    readonly attendanceDate: string;
  }): boolean =>
    (projectId === null || row.projectId === projectId) &&
    row.attendanceDate >= from &&
    row.attendanceDate <= to;
  return {
    days: source.days.filter(visible),
    records: source.records.filter(visible),
    makeups: source.makeups.filter(
      (row) => row.status === "APPROVED" && visible(row),
    ),
  };
};

/** A visible row is the union of all three sources, never just raw punch records. */
export const groupAttendanceDays = (
  days: readonly MyAttendanceDay[],
  records: readonly AttendanceRecord[],
  makeups: readonly Makeup[],
): WorkerRecordDay[] => {
  const groups = new Map<string, WorkerRecordDay>();
  const get = (row: {
    readonly projectId: string;
    readonly attendanceDate: string;
  }): WorkerRecordDay => {
    const key = `${row.projectId}:${row.attendanceDate}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        date: row.attendanceDate,
        projectId: row.projectId,
        summary: null,
        records: [],
        makeups: [],
      };
      groups.set(key, group);
    }
    return group;
  };
  days.forEach((row) => {
    get(row).summary = row;
  });
  records.forEach((row) => {
    get(row).records.push(row);
  });
  makeups
    .filter((row) => row.status === "APPROVED")
    .forEach((row) => {
      get(row).makeups.push(row);
    });
  return [...groups.values()]
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) || a.projectId.localeCompare(b.projectId),
    )
    .map((group) => ({
      ...group,
      records: group.records.sort((a, b) =>
        a.occurredAt.localeCompare(b.occurredAt),
      ),
      makeups: group.makeups.sort((a, b) =>
        a.requestedOccurredAt.localeCompare(b.requestedOccurredAt),
      ),
    }));
};
