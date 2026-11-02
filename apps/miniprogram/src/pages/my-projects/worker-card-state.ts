import type { ProjectAttendance } from "../../services/project-attendance";
import { formatChinaDate } from "../../services/time";
import { workerProjectStatus } from "../../services/worker-home";
import { summarizeOtherWorkerProjects } from "../../services/worker-home-selection";

export const workerProjectCardStatus = (
  entry: ProjectAttendance,
  now: string,
): string => {
  if (
    entry.status === "error" ||
    entry.today.attendanceDate !== formatChinaDate(now)
  )
    return "安排待确认";
  if (!entry.today.configured) return "待安排";
  if (!entry.today.isWorkday || entry.today.points.length === 0)
    return "今日无需打卡";
  if (
    summarizeOtherWorkerProjects([entry], null, formatChinaDate(now))
      .abnormalProjects > 0
  )
    return "考勤有异常";
  return workerProjectStatus(entry.today, now);
};
