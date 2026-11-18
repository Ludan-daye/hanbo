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
    | "suggested"
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
  now?: string,
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
  // 多个项目且没有记住的选择时，若只有一个项目今天还有待打卡时点，直接展示它；
  // 不写入偏好，工人仍可“切换项目”。
  if (now !== undefined) {
    const pending = entries.filter(
      (entry) => workerHomeNextPoint(entry, now) !== null,
    );
    if (pending.length === 1)
      return {
        projectId: pending[0].project.projectId,
        reason: "suggested",
        preference: null,
      };
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

export type LeaderPunchSummary =
  | { readonly kind: "none" }
  | { readonly kind: "unknown" }
  | {
      readonly kind: "done";
      readonly completed: number;
      readonly total: number;
      readonly abnormal: boolean;
    }
  | {
      readonly kind: "pending";
      readonly projectId: string;
      readonly projectName: string;
      readonly pointLabel: string;
      readonly scheduledTime: string;
      readonly completed: number;
      readonly total: number;
      readonly otherProjects: number;
    };

/** Summarize a manager's own punches; task-only projects punch from 我的任务. */
export const leaderPunchSummary = (
  entries: readonly ProjectAttendance[],
  now: string,
): LeaderPunchSummary => {
  const punchable = entries.filter(
    (entry) => entry.project.taskAttendanceOnly !== true,
  );
  const pending = punchable.flatMap((entry) => {
    const point = workerHomeNextPoint(entry, now);
    return point !== null && entry.status === "ready" ? [{ entry, point }] : [];
  });
  if (pending.length > 0) {
    const { entry, point } = pending[0];
    const progress = projectAttendanceProgress(entry);
    return {
      kind: "pending",
      projectId: entry.project.projectId,
      projectName: entry.project.projectName,
      pointLabel: point.label,
      scheduledTime: point.scheduledTime,
      completed: progress.completed,
      total: progress.total,
      otherProjects: pending.length - 1,
    };
  }
  const today = formatChinaDate(now);
  if (
    punchable.some(
      (entry) =>
        entry.status === "error" ||
        (hasAttendanceToday(entry) && entry.today.attendanceDate !== today),
    )
  )
    return { kind: "unknown" };
  const scheduled = punchable.filter(hasAttendanceToday);
  if (scheduled.length === 0) return { kind: "none" };
  const progress = scheduled.map(projectAttendanceProgress);
  return {
    kind: "done",
    completed: progress.reduce((sum, row) => sum + row.completed, 0),
    total: progress.reduce((sum, row) => sum + row.total, 0),
    abnormal: progress.some((row) => row.abnormal > 0),
  };
};
