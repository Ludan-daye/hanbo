import type { StatusKind } from "../components/ui/status-kind";
import type { AttendanceTodayPoint } from "./me.types";
import {
  myProjectDetailUrl,
  type ProjectAttendance,
} from "./project-attendance";
import { formatChinaDate, formatChinaHm } from "./time";
import type { WorkerReminder } from "./worker-home-reminders";
import {
  summarizeOtherWorkerProjects,
  workerHomeNextPoint,
} from "./worker-home-selection";

export type WorkerHomeSignAction =
  | { readonly label: string; readonly url: string }
  | { readonly label: string; readonly retry: true };

/** 首页标牌显示什么：要么是该打的那张卡，要么是一句结论。 */
export type WorkerHomeSign =
  | {
      readonly kind: "punch";
      readonly card: string;
      readonly before: string;
      readonly projectId: string;
    }
  | {
      readonly kind: "text";
      readonly title: string;
      readonly sub: string;
      readonly action?: WorkerHomeSignAction;
    };

/** “上班卡”“下班卡”；名称本身已经很长或带“卡”字的，原样显示。 */
export const cardName = (point: Pick<AttendanceTodayPoint, "label">): string =>
  point.label.length <= 4 && !point.label.endsWith("卡")
    ? `${point.label}卡`
    : point.label;

/** 上班要在时间之前打，下班要在时间之后打，其余时点按点打。 */
export const cardDeadline = (
  point: Pick<AttendanceTodayPoint, "kind" | "scheduledTime">,
): string =>
  point.kind === "START"
    ? `${point.scheduledTime} 前打`
    : point.kind === "END"
      ? `${point.scheduledTime} 后打`
      : `${point.scheduledTime} 打`;

/** “今天”那张表里每个时点的状态。 */
export const pointStatus = (
  point: AttendanceTodayPoint,
  next: AttendanceTodayPoint | null,
  blocked: boolean,
): { readonly kind: StatusKind; readonly text: string } => {
  if (point.record !== null) {
    const time = formatChinaHm(point.record.occurredAt);
    return point.record.status === "VALID"
      ? { kind: "ok", text: `${time} 已打卡` }
      : { kind: "bad", text: `${time} 异常` };
  }
  if (point.pointCode !== next?.pointCode)
    return { kind: "idle", text: "到点再打" };
  return blocked
    ? { kind: "idle", text: "等底照通过" }
    : { kind: "warn", text: "待打卡" };
};

const RETRY: WorkerHomeSignAction = { label: "重新读取", retry: true };

const hours = (minutes: number): string => {
  const value = minutes / 60;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
};

/**
 * 判断顺序和原来的首页一致：没项目、安排没读到、按任务考勤、没排班或休息、
 * 都打完了、底照拦着、有卡要打。
 */
export const workerHomeSign = (input: {
  /** 当前选中的项目；没有项目时为 null。 */
  readonly entry: ProjectAttendance | null;
  /** 底照或核验服务拦着不能打卡的原因；演示人脸可用时传 null。 */
  readonly blocker: WorkerReminder | null;
  /** ISO 时间。 */
  readonly now: string;
}): WorkerHomeSign => {
  const { entry, blocker, now } = input;
  if (entry === null)
    return {
      kind: "text",
      title: "还没有加入项目",
      sub: "请联系管理员分配项目和班组。",
      action: RETRY,
    };
  if (entry.status === "error")
    return {
      kind: "text",
      title: "今天的安排没读到",
      sub: entry.error,
      action: RETRY,
    };
  if (entry.today.attendanceDate !== formatChinaDate(now))
    return {
      kind: "text",
      title: "今天的安排没读到",
      sub: "日期已经变了，重新读取今天的安排。",
      action: RETRY,
    };
  const projectId = entry.project.projectId;
  if (entry.project.taskAttendanceOnly)
    return {
      kind: "text",
      title: "按任务开工、完工",
      sub: "这个项目按任务记工，到“我的任务”里打卡。",
      action: { label: "我的任务", url: "/pages/my-tasks/index" },
    };
  if (!entry.today.configured)
    return {
      kind: "text",
      title: "今天还没排班",
      sub: "请联系班组长或项目管理员设置打卡安排。",
      action: { label: "项目详情", url: myProjectDetailUrl(projectId) },
    };
  const points = entry.today.points;
  if (!entry.today.isWorkday || points.length === 0)
    return {
      kind: "text",
      title: "今天不用打卡",
      sub: entry.today.shiftName
        ? `${entry.today.shiftName}，今天休息。`
        : "今天休息。",
    };
  const next = workerHomeNextPoint(entry, now);
  if (next === null) {
    const times = points
      .map((point) =>
        point.record === null
          ? point.label
          : `${point.label} ${formatChinaHm(point.record.occurredAt)}`,
      )
      .join("，");
    if (summarizeOtherWorkerProjects([entry], null).abnormalProjects > 0)
      return {
        kind: "text",
        title: "卡打了，有异常要核对",
        sub: times,
        action: {
          label: "看今天的记录",
          url: `/pages/my-records/index?projectId=${encodeURIComponent(projectId)}&range=TODAY`,
        },
      };
    return {
      kind: "text",
      title: points.length === 1 ? "今天的卡打了" : `今天 ${points.length} 张卡都打了`,
      sub: entry.today.result
        ? `${times}，记工 ${hours(entry.today.result.workedMinutes)} 小时`
        : times,
    };
  }
  if (blocker !== null)
    return {
      kind: "text",
      title: blocker.title,
      sub: blocker.description,
      action: { label: "查看底照", url: blocker.url },
    };
  return {
    kind: "punch",
    card: cardName(next),
    before: cardDeadline(next),
    projectId,
  };
};
