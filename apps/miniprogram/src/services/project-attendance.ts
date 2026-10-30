import type { ApiClient } from "./apiClient";
import type { AttendanceToday, MyProjectMembership } from "./me.types";
import { chinaToday } from "./time";

export type ReadyProjectAttendance = {
  readonly project: MyProjectMembership;
  readonly status: "ready";
  readonly today: AttendanceToday;
};
export type ProjectAttendance =
  | ReadyProjectAttendance
  | {
      readonly project: MyProjectMembership;
      readonly status: "error";
      readonly error: string;
    };
export type ProjectAttendanceProgress = {
  readonly completed: number;
  readonly total: number;
  readonly abnormal: number;
  readonly label: string;
};

export const projectPunchUrl = (projectId: string): string =>
  `/pages/punch/index?projectId=${encodeURIComponent(projectId)}`;

export const myProjectDetailUrl = (projectId: string): string =>
  `/pages/my-project-detail/index?projectId=${encodeURIComponent(projectId)}`;

export const hasAttendanceToday = (
  entry: ProjectAttendance,
): entry is ReadyProjectAttendance =>
  entry.status === "ready" &&
  entry.today.configured &&
  entry.today.isWorkday &&
  entry.today.points.length > 0;

export const projectAttendanceProgress = (
  entry: ReadyProjectAttendance,
): ProjectAttendanceProgress => {
  const completed = entry.today.points.filter(
    (point) => point.record !== null,
  ).length;
  const total = entry.today.points.length;
  const abnormal = entry.today.points.filter(
    (point) => point.record?.status === "INVALID",
  ).length;
  const label = !entry.today.configured
    ? "暂无安排"
    : !entry.today.isWorkday || total === 0
      ? "今日无需打卡"
      : completed === total
        ? abnormal > 0
          ? "已打卡 · 有异常"
          : "今日已完成"
        : completed > 0
          ? "打卡进行中"
          : "今日待打卡";
  return { completed, total, abnormal, label };
};

const readProjectAttendance = async (
  client: ApiClient,
  project: MyProjectMembership,
): Promise<ProjectAttendance> => {
  try {
    const today = await client.request<AttendanceToday>(
      `/me/projects/${encodeURIComponent(project.projectId)}/attendance-today`,
      { method: "GET" },
    );
    if (today.attendanceDate !== chinaToday())
      throw new Error("日期已更新，请重新加载今日安排。");
    return { project, status: "ready", today };
  } catch (reason: unknown) {
    return {
      project,
      status: "error",
      error:
        reason instanceof Error
          ? reason.message
          : "无法读取该项目的今日安排，请重试。",
    };
  }
};

/** Bound concurrent reads while keeping failures visible on their own project cards. */
export const fetchMyProjectAttendance = async (
  client: ApiClient,
): Promise<readonly ProjectAttendance[]> => {
  const projects = await client.request<readonly MyProjectMembership[]>(
    "/me/projects",
    { method: "GET" },
  );
  const entries: ProjectAttendance[] = [];
  for (let start = 0; start < projects.length; start += 3) {
    entries.push(
      ...(await Promise.all(
        projects
          .slice(start, start + 3)
          .map((project) => readProjectAttendance(client, project)),
      )),
    );
  }
  return entries;
};
