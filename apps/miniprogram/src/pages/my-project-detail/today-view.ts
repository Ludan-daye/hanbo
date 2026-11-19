import type { MyProjectDetail } from "@construction/domain";

import type {
  AttendanceToday,
  AttendanceTodayPoint,
} from "../../services/me.types";
import { workerHomeNextPoint } from "../../services/worker-home-selection";

export const PROJECT_STATUS_LABEL: Readonly<
  Record<MyProjectDetail["status"], string>
> = {
  PREPARING: "筹备中",
  ACTIVE: "进行中",
  SUSPENDED: "已暂停",
  COMPLETED: "已完工",
};

/** “2026-11-18” 显示成 “11月18日”。 */
export const monthDayLabel = (date: string): string => {
  const [, month, day] = date.split("-");
  return `${Number(month)}月${Number(day)}日`;
};

export const pointGrace = (
  point: Pick<AttendanceTodayPoint, "kind" | "graceMins">,
): string =>
  point.kind === "START"
    ? `迟到宽限 ${point.graceMins} 分钟`
    : point.kind === "END"
      ? `早退宽限 ${point.graceMins} 分钟`
      : `宽限 ${point.graceMins} 分钟`;

/**
 * 今天为什么没有卡可打；正常排了班的工作日为 null。
 * 判断顺序和这一页原来的“当前状态”一致：不用考勤、项目没开放、按任务记工、没排班、休息。
 */
export const projectTodayNote = (
  project: Pick<
    MyProjectDetail,
    "requiresAttendance" | "status" | "taskAttendanceOnly"
  >,
  today: Pick<
    AttendanceToday,
    "configured" | "isWorkday" | "points" | "shiftName"
  >,
): { readonly title: string; readonly sub: string } | null => {
  if (!project.requiresAttendance)
    return { title: "这个项目不用考勤", sub: "你在这个项目里不需要打卡。" };
  if (project.status !== "ACTIVE")
    return {
      title: "项目现在不开放打卡",
      sub: `项目${PROJECT_STATUS_LABEL[project.status]}。`,
    };
  if (project.taskAttendanceOnly === true)
    return {
      title: "按任务开工、完工",
      sub: "这个项目按任务记工，到“我的任务”里打卡。",
    };
  if (!today.configured)
    return {
      title: "今天还没排班",
      sub: "请联系班组长或项目管理员设置打卡安排。",
    };
  if (!today.isWorkday || today.points.length === 0)
    return {
      title: "今天不用打卡",
      sub: today.shiftName ? `${today.shiftName}，今天休息。` : "今天休息。",
    };
  return null;
};

/** 现在该打的那张卡，算法和首页、打卡页是同一个。 */
export const projectNextPoint = (
  today: AttendanceToday,
  now: string,
): AttendanceTodayPoint | null =>
  workerHomeNextPoint(
    {
      // 这个算法只看今天的安排，项目信息用不到。
      project: {
        projectId: "",
        projectName: "",
        projectRoleLabel: "",
        teamId: null,
        teamName: null,
      },
      status: "ready",
      today,
    },
    now,
  );
