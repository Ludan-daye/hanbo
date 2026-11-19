import {
  statusKindFor,
  type StatusKind,
} from "../../components/ui/status-kind";
import type { AttendanceTodayPoint } from "../../services/me.types";
import {
  projectPunchUrl,
  type ProjectAttendance,
} from "../../services/project-attendance";
import { formatChinaDate } from "../../services/time";
import { workerProjectStatus } from "../../services/worker-home";
import {
  summarizeOtherWorkerProjects,
  workerHomeNextPoint,
} from "../../services/worker-home-selection";

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

/** 卡片上那一个主要操作。retry 是重新读取，其余都是去一个页面。 */
export type ProjectCardAction =
  | { readonly kind: "retry"; readonly label: string }
  | {
      readonly kind: "punch" | "tasks" | "records";
      readonly label: string;
      readonly url: string;
    };

/** “我的项目”里一张卡片显示什么。 */
export type ProjectCardView = {
  readonly status: { readonly kind: StatusKind; readonly text: string };
  /** 班组和工种下面的一句说明；没什么要说的为 null。 */
  readonly hint: string | null;
  /** 下一张该打的卡；现在没有卡要打为 null。 */
  readonly next: AttendanceTodayPoint | null;
  readonly action: ProjectCardAction;
};

// “工作中”是正常状态，按文案推断不出来。
const statusKind = (text: string): StatusKind =>
  text === "工作中" ? "ok" : statusKindFor(text);

/**
 * 判断顺序：安排没读到或不是今天的、按任务记工、有卡要打、其余。
 * 按任务记工的项目不在这里打卡，和首页标牌的说法一致。
 */
export const projectCardView = (
  entry: ProjectAttendance,
  now: string,
): ProjectCardView => {
  const today = formatChinaDate(now);
  const projectId = entry.project.projectId;
  if (entry.status === "error" || entry.today.attendanceDate !== today)
    return {
      status: { kind: "warn", text: workerProjectCardStatus(entry, now) },
      hint:
        entry.status === "error"
          ? entry.error
          : "日期已经变了，重新读取今天的安排。",
      next: null,
      action: { kind: "retry", label: "重新读取安排" },
    };
  if (entry.project.taskAttendanceOnly === true)
    return {
      status: { kind: "idle", text: "按任务打卡" },
      hint: "到“我的任务”里开工、完工，按实际分钟记工。",
      next: null,
      action: {
        kind: "tasks",
        label: "我的任务",
        url: "/pages/my-tasks/index",
      },
    };
  const text = workerProjectCardStatus(entry, now);
  const status = { kind: statusKind(text), text };
  const next = workerHomeNextPoint(entry, now);
  if (next !== null)
    return {
      status,
      hint: null,
      next,
      action: {
        kind: "punch",
        label: "去打卡",
        url: projectPunchUrl(projectId),
      },
    };
  const abnormal =
    summarizeOtherWorkerProjects([entry], null, today).abnormalProjects > 0;
  return {
    status,
    hint: !entry.today.configured
      ? "请联系管理员确认打卡安排。"
      : abnormal
        ? "有异常要核对，到本项目考勤里看原因。"
        : null,
    next: null,
    action: {
      kind: "records",
      label: "本项目考勤",
      url: `/pages/my-records/index?projectId=${encodeURIComponent(projectId)}`,
    },
  };
};

/**
 * 一屏只有一个黑按钮：几个项目都有卡要打时，给下一张卡时间最早的那个
 * （已经到点的排在还没到点的前面），时间一样就按列表顺序。
 */
export const primaryProjectId = (
  entries: readonly ProjectAttendance[],
  now: string,
): string | null => {
  let best: { readonly id: string; readonly time: string } | null = null;
  for (const entry of entries) {
    const { next } = projectCardView(entry, now);
    if (next !== null && (best === null || next.scheduledTime < best.time))
      best = { id: entry.project.projectId, time: next.scheduledTime };
  }
  return best?.id ?? null;
};
