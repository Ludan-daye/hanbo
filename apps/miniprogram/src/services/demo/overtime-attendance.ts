import { overtimePointCode, overtimeWorkIntervals, parseOvertimePoint, resolveWorktimeRule, worktimeChinaDate, type AttendanceRecordInput } from "@construction/domain";
import { ApiError } from "../apiClient";
import type { ProjectParticipant } from "../management.types";
import type { AttendanceToday, SubmitAttendanceRecordBody, SubmitAttendanceRecordResult } from "../me.types";
import { chinaToday } from "../time";
import { requireDemoSafety } from "./attendance-safety";
import { demoMemberEligible, demoMemberOn } from "./member-history";
import { demoDaySummary } from "./reports";
import { effectiveDemoPlan } from "./plans";
import { makeDemoRecord, type DemoState } from "./state";

const evidence = (state: DemoState, person: ProjectParticipant): readonly AttendanceRecordInput[] => [
  ...state.records.filter((row) => row.projectId === person.projectId && row.participantId === person.profileId && row.status === "VALID").map((row) => ({ id: row.id, occurredAt: new Date(row.occurredAt), pointCode: row.pointCode, isValid: true, source: "DEVICE" as const })),
  ...state.makeups.filter((row) => row.projectId === person.projectId && row.participantId === person.profileId && row.status === "APPROVED").map((row) => ({ id: row.id, occurredAt: new Date(row.requestedOccurredAt), pointCode: row.pointCode, isValid: true, source: "MAKEUP" as const })),
];
export const demoOvertimeToday = (state: DemoState, person: ProjectParticipant): AttendanceToday => {
  const project = state.projects.find((row) => row.id === person.projectId);
  if (!project) throw new ApiError(404, "项目不存在。", {});
  const records = evidence(state, person);
  const open = overtimeWorkIntervals(records).find((row) => row.end === null);
  const date = open === undefined ? chinaToday() : worktimeChinaDate(open.start);
  const rule = resolveWorktimeRule((state.worktimeRules ?? []).filter((row) => row.projectId === person.projectId), date);
  const threshold = rule.version === 0 ? null : rule.config.overtimeStart;
  const start = records.find((row) => row.pointCode === overtimePointCode(date, "START"));
  const end = records.find((row) => row.pointCode === overtimePointCode(date, "END"));
  const kinds = start === undefined ? ["START" as const] : ["START" as const, "END" as const];
  return {
    attendanceDate: chinaToday(), configured: true,
    isWorkday: project.status === "ACTIVE" && person.status === "ACTIVE" && !person.taskAttendanceOnly && person.requiresAttendance && demoMemberEligible(demoMemberOn(state, person, chinaToday()), chinaToday()) && (threshold !== null || start !== undefined),
    shiftName: threshold === null ? "项目尚未设置加班时段" : "加班打卡",
    geofence: { centerLatitude: project.centerLatitude, centerLongitude: project.centerLongitude, radiusM: project.geofenceRadiusM, locationAccuracyLimitM: null }, result: null,
    points: kinds.map((kind) => { const record = kind === "START" ? start : end; return { pointCode: overtimePointCode(date, kind), kind, label: kind === "START" ? "加班进场" : "加班退场", graceMins: 0, scheduledTime: kind === "START" ? threshold ?? "00:00" : "00:00", record: record === undefined ? null : { occurredAt: record.occurredAt.toISOString(), status: "VALID", abnormalReason: null } }; }),
  };
};
export const requireDemoOvertimeEnd = (state: DemoState, person: ProjectParticipant, code: string, occurredAt: string): void => {
  const point = parseOvertimePoint(code);
  if (point?.kind !== "END") throw new ApiError(400, "仅支持加班退场补卡。", {});
  const records = evidence(state, person);
  const start = records.find((row) => row.pointCode === overtimePointCode(point.date, "START"));
  const stamp = Date.parse(occurredAt);
  if (records.some((row) => row.pointCode === code)) throw new ApiError(409, "加班已退场。", {});
  if (!start || !Number.isFinite(stamp) || stamp <= start.occurredAt.getTime() || stamp > Date.now() || stamp - start.occurredAt.getTime() > 86400000) throw new ApiError(400, "退场时间须在实际进场后 24 小时内。", {});
};
export const punchDemoOvertime = (state: DemoState, userId: string, person: ProjectParticipant, body: SubmitAttendanceRecordBody): { readonly state: DemoState; readonly data: SubmitAttendanceRecordResult } => {
  const today = demoOvertimeToday(state, person);
  const point = parseOvertimePoint(body.pointCode);
  if (!today.isWorkday || !point || !today.points.some((row) => row.pointCode === body.pointCode && row.record === null)) throw new ApiError(400, "当前加班时点不可打卡。", {});
  if (body.attendanceDate !== chinaToday() || Math.abs(Date.parse(body.occurredAt) - Date.now()) > 60000) throw new ApiError(400, "打卡时间须为当前时间。", {});
  if (point.kind === "START") {
    const threshold = today.points[0]!.scheduledTime;
    if (Date.now() < Date.parse(`${chinaToday()}T${threshold}:00+08:00`)) throw new ApiError(400, "尚未到加班时段。", {});
    const people = state.people.filter((row) => row.profileId === person.profileId);
    for (const member of people) {
      if (overtimeWorkIntervals(evidence(state, member)).some((row) => row.end === null)) throw new ApiError(409, "还有未结束的加班。", {});
      const summary = demoDaySummary(state, member, chinaToday());
      const points = effectiveDemoPlan(state, member, chinaToday()).points;
      const open = points.some((row, index) => row.kind === "START" && summary.selectedRecords[row.code] !== undefined && summary.selectedRecords[points.slice(index + 1).find((item) => item.kind === "END")?.code ?? ""] === undefined);
      if (open) throw new ApiError(409, "请先结束常规工作。", {});
    }
    if (state.teamWork?.tasks.some((task) => task.assignments.some((row) => people.some((member) => member.memberId === row.memberId) && row.startedAt && !row.finishedAt))) throw new ApiError(409, "请先结束临时任务。", {});
  } else requireDemoOvertimeEnd(state, person, body.pointCode, body.occurredAt);
  requireDemoSafety(state, userId, person, body);
  const record = { ...makeDemoRecord(person, body.attendanceDate, body.pointCode, body.occurredAt), ...body, pointLabel: point.kind === "START" ? "加班进场" : "加班退场" };
  const next = { ...state, records: [...state.records, record] };
  return { state: next, data: { record, result: demoDaySummary(next, person, body.attendanceDate) } };
};
