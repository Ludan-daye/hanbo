import { BadRequestException, ConflictException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { overtimePointCode, parseOvertimePoint, resolveWorktimeRule, worktimeChinaDate, type AttendanceRecordInput } from "@construction/domain";
import { readWorktimeRules } from "../worktime/worktime.service.js";
import { assertNoOpenScheduledWork, assertNoOpenTask } from "./task-attendance.js";

export type OvertimeParticipant = { readonly participantType: "WORKER" | "MANAGER"; readonly participantId: string };
export type OvertimePunch = { readonly date: string; readonly kind: "START" | "END"; readonly startedAt: Date | null };
export const loadOvertimeEvidence = async (
  db: Prisma.TransactionClient, projectId: string, participant: OvertimeParticipant,
): Promise<readonly AttendanceRecordInput[]> => {
  const where = { projectId, participantId: participant.participantId, participantType: participant.participantType, pointCode: { startsWith: "OVERTIME_" } };
  const [records, makeups] = await Promise.all([
    db.attendanceRecord.findMany({ where: { ...where, status: "VALID" }, orderBy: { occurredAt: "asc" } }),
    db.makeupRequest.findMany({ where: { ...where, status: "APPROVED" } }),
  ]);
  return [
    ...records.map((row) => ({ id: row.id, pointCode: row.pointCode, occurredAt: row.occurredAt, isValid: true, source: row.source })),
    ...makeups.map((row) => ({ id: row.id, pointCode: row.pointCode, occurredAt: row.requestedOccurredAt, isValid: true, source: "MAKEUP" as const })),
  ];
};
export const resolveOvertimeThreshold = async (db: Prisma.TransactionClient, projectId: string, date: string): Promise<string | null> => {
  const rules = await readWorktimeRules(db, [projectId]);
  const rule = resolveWorktimeRule(rules.get(projectId) ?? [], date);
  return rule.version === 0 ? null : rule.config.overtimeStart;
};
export const assertNoOpenOvertime = async (db: Prisma.TransactionClient, participant: OvertimeParticipant): Promise<void> => {
  const where = { participantId: participant.participantId, participantType: participant.participantType, pointCode: { startsWith: "OVERTIME_" } };
  const [records, makeups] = await Promise.all([
    db.attendanceRecord.findMany({ where: { ...where, status: "VALID" }, select: { projectId: true, pointCode: true } }),
    db.makeupRequest.findMany({ where: { ...where, status: "APPROVED" }, select: { projectId: true, pointCode: true } }),
  ]);
  const evidence = [...records, ...makeups];
  const endings = new Set(evidence.flatMap((row) => { const point = parseOvertimePoint(row.pointCode); return point?.kind === "END" ? [`${row.projectId}:${point.date}`] : []; }));
  const open = evidence.some((row) => { const point = parseOvertimePoint(row.pointCode); return point?.kind === "START" && !endings.has(`${row.projectId}:${point.date}`); });
  if (open) throw new ConflictException({ message: "还有未结束的加班，请先退场或补卡。" });
};
export const resolveOvertimePunch = async (
  db: Prisma.TransactionClient, projectId: string, participant: OvertimeParticipant, code: string, now: Date,
): Promise<OvertimePunch> => {
  const point = parseOvertimePoint(code);
  if (point === null) throw new BadRequestException({ message: "加班打卡时点无效。" });
  const rows = await loadOvertimeEvidence(db, projectId, participant);
  const start = rows.find((row) => row.pointCode === overtimePointCode(point.date, "START"));
  const end = rows.find((row) => row.pointCode === overtimePointCode(point.date, "END"));
  if (end !== undefined || (point.kind === "START" && start !== undefined)) throw new ConflictException({ message: "本次加班已有打卡记录，请刷新。" });
  if (point.kind === "START") {
    const threshold = await resolveOvertimeThreshold(db, projectId, point.date);
    if (point.date !== worktimeChinaDate(now) || threshold === null || now < new Date(`${point.date}T${threshold}:00+08:00`))
      throw new BadRequestException({ message: "尚未到项目设置的加班时段。" });
    if (participant.participantType === "WORKER") {
      await assertNoOpenTask(db, participant.participantId);
      await assertNoOpenScheduledWork(db, participant.participantId, now);
    }
    await assertNoOpenOvertime(db, participant);
  } else if (start === undefined || now <= start.occurredAt || now.getTime() - start.occurredAt.getTime() > 86400000) {
    throw new BadRequestException({ message: "请先加班进场；退场时间须在进场后 24 小时内。" });
  }
  return { ...point, startedAt: start?.occurredAt ?? null };
};
