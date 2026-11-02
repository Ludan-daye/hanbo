import type { AttendanceTodayPoint } from "./me.types";
import {
  hasAttendanceToday,
  projectAttendanceProgress,
  type ProjectAttendance,
} from "./project-attendance";
import { formatChinaDate, formatChinaHm } from "./time";

export type WorkerHomePreference =
  | { readonly projectId: string }
  | { readonly requireSelection: true }
  | null;

export type WorkerHomeSelection = {
  readonly projectId: string | null;
  readonly reason:
    | "empty"
    | "single"
    | "remembered"
    | "choice-required"
    | "invalid";
  readonly preference: WorkerHomePreference;
};

export type WorkerOtherProjectSummary = {
  readonly pendingProjects: number;
  readonly remainingPoints: number;
  readonly abnormalProjects: number;
  readonly unknownProjects: number;
};

export const workerHomeStorageKey = (scope: {
  readonly userId: string;
  readonly dataMode: "demo" | "http";
  readonly apiBaseUrl: string;
}): string =>
  `workerHomeSelection:v1:${JSON.stringify([
    scope.dataMode,
    scope.apiBaseUrl.replace(/\/+$/, ""),
    scope.userId,
  ])}`;

/** Resolve only after a successful membership read, never from loading/error placeholders.
 * Persist the returned preference: removing an invalid ID alone would auto-select a
 * different sole project on the next refresh. An explicit choice clears the marker.
 */
export const resolveWorkerHomeSelection = (
  entries: readonly ProjectAttendance[],
  preference: WorkerHomePreference,
): WorkerHomeSelection => {
  if (preference !== null && "projectId" in preference) {
    return entries.some(
      (entry) => entry.project.projectId === preference.projectId,
    )
      ? { projectId: preference.projectId, reason: "remembered", preference }
      : {
          projectId: null,
          reason: "invalid",
          preference: { requireSelection: true },
        };
  }
  if (entries.length === 0)
    return { projectId: null, reason: "empty", preference };
  if (preference !== null)
    return { projectId: null, reason: "choice-required", preference };
  if (entries.length === 1) {
    const projectId = entries[0].project.projectId;
    return { projectId, reason: "single", preference: { projectId } };
  }
  return { projectId: null, reason: "choice-required", preference: null };
};

/** Pending project counts include abnormal results, with no double-counting.
 * Failed or mismatched-date schedule reads remain unknown rather than appearing
 * completed or absent. Pass the displayed attendance date to guard a day rollover.
 */
export const summarizeOtherWorkerProjects = (
  entries: readonly ProjectAttendance[],
  currentProjectId: string | null,
  attendanceDate?: string,
): WorkerOtherProjectSummary => {
  let pendingProjects = 0;
  let remainingPoints = 0;
  let abnormalProjects = 0;
  let unknownProjects = 0;
  for (const entry of entries) {
    if (entry.project.projectId === currentProjectId) continue;
    if (
      entry.status === "error" ||
      (attendanceDate !== undefined &&
        entry.today.attendanceDate !== attendanceDate)
    ) {
      unknownProjects += 1;
      continue;
    }
    const progress = projectAttendanceProgress(entry);
    const remaining = hasAttendanceToday(entry)
      ? progress.total - progress.completed
      : 0;
    const result = entry.today.result;
    const abnormal =
      progress.abnormal > 0 ||
      Boolean(
        result?.isAbsent ||
        result?.isEarlyLeave ||
        result?.isLate ||
        result?.isMissingPunch,
      );
    remainingPoints += remaining;
    if (abnormal) abnormalProjects += 1;
    if (remaining > 0 || abnormal) pendingProjects += 1;
  }
  return {
    pendingProjects,
    remainingPoints,
    abnormalProjects,
    unknownProjects,
  };
};

/** Match punch/index.tsx nextOpenPoint: latest due unrecorded point, else first open.
 * Keep the server's point order and custom codes; invalid records are not repunched.
 */
export const workerHomeNextPoint = (
  entry: ProjectAttendance,
  now: string,
): AttendanceTodayPoint | null => {
  if (
    !hasAttendanceToday(entry) ||
    entry.today.attendanceDate !== formatChinaDate(now)
  )
    return null;
  const points = entry.today.points.filter((point) => point.record === null);
  const time = formatChinaHm(now);
  const due = points.filter((point) => point.scheduledTime <= time);
  return due[due.length - 1] ?? points[0] ?? null;
};
