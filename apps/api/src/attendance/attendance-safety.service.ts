import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import type {
  Prisma,
  ProfileOwnerType,
  AttendanceSafetyConfirmation,
} from "@prisma/client";
import {
  ATTENDANCE_SAFETY_TEXT,
  ATTENDANCE_SAFETY_VERSION,
  type AttendanceSafetyNotice,
  type AttendanceSafetyReceipt,
  type ConfirmAttendanceSafety,
} from "@construction/domain";
import { PrismaService } from "../infrastructure/database/prisma.service.js";

export type AttendanceSafetyContext = {
  readonly userId: string;
  readonly projectId: string;
  readonly teamId: string | null;
  readonly memberId: string;
  readonly participantType: ProfileOwnerType;
  readonly participantId: string;
  readonly attendanceDate: string;
  readonly pointCode: string;
};
export const lockSafetyDay = async (
  database: Prisma.TransactionClient,
  teamId: string | null,
  date: string,
): Promise<void> => {
  if (teamId !== null)
    await database.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`safety-day:${teamId}:${date}`}, 0))`;
};
const equalIds = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length &&
  [...a].sort().every((id, index) => id === [...b].sort()[index]);

@Injectable()
export class AttendanceSafetyService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  async notice(
    database: Prisma.TransactionClient,
    context: AttendanceSafetyContext,
  ): Promise<AttendanceSafetyNotice> {
    const rows =
      context.teamId === null
        ? []
        : await database.teamSafetyBriefing.findMany({
            where: {
              teamId: context.teamId,
              workDate: new Date(context.attendanceDate),
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          });
    return {
      projectId: context.projectId,
      teamId: context.teamId,
      attendanceDate: context.attendanceDate,
      pointCode: context.pointCode,
      baselineVersion: ATTENDANCE_SAFETY_VERSION,
      baselineText: ATTENDANCE_SAFETY_TEXT,
      briefings: rows.map((row) => ({
        id: row.id,
        title: row.title,
        content: row.content,
        publishedAt: row.createdAt.toISOString(),
      })),
    };
  }

  async confirm(
    context: AttendanceSafetyContext,
    input: ConfirmAttendanceSafety,
  ): Promise<AttendanceSafetyReceipt> {
    return this.db.$transaction(async (tx) => {
      await lockSafetyDay(tx, context.teamId, context.attendanceDate);
      const notice = await this.notice(tx, context);
      if (
        input.pointCode !== context.pointCode ||
        input.baselineVersion !== notice.baselineVersion ||
        !equalIds(
          input.briefingIds,
          notice.briefings.map((row) => row.id),
        )
      )
        throw new ConflictException({ message: "SAFETY_BRIEFING_CHANGED" });
      const count = await tx.attendanceSafetyConfirmation.count({
        where: {
          userId: context.userId,
          confirmedAt: { gte: new Date(Date.now() - 60000) },
        },
      });
      if (count >= 10)
        throw new BadRequestException({
          message: "SAFETY_CONFIRMATION_TOO_FREQUENT",
        });
      const snapshot: Prisma.InputJsonValue = JSON.parse(
        JSON.stringify(notice),
      ) as Prisma.InputJsonValue;
      const now: Date = new Date();
      const row = await tx.attendanceSafetyConfirmation.create({
        data: {
          ...context,
          confirmedAt: now,
          attendanceDate: new Date(context.attendanceDate),
          baselineVersion: notice.baselineVersion,
          briefingIds: notice.briefings.map((briefing) => briefing.id),
          snapshot,
          expiresAt: new Date(now.getTime() + 15 * 60000),
        },
      });
      if (context.participantType === "WORKER") {
        for (const briefing of notice.briefings)
          await tx.teamSafetyAcknowledgement.upsert({
            where: {
              briefingId_memberId: {
                briefingId: briefing.id,
                memberId: context.memberId,
              },
            },
            create: {
              briefingId: briefing.id,
              memberId: context.memberId,
              userId: context.userId,
            },
            update: {},
          });
      }
      return {
        id: row.id,
        confirmedAt: row.confirmedAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
      };
    });
  }

  async requireConfirmation(
    database: Prisma.TransactionClient,
    context: AttendanceSafetyContext,
    id: string | undefined,
  ): Promise<AttendanceSafetyConfirmation> {
    if (!id)
      throw new ForbiddenException({ message: "SAFETY_CONFIRMATION_REQUIRED" });
    await lockSafetyDay(database, context.teamId, context.attendanceDate);
    const row = await database.attendanceSafetyConfirmation.findFirst({
      where: {
        id,
        userId: context.userId,
        projectId: context.projectId,
        teamId: context.teamId,
        memberId: context.memberId,
        participantType: context.participantType,
        participantId: context.participantId,
        pointCode: context.pointCode,
        attendanceDate: new Date(context.attendanceDate),
        expiresAt: { gt: new Date() },
        attendanceRecord: null,
      },
    });
    if (row === null)
      throw new ForbiddenException({ message: "SAFETY_CONFIRMATION_EXPIRED" });
    const notice = await this.notice(database, context);
    if (
      row.baselineVersion !== notice.baselineVersion ||
      !equalIds(
        row.briefingIds,
        notice.briefings.map((briefing) => briefing.id),
      )
    )
      throw new ConflictException({ message: "SAFETY_BRIEFING_CHANGED" });
    return row;
  }
}
