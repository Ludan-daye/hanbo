import type { Prisma } from "@prisma/client";
import {
  completedSafetyWorkDates,
  overtimeWorkIntervals,
  parseTaskPoint,
  taskPointCode,
  scheduledWorkIntervals,
  type WorktimeInterval,
} from "@construction/domain";
import type { AttendanceRecordInput } from "@construction/domain/attendance.js";
import { ROLE_LEVEL } from "@construction/domain/roles.js";
import {
  loadPlanningData,
  resolveAttendancePlan,
} from "../attendance/attendance-plans.js";
import { workerRole } from "../attendance/member-history.js";

type Evidence = AttendanceRecordInput & {
  readonly workerId: string;
  readonly projectId: string;
  readonly date: string;
};
/** Only completed valid record pairs and approved makeups establish a worked date. */
export const safetyWorkedDatesIn = async (
  database: Prisma.TransactionClient,
  workerIds: readonly string[],
  asOf: Date,
  snapshotAt: Date,
): Promise<ReadonlyMap<string, readonly string[]>> => {
  const [members, records, makeups, assignments] = await Promise.all([
    database.projectWorkerMember.findMany({
      where: { workerId: { in: [...workerIds] } },
      include: { worker: { select: { userId: true } } },
    }),
    database.attendanceRecord.findMany({
      where: {
        participantType: "WORKER",
        participantId: { in: [...workerIds] },
        status: "VALID",
        occurredAt: { lte: asOf },
        createdAt: { lte: snapshotAt },
      },
    }),
    database.makeupRequest.findMany({
      where: {
        participantType: "WORKER",
        participantId: { in: [...workerIds] },
        status: "APPROVED",
        requestedOccurredAt: { lte: asOf },
        approvedAt: { lte: snapshotAt },
      },
    }),
    database.teamTaskAssignment.findMany({
      where: {
        member: { workerId: { in: [...workerIds] } },
        task: { status: { not: "CANCELLED" } },
      },
      select: { taskId: true, memberId: true },
    }),
  ]);
  const planning = await loadPlanningData(database, [
    ...new Set(members.map((row) => row.projectId)),
  ]);
  const evidence: readonly Evidence[] = [
    ...records.map(
      (row): Evidence => ({
        id: row.id,
        pointCode: row.pointCode,
        occurredAt: row.occurredAt,
        isValid: true,
        source: row.source,
        workerId: row.participantId,
        projectId: row.projectId,
        date: row.attendanceDate.toISOString().slice(0, 10),
      }),
    ),
    ...makeups.map(
      (row): Evidence => ({
        id: row.id,
        pointCode: row.pointCode,
        occurredAt: row.requestedOccurredAt,
        isValid: true,
        source: "MAKEUP",
        workerId: row.participantId,
        projectId: row.projectId,
        date: row.attendanceDate.toISOString().slice(0, 10),
      }),
    ),
  ];
  const output = new Map<string, readonly string[]>();
  for (const workerId of workerIds) {
    const dates: string[] = [];
    for (const member of members.filter((row) => row.workerId === workerId)) {
      const rows = evidence.filter(
        (row) =>
          row.workerId === workerId && row.projectId === member.projectId,
      );
      const intervals: WorktimeInterval[] = [...overtimeWorkIntervals(rows)];
      const taskIds = [
        ...new Set(
          rows.flatMap((row) => {
            const point = parseTaskPoint(row.pointCode);
            return point === null ? [] : [point.taskId];
          }),
        ),
      ];
      for (const taskId of taskIds.filter((id) =>
        assignments.some(
          (row) => row.taskId === id && row.memberId === member.id,
        ),
      )) {
        const start = rows
          .filter((row) => row.pointCode === taskPointCode(taskId, "START"))
          .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())[0];
        const end = rows
          .filter((row) => row.pointCode === taskPointCode(taskId, "END"))
          .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())[0];
        if (start !== undefined && end !== undefined)
          intervals.push({
            start: start.occurredAt,
            end: end.occurredAt,
            mode: "HOURLY",
          });
      }
      for (const date of [...new Set(rows.map((row) => row.date))]) {
        const plan = resolveAttendancePlan(
          planning,
          member.projectId,
          {
            memberId: member.id,
            participantId: workerId,
            teamId: member.teamId,
            roleLevel: ROLE_LEVEL[workerRole(member.projectRoleLabel)],
            userId: member.worker.userId,
            taskAttendanceOnly: member.taskAttendanceOnly,
          },
          date,
        );
        if (plan.points.length === 0) continue;
        intervals.push(
          ...scheduledWorkIntervals(
            plan.points,
            date,
            rows.filter((row) => row.date === date),
            asOf,
            "REGULAR",
          ),
        );
      }
      dates.push(...completedSafetyWorkDates(intervals, asOf));
    }
    output.set(workerId, [...new Set(dates)].sort());
  }
  return output;
};
