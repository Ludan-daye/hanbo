import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  AttendanceRecord,
  AttendanceResult,
  MakeupRequest,
  ManagerProfile,
  Project,
  ProjectManagerMember,
  ProjectWorkerMember,
  Schedule,
  Shift,
  ShiftSegment,
  WorkerProfile,
} from "@prisma/client";
import type { Prisma } from "@prisma/client";
import {
  summarizeScheduledAttendance,
  type ScheduledAttendancePoint,
  type AttendancePointCode,
  type AttendanceRecordInput,
} from "@construction/domain/attendance.js";

import {
  loadPlanningData,
  resolveAttendancePlan,
  roleLevelForMember,
  type PlanPerson,
  type EffectivePlan,
} from "./attendance-plans.js";
import {
  attendanceLockKey,
  memberStateOn,
  isAttendanceMemberOn,
  workerRole,
  type MemberState,
} from "./member-history.js";
import { UploadsService } from "../uploads/uploads.service.js";
import { API_ENV } from "../config/env.module.js";
import type { ApiEnv } from "../config/env.js";
import { FaceService } from "../face/face.service.js";
import type { UploadedMultipartFile } from "../uploads/uploads.types.js";
import type {
  FaceSessionContext,
  IssuedFaceSession,
  IssuedVideoFaceSession,
  CompletedFaceSession,
} from "../face/face.types.js";
import {
  deriveFacePassed,
  FACE_VERIFICATION_CONNECTOR,
  type FaceVerificationConnector,
} from "../infrastructure/face/face-verification.types.js";
import { PrismaService } from "../infrastructure/database/prisma.service.js";

import type {
  AttendanceRecordResponse,
  AttendanceRecordStatusValue,
  AttendanceResultResponse,
  AttendanceTodayGeofence,
  AttendanceTodayResponse,
  ConfigureDefaultScheduleRequest,
  ConfigureDefaultShiftRequest,
  DefaultShiftResponse,
  DefaultScheduleResponse,
  DefaultAttendanceConfiguration,
  IsoWeekdayValue,
  ProfileOwnerTypeValue,
  ScheduleOwnerTypeValue,
  ShiftSegmentResponse,
  SubmitAttendanceRecordRequest,
  SubmitAttendanceRecordResponse,
} from "./attendance.types.js";

type ShiftWithSegments = Shift & {
  readonly segments: readonly ShiftSegment[];
};

type ProjectScheduleWithShift = Schedule & {
  readonly shift: ShiftWithSegments;
};

type WorkerProfileWithMemberships = WorkerProfile & {
  readonly projectMemberships: readonly ProjectWorkerMember[];
};

type ManagerProfileWithMemberships = ManagerProfile & {
  readonly projectMemberships: readonly ProjectManagerMember[];
};

type AttendanceParticipant = PlanPerson &
  MemberState & {
    readonly memberId: string;
    readonly participantId: string;
    readonly participantType: ProfileOwnerTypeValue;
  };

type GeofenceDecision = {
  readonly distanceM: number;
  readonly isInside: boolean;
};

const earthRadiusM = 6_371_000;
const maxStoredGeofenceDistanceM = 999_999.99;
const projectScheduleOwnerType: ScheduleOwnerTypeValue = "PROJECT";
const isoWeekdays: readonly IsoWeekdayValue[] = [1, 2, 3, 4, 5, 6, 7];
const chinaDateFormatter = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Shanghai",
  year: "numeric",
});

const dateOnlyToDate = (value: string): Date =>
  new Date(`${value}T00:00:00.000Z`);

const toDateOnly = (value: Date): string => value.toISOString().slice(0, 10);

const createWorkdayMask = (workdays: readonly IsoWeekdayValue[]): number =>
  workdays.reduce(
    (mask: number, weekday: IsoWeekdayValue): number =>
      mask | (1 << (weekday - 1)),
    0,
  );

const expandWorkdayMask = (workdayMask: number): readonly IsoWeekdayValue[] =>
  isoWeekdays.filter(
    (weekday: IsoWeekdayValue): boolean =>
      (workdayMask & (1 << (weekday - 1))) !== 0,
  );

const getChinaDateOnly = (value: Date): string => {
  const parts = chinaDateFormatter.formatToParts(value);
  const partValues = new Map<string, string>(
    parts.map((part: Intl.DateTimeFormatPart): readonly [string, string] => [
      part.type,
      part.value,
    ]),
  );
  const year = partValues.get("year");
  const month = partValues.get("month");
  const day = partValues.get("day");

  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(
      JSON.stringify({
        message: "Failed to format China date from occurredAt",
        occurredAt: value.toISOString(),
      }),
    );
  }

  return `${year}-${month}-${day}`;
};

const toRadians = (value: number): number => (value * Math.PI) / 180;

const calculateDistanceMeters = (
  fromLatitude: number,
  fromLongitude: number,
  toLatitude: number,
  toLongitude: number,
): number => {
  const latitudeDelta = toRadians(toLatitude - fromLatitude);
  const longitudeDelta = toRadians(toLongitude - fromLongitude);
  const fromLatitudeRadians = toRadians(fromLatitude);
  const toLatitudeRadians = toRadians(toLatitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitudeRadians) *
      Math.cos(toLatitudeRadians) *
      Math.sin(longitudeDelta / 2) ** 2;

  return (
    2 *
    earthRadiusM *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
};

const formatMeters = (value: number): string => value.toFixed(2);

const toSortedSegments = (
  segments: readonly ShiftSegment[],
): readonly ShiftSegment[] =>
  [...segments].sort(
    (left: ShiftSegment, right: ShiftSegment): number =>
      left.sequence - right.sequence,
  );

const createShiftSegmentResponse = (
  segment: ShiftSegment,
): ShiftSegmentResponse => ({
  earlyGraceMins: segment.earlyGraceMins,
  endTime: segment.endTime,
  id: segment.id,
  lateGraceMins: segment.lateGraceMins,
  sequence: segment.sequence as 1 | 2,
  shiftId: segment.shiftId,
  startTime: segment.startTime,
});

const createDefaultShiftResponse = (
  shift: Shift,
  segments: readonly ShiftSegment[],
): DefaultShiftResponse => {
  const sortedSegments = toSortedSegments(segments);

  if (
    sortedSegments.length !== 2 ||
    sortedSegments[0]?.sequence !== 1 ||
    sortedSegments[1]?.sequence !== 2
  ) {
    throw new BadRequestException({
      message: "DEFAULT_SHIFT_REQUIRES_TWO_ORDERED_SEGMENTS",
      shiftId: shift.id,
    });
  }

  return {
    id: shift.id,
    isDefault: shift.isDefault,
    name: shift.name,
    projectId: shift.projectId,
    segments: [
      createShiftSegmentResponse(sortedSegments[0]),
      createShiftSegmentResponse(sortedSegments[1]),
    ],
  };
};

const createDefaultScheduleResponse = (
  schedule: Schedule,
): DefaultScheduleResponse => ({
  endsOn: schedule.endsOn === null ? null : toDateOnly(schedule.endsOn),
  id: schedule.id,
  ownerId: schedule.ownerId,
  ownerType: schedule.ownerType as ScheduleOwnerTypeValue,
  shiftId: schedule.shiftId,
  startsOn: toDateOnly(schedule.startsOn),
  workdays: expandWorkdayMask(schedule.workdayMask),
});

export const createAttendanceRecordResponse = (
  record: AttendanceRecord,
): AttendanceRecordResponse => ({
  abnormalReason: record.abnormalReason,
  attendanceDate: toDateOnly(record.attendanceDate),
  facePassed: record.facePassed,
  faceScore: record.faceScore === null ? null : String(record.faceScore),
  geofenceDistanceM:
    record.geofenceDistanceM === null ? null : String(record.geofenceDistanceM),
  id: record.id,
  latitude: String(record.latitude),
  locationAccuracyM:
    record.locationAccuracyM === null ? null : String(record.locationAccuracyM),
  longitude: String(record.longitude),
  occurredAt: record.occurredAt.toISOString(),
  participantId: record.participantId,
  participantType: record.participantType,
  pointCode: record.pointCode,
  pointLabel: record.pointLabel,
  projectId: record.projectId,
  selfieHash: record.selfieHash,
  selfieObjectKey: record.selfieObjectKey,
  sitePhotoHash: record.sitePhotoHash,
  sitePhotoObjectKey: record.sitePhotoObjectKey,
  status: record.status as AttendanceRecordStatusValue,
});

const createAttendanceResultResponse = (
  result: AttendanceResult,
): AttendanceResultResponse => ({
  attendanceDate: toDateOnly(result.attendanceDate),
  isAbsent: result.isAbsent,
  isEarlyLeave: result.isEarlyLeave,
  isLate: result.isLate,
  isMissingPunch: result.isMissingPunch,
  participantId: result.participantId,
  participantType: result.participantType,
  projectId: result.projectId,
  workedMinutes: result.workedMinutes,
});

const toAttendanceRecordInput = (
  record: AttendanceRecord,
): AttendanceRecordInput => ({
  id: record.id,
  isValid: record.status === "VALID",
  occurredAt: new Date(record.occurredAt.getTime()),
  pointCode: record.pointCode,
  source: record.source,
});

const toMakeupRecordInput = (
  request: MakeupRequest,
): AttendanceRecordInput => ({
  id: request.id,
  isValid: true,
  occurredAt: new Date(request.requestedOccurredAt.getTime()),
  pointCode: request.pointCode,
  source: "MAKEUP",
});

const getValidWorkerMember = (
  profile: WorkerProfileWithMemberships,
  projectId: string,
): AttendanceParticipant | null => {
  const member = profile.projectMemberships[0];

  if (member === undefined) {
    return null;
  }

  return {
    memberId: member.id,
    participantId: profile.id,
    participantType: "WORKER",
    teamId: member.teamId,
    roleLevel: roleLevelForMember(workerRole(member.projectRoleLabel)),
    userId: profile.userId,
    status: member.status,
    requiresAttendance: member.requiresAttendance,
    enteredAt: member.enteredAt,
    exitedAt: member.exitedAt,
    roleCode: workerRole(member.projectRoleLabel),
    projectRoleLabel: member.projectRoleLabel,
  };
};

const getValidManagerMember = (
  profile: ManagerProfileWithMemberships,
  projectId: string,
): AttendanceParticipant | null => {
  const member = profile.projectMemberships[0];

  if (member === undefined) {
    return null;
  }

  return {
    memberId: member.id,
    participantId: profile.id,
    participantType: "MANAGER",
    teamId: member.teamScopeId,
    roleLevel: roleLevelForMember(member.roleCode),
    userId: profile.userId,
    status: member.status,
    requiresAttendance: member.requiresAttendance,
    enteredAt: member.enteredAt,
    exitedAt: member.exitedAt,
    roleCode: member.roleCode,
    projectRoleLabel: member.roleCode,
  };
};

@Injectable()
export class AttendanceService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FACE_VERIFICATION_CONNECTOR)
    private readonly faceConnector: FaceVerificationConnector,
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(FaceService) private readonly faces: FaceService,
    @Inject(UploadsService) private readonly uploads: UploadsService,
  ) {}

  async createNativeFaceSession(
    projectId: string,
    userId: string,
    pointCode: AttendancePointCode,
  ): Promise<IssuedFaceSession> {
    return this.faces.startSession(
      await this.nativeFaceContext(projectId, userId, pointCode),
    );
  }

  async completeNativeFaceSession(
    projectId: string,
    userId: string,
    pointCode: AttendancePointCode,
    sessionId: string,
  ): Promise<CompletedFaceSession> {
    return this.faces.completeSession(
      await this.nativeFaceContext(projectId, userId, pointCode),
      sessionId,
    );
  }

  async createVideoFaceSession(
    projectId: string,
    userId: string,
    pointCode: AttendancePointCode,
  ): Promise<IssuedVideoFaceSession> {
    return this.faces.startVideoSession(
      await this.nativeFaceContext(projectId, userId, pointCode),
    );
  }

  async verifyVideoFaceSession(
    projectId: string,
    userId: string,
    pointCode: AttendancePointCode,
    sessionId: string,
    file: UploadedMultipartFile | undefined,
  ): Promise<CompletedFaceSession> {
    return this.faces.verifyVideoSession(
      await this.nativeFaceContext(projectId, userId, pointCode),
      sessionId,
      file,
    );
  }

  async videoFaceResult(
    projectId: string,
    userId: string,
    pointCode: AttendancePointCode,
    sessionId: string,
  ): Promise<CompletedFaceSession> {
    return this.faces.videoResult(
      await this.nativeFaceContext(projectId, userId, pointCode),
      sessionId,
    );
  }

  private async nativeFaceContext(
    projectId: string,
    userId: string,
    pointCode: AttendancePointCode,
  ): Promise<FaceSessionContext> {
    const project = await this.getProjectOrThrow(projectId);
    this.assertProjectAcceptsPunch(project);
    const today = await this.getAttendanceToday(projectId, userId);
    if (
      !today.configured ||
      !today.isWorkday ||
      !today.points.some(
        (point) => point.pointCode === pointCode && point.record === null,
      )
    ) {
      throw new BadRequestException({
        message: "ATTENDANCE_DATE_NOT_SCHEDULED",
      });
    }
    const participant = await this.resolveAttendanceParticipant(
      userId,
      projectId,
    );
    return {
      projectId,
      userId,
      attendanceDate: today.attendanceDate,
      pointCode,
      owner: {
        ownerType: participant.participantType,
        ownerId: participant.participantId,
      },
    };
  }

  async getDefaultConfiguration(
    projectId: string,
  ): Promise<DefaultAttendanceConfiguration> {
    await this.getProjectOrThrow(projectId);
    const [shift, schedules] = await Promise.all([
      this.prisma.shift.findFirst({
        include: { segments: true },
        where: { isDefault: true, projectId },
      }),
      this.loadProjectSchedulesWithShift(projectId),
    ]);
    return {
      shift:
        shift === null
          ? null
          : createDefaultShiftResponse(shift, shift.segments),
      schedule:
        schedules[0] === undefined
          ? null
          : createDefaultScheduleResponse(schedules[0]),
    };
  }

  async configureDefaultShift(
    projectId: string,
    request: ConfigureDefaultShiftRequest,
  ): Promise<DefaultShiftResponse> {
    await this.getProjectOrThrow(projectId);

    return this.prisma.$transaction(
      async (transaction): Promise<DefaultShiftResponse> => {
        await transaction.shift.updateMany({
          data: {
            isDefault: false,
          },
          where: {
            projectId,
          },
        });
        const shift = await transaction.shift.create({
          data: {
            isDefault: true,
            name: request.name,
            projectId,
          },
        });
        const segments: ShiftSegment[] = [];

        for (const segmentRequest of request.segments) {
          const segment = await transaction.shiftSegment.create({
            data: {
              earlyGraceMins: segmentRequest.earlyGraceMins,
              endTime: segmentRequest.endTime,
              lateGraceMins: segmentRequest.lateGraceMins,
              sequence: segmentRequest.sequence,
              shiftId: shift.id,
              startTime: segmentRequest.startTime,
            },
          });
          segments.push(segment);
        }

        return createDefaultShiftResponse(shift, segments);
      },
    );
  }

  async configureDefaultSchedule(
    projectId: string,
    request: ConfigureDefaultScheduleRequest,
  ): Promise<DefaultScheduleResponse> {
    await this.getProjectOrThrow(projectId);
    const defaultShift = await this.getDefaultShiftOrThrow(projectId);

    return this.prisma.$transaction(
      async (transaction): Promise<DefaultScheduleResponse> => {
        const schedules = await transaction.schedule.findMany({
          orderBy: { startsOn: "desc" },
          where: {
            ownerId: projectId,
            ownerType: projectScheduleOwnerType,
          },
        });
        const startsOn = dateOnlyToDate(request.startsOn);
        const endsOn =
          request.endsOn === null ? null : dateOnlyToDate(request.endsOn);
        const workdayMask = createWorkdayMask(request.workdays);
        const matchingSchedule = schedules.find(
          (schedule: Schedule): boolean =>
            schedule.startsOn.getTime() === startsOn.getTime() &&
            schedule.endsOn?.getTime() === endsOn?.getTime() &&
            schedule.workdayMask === workdayMask &&
            schedule.shiftId === defaultShift.id,
        );
        if (matchingSchedule !== undefined) {
          return createDefaultScheduleResponse(matchingSchedule);
        }
        if (
          schedules.length > 0 &&
          request.startsOn <= getChinaDateOnly(new Date())
        ) {
          throw new ConflictException({
            message: "SCHEDULE_HISTORY_IS_IMMUTABLE_USE_A_FUTURE_START_DATE",
            projectId,
            startsOn: request.startsOn,
          });
        }
        const latestSchedule = schedules[0];
        if (
          latestSchedule !== undefined &&
          startsOn.getTime() <= latestSchedule.startsOn.getTime()
        ) {
          throw new ConflictException({
            message: "SCHEDULE_START_MUST_FOLLOW_THE_LATEST_VERSION",
            latestStartsOn: toDateOnly(latestSchedule.startsOn),
            projectId,
            startsOn: request.startsOn,
          });
        }
        if (
          latestSchedule !== undefined &&
          (latestSchedule.endsOn === null ||
            latestSchedule.endsOn.getTime() >= startsOn.getTime())
        ) {
          await transaction.schedule.update({
            data: {
              endsOn: new Date(startsOn.getTime() - 24 * 60 * 60 * 1000),
            },
            where: { id: latestSchedule.id },
          });
        }
        const schedule = await transaction.schedule.create({
          data: {
            endsOn,
            ownerId: projectId,
            ownerType: projectScheduleOwnerType,
            shiftId: defaultShift.id,
            startsOn,
            workdayMask,
          },
        });

        return createDefaultScheduleResponse(schedule);
      },
    );
  }

  async submitAttendanceRecord(
    projectId: string,
    userId: string,
    request: SubmitAttendanceRecordRequest,
  ): Promise<SubmitAttendanceRecordResponse> {
    const project = await this.getProjectOrThrow(projectId);
    this.assertProjectAcceptsPunch(project);
    const participant = await this.resolveAttendanceParticipant(
      userId,
      projectId,
    );
    if (participant.status !== "ACTIVE" || !participant.requiresAttendance)
      throw new BadRequestException({
        message: "当前成员不在场或无需考勤，不能新增打卡。",
      });
    const attendanceDate = dateOnlyToDate(request.attendanceDate);
    const occurredAt = this.env.FACE_DEV_STUB
      ? new Date(request.occurredAt)
      : new Date();
    this.assertOccurredAtMatchesAttendanceDate(
      occurredAt,
      request.attendanceDate,
    );
    const plan = await this.getParticipantPlan(
      projectId,
      participant,
      request.attendanceDate,
    );
    if (
      !plan.isWorkday ||
      !plan.points.some((point) => point.code === request.pointCode)
    )
      throw new BadRequestException({
        message: "ATTENDANCE_POINT_NOT_SCHEDULED",
      });

    const geofenceDecision = this.createGeofenceDecision(
      project,
      request.latitude,
      request.longitude,
    );
    if (!geofenceDecision.isInside) {
      throw new BadRequestException({
        message: "OUTSIDE_GEOFENCE",
        projectId,
        distanceM: Math.round(geofenceDecision.distanceM),
        radiusM: project.geofenceRadiusM,
      });
    }
    if (
      project.locationAccuracyLimitM !== null &&
      (request.locationAccuracyM === null ||
        Number(request.locationAccuracyM) > project.locationAccuracyLimitM)
    )
      throw new BadRequestException({
        message: "定位精度不足，请到开阔位置重新定位。",
        limitM: project.locationAccuracyLimitM,
      });
    await this.uploads.requireOwnedImage(
      userId,
      request.sitePhotoObjectKey,
      request.sitePhotoHash,
    );
    const proof = this.env.FACE_DEV_STUB
      ? null
      : await this.faces.requireProof(
          {
            projectId,
            userId,
            attendanceDate: request.attendanceDate,
            pointCode: request.pointCode,
            owner: {
              ownerType: participant.participantType,
              ownerId: participant.participantId,
            },
          },
          request.faceVerificationSessionId,
        );
    const selfieObjectKey =
      proof === null ? request.selfieObjectKey : proof.selfieObjectKey;
    const selfieHash = proof === null ? request.selfieHash : proof.selfieHash;
    if (typeof selfieObjectKey !== "string" || typeof selfieHash !== "string")
      throw new BadRequestException({ message: "ATTENDANCE_SELFIE_REQUIRED" });
    const faceResult =
      proof === null
        ? await this.faceConnector.verifyFace({
            baselineRef: null,
            selfieObjectKey,
          })
        : { detected: true, score: Number(proof.score) };
    const facePassed = deriveFacePassed(
      faceResult,
      this.env.FACE_SCORE_THRESHOLD,
    );
    const abnormalReason: string | null = facePassed ? null : "FACE_NOT_PASSED";
    const status: AttendanceRecordStatusValue =
      abnormalReason === null ? "VALID" : "INVALID";
    const recordData: Prisma.AttendanceRecordUncheckedCreateInput = {
      abnormalReason,
      attendanceDate,
      faceVerificationSessionId: proof?.id ?? null,
      facePassed,
      faceScore: String(faceResult.score),
      geofenceDistanceM: formatMeters(
        Math.min(geofenceDecision.distanceM, maxStoredGeofenceDistanceM),
      ),
      latitude: request.latitude,
      locationAccuracyM:
        request.locationAccuracyM === null
          ? null
          : formatMeters(
              Math.min(
                Number(request.locationAccuracyM),
                maxStoredGeofenceDistanceM,
              ),
            ),
      longitude: request.longitude,
      occurredAt,
      participantId: participant.participantId,
      participantType: participant.participantType,
      pointCode: request.pointCode,
      pointLabel: plan.points.find((point) => point.code === request.pointCode)!
        .label,
      projectId,
      selfieHash,
      selfieObjectKey,
      sitePhotoHash: request.sitePhotoHash,
      sitePhotoObjectKey: request.sitePhotoObjectKey,
      source: "DEVICE",
      status,
    };
    const { record, result } = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${attendanceLockKey(projectId, participant.participantType, participant.participantId, request.attendanceDate)}, 0))`;
      await this.assertPointAvailable(
        tx,
        projectId,
        participant.participantType,
        participant.participantId,
        request.attendanceDate,
        request.pointCode,
      );
      if (proof !== null) await this.faces.consumeProof(tx, proof);
      const record = await tx.attendanceRecord.create({ data: recordData });
      const result = await this.recalculateAttendanceResult(
        tx,
        projectId,
        request.attendanceDate,
        attendanceDate,
        participant,
        plan.points,
      );
      return { record, result };
    });

    return {
      record: createAttendanceRecordResponse(record),
      result: createAttendanceResultResponse(result),
    };
  }

  async getAttendanceToday(
    projectId: string,
    userId: string,
  ): Promise<AttendanceTodayResponse> {
    const project = await this.getProjectOrThrow(projectId);
    const participant = await this.resolveAttendanceParticipant(
      userId,
      projectId,
    );
    const attendanceDateText = getChinaDateOnly(new Date());
    const attendanceDate = dateOnlyToDate(attendanceDateText);
    const geofence: AttendanceTodayGeofence = {
      centerLatitude: String(project.centerLatitude),
      centerLongitude: String(project.centerLongitude),
      radiusM: project.geofenceRadiusM,
    };

    if (
      project.status !== "ACTIVE" ||
      participant.status !== "ACTIVE" ||
      !participant.requiresAttendance
    )
      return {
        attendanceDate: attendanceDateText,
        configured: true,
        geofence,
        isWorkday: false,
        points: [],
        result: null,
        shiftName: "项目或成员已停用考勤",
      };
    const plan = await this.getParticipantPlan(
      projectId,
      participant,
      attendanceDateText,
    );
    if (!plan.isWorkday)
      return {
        attendanceDate: attendanceDateText,
        configured: true,
        geofence,
        isWorkday: false,
        points: [],
        result: null,
        shiftName: plan.name,
      };

    const [records, result] = await Promise.all([
      this.prisma.attendanceRecord.findMany({
        orderBy: {
          occurredAt: "asc",
        },
        where: {
          attendanceDate,
          participantId: participant.participantId,
          participantType: participant.participantType,
          projectId,
        },
      }),
      this.prisma.attendanceResult.findUnique({
        where: {
          projectId_attendanceDate_participantType_participantId: {
            attendanceDate,
            participantId: participant.participantId,
            participantType: participant.participantType,
            projectId,
          },
        },
      }),
    ]);

    const makeups = await this.prisma.makeupRequest.findMany({
      where: {
        projectId,
        participantId: participant.participantId,
        participantType: participant.participantType,
        attendanceDate,
        status: "APPROVED",
      },
    });
    const summary = summarizeScheduledAttendance(
      plan.points,
      attendanceDateText,
      [
        ...records.map(toAttendanceRecordInput),
        ...makeups.map(toMakeupRecordInput),
      ],
      new Date(),
    );
    return {
      attendanceDate: attendanceDateText,
      configured: true,
      geofence,
      isWorkday: true,
      points: plan.points.map((point) => ({
        pointCode: point.code,
        label: point.label,
        kind: point.kind,
        scheduledTime: point.time,
        graceMins: point.graceMins,
        record:
          summary.selectedRecords[point.code] === undefined
            ? null
            : {
                occurredAt:
                  summary.selectedRecords[point.code]!.occurredAt.toISOString(),
                status: "VALID" as const,
                abnormalReason: null,
              },
      })),
      result:
        result === null
          ? null
          : createAttendanceResultResponse({ ...result, ...summary }),
      shiftName: plan.name,
    };
  }

  async recalculateDailyResult(
    database: Prisma.TransactionClient,
    projectId: string,
    attendanceDateText: string,
    participantType: ProfileOwnerTypeValue,
    participantId: string,
  ): Promise<AttendanceResult> {
    const attendanceDate = dateOnlyToDate(attendanceDateText);
    const member =
      participantType === "WORKER"
        ? await database.projectWorkerMember.findUnique({
            where: {
              projectId_workerId: { projectId, workerId: participantId },
            },
            include: { worker: true },
          })
        : await database.projectManagerMember.findUnique({
            where: {
              projectId_managerId: { projectId, managerId: participantId },
            },
            include: { manager: true },
          });
    if (member === null)
      throw new BadRequestException({
        message: "ATTENDANCE_PARTICIPANT_MEMBERSHIP_NOT_FOUND",
      });
    const participant: AttendanceParticipant = {
      memberId: member.id,
      participantId,
      participantType,
      teamId: "teamId" in member ? member.teamId : member.teamScopeId,
      roleLevel:
        "roleCode" in member
          ? roleLevelForMember(member.roleCode)
          : roleLevelForMember(workerRole(member.projectRoleLabel)),
      userId: "worker" in member ? member.worker.userId : member.manager.userId,
      status: member.status,
      requiresAttendance: member.requiresAttendance,
      enteredAt: member.enteredAt,
      exitedAt: member.exitedAt,
      roleCode:
        "roleCode" in member
          ? member.roleCode
          : workerRole(member.projectRoleLabel),
      projectRoleLabel:
        "roleCode" in member ? member.roleCode : member.projectRoleLabel,
    };
    const plan = await this.participantPlan(
      database,
      projectId,
      participant,
      attendanceDateText,
    );
    return this.recalculateAttendanceResult(
      database,
      projectId,
      attendanceDateText,
      attendanceDate,
      participant,
      plan.points,
    );
  }

  async getParticipantPlan(
    projectId: string,
    participant: AttendanceParticipant,
    date: string,
  ): Promise<EffectivePlan> {
    return this.participantPlan(this.prisma, projectId, participant, date);
  }
  private async participantPlan(
    database: Prisma.TransactionClient,
    projectId: string,
    participant: AttendanceParticipant,
    date: string,
  ): Promise<EffectivePlan> {
    const data = await loadPlanningData(database, [projectId]);
    const state = memberStateOn(participant, data.histories, date);
    if (!isAttendanceMemberOn(state, date))
      throw new BadRequestException({
        message: "该日期不在有效考勤成员期间内。",
        projectId,
        date,
      });
    return resolveAttendancePlan(data, projectId, participant, date);
  }
  async getMyPlan(
    projectId: string,
    userId: string,
    date: string,
  ): Promise<EffectivePlan> {
    return this.getParticipantPlan(
      projectId,
      await this.resolveAttendanceParticipant(userId, projectId),
      date,
    );
  }
  private assertProjectAcceptsPunch(project: Project): void {
    if (project.status !== "ACTIVE")
      throw new BadRequestException({
        message: "项目未开工、已暂停或已结束，不能新增打卡。",
        projectId: project.id,
        status: project.status,
      });
  }
  async assertPointAvailable(
    database: Prisma.TransactionClient,
    projectId: string,
    participantType: ProfileOwnerTypeValue,
    participantId: string,
    date: string,
    pointCode: string,
  ): Promise<void> {
    const where = {
      projectId,
      participantType,
      participantId,
      attendanceDate: dateOnlyToDate(date),
      pointCode,
    };
    const [record, makeup] = await Promise.all([
      database.attendanceRecord.findFirst({
        where: { ...where, status: "VALID" },
      }),
      database.makeupRequest.findFirst({
        where: { ...where, status: "APPROVED" },
      }),
    ]);
    if (record !== null || makeup !== null)
      throw new ConflictException({
        message: "该时点已有有效打卡或已批准补卡，请刷新记录。",
      });
  }

  private async getProjectOrThrow(projectId: string): Promise<Project> {
    const project = await this.prisma.project.findUnique({
      where: {
        id: projectId,
      },
    });

    if (project === null) {
      throw new NotFoundException({
        message: "PROJECT_NOT_FOUND",
        projectId,
      });
    }

    return project;
  }

  private async getDefaultShiftOrThrow(
    projectId: string,
  ): Promise<ShiftWithSegments> {
    const shift = await this.prisma.shift.findFirst({
      include: { segments: true },
      where: { isDefault: true, projectId },
    });
    if (shift === null)
      throw new BadRequestException({
        message: "DEFAULT_SHIFT_NOT_CONFIGURED",
        projectId,
      });
    return shift;
  }

  private async loadProjectSchedulesWithShift(
    projectId: string,
  ): Promise<readonly ProjectScheduleWithShift[]> {
    return this.prisma.schedule.findMany({
      include: {
        shift: {
          include: {
            segments: true,
          },
        },
      },
      orderBy: {
        startsOn: "desc",
      },
      where: {
        ownerId: projectId,
        ownerType: projectScheduleOwnerType,
      },
    });
  }

  private async resolveAttendanceParticipant(
    userId: string,
    projectId: string,
  ): Promise<AttendanceParticipant> {
    const [workerProfile, managerProfile] = await Promise.all([
      this.prisma.workerProfile.findUnique({
        include: {
          projectMemberships: {
            where: {
              projectId,
            },
          },
        },
        where: {
          userId,
        },
      }),
      this.prisma.managerProfile.findUnique({
        include: {
          projectMemberships: {
            where: {
              projectId,
            },
          },
        },
        where: {
          userId,
        },
      }),
    ]);

    if (workerProfile !== null && managerProfile !== null) {
      throw new ConflictException({
        message: "USER_BOUND_TO_MULTIPLE_ATTENDANCE_PROFILE_TYPES",
        projectId,
        userId,
      });
    }

    if (workerProfile !== null) {
      const workerParticipant = getValidWorkerMember(workerProfile, projectId);

      if (workerParticipant !== null) {
        return workerParticipant;
      }
    }

    if (managerProfile !== null) {
      const managerParticipant = getValidManagerMember(
        managerProfile,
        projectId,
      );

      if (managerParticipant !== null) {
        return managerParticipant;
      }
    }

    throw new BadRequestException({
      message: "ATTENDANCE_PARTICIPANT_MEMBERSHIP_NOT_FOUND",
      projectId,
      userId,
    });
  }

  private createGeofenceDecision(
    project: Project,
    latitude: string,
    longitude: string,
  ): GeofenceDecision {
    const distanceM = calculateDistanceMeters(
      Number(String(project.centerLatitude)),
      Number(String(project.centerLongitude)),
      Number(latitude),
      Number(longitude),
    );

    return {
      distanceM,
      isInside: distanceM <= project.geofenceRadiusM,
    };
  }

  private assertOccurredAtMatchesAttendanceDate(
    occurredAt: Date,
    attendanceDate: string,
  ): void {
    const occurredDate = getChinaDateOnly(occurredAt);

    if (occurredDate !== attendanceDate) {
      throw new BadRequestException({
        attendanceDate,
        message: "ATTENDANCE_OCCURRED_AT_DATE_MISMATCH",
        occurredAt: occurredAt.toISOString(),
        occurredDate,
      });
    }
  }

  private async recalculateAttendanceResult(
    database: Prisma.TransactionClient,
    projectId: string,
    attendanceDateText: string,
    attendanceDate: Date,
    participant: AttendanceParticipant,
    points: readonly ScheduledAttendancePoint[],
  ): Promise<AttendanceResult> {
    const [records, approvedMakeupRequests] = await Promise.all([
      database.attendanceRecord.findMany({
        orderBy: {
          occurredAt: "asc",
        },
        where: {
          attendanceDate,
          participantId: participant.participantId,
          participantType: participant.participantType,
          projectId,
        },
      }),
      database.makeupRequest.findMany({
        where: {
          attendanceDate,
          participantId: participant.participantId,
          participantType: participant.participantType,
          projectId,
          status: "APPROVED",
        },
      }),
    ]);
    let summary: ReturnType<typeof summarizeScheduledAttendance>;
    try {
      summary = summarizeScheduledAttendance(
        points,
        attendanceDateText,
        [
          ...records.map(toAttendanceRecordInput),
          ...approvedMakeupRequests.map(toMakeupRecordInput),
        ],
        new Date(),
      );
    } catch (error: unknown) {
      throw new BadRequestException({
        message: "ATTENDANCE_SUMMARY_RECALCULATION_FAILED",
        projectId,
        attendanceDate: attendanceDateText,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
    const abnormalRecordCount = records.filter(
      (record: AttendanceRecord): boolean => record.status === "INVALID",
    ).length;
    const calculatedAt = new Date();

    return database.attendanceResult.upsert({
      create: {
        abnormalRecordCount,
        approvedMakeupCount: approvedMakeupRequests.length,
        attendanceDate,
        calculatedAt,
        isAbsent: summary.isAbsent,
        isEarlyLeave: summary.isEarlyLeave,
        isLate: summary.isLate,
        isMissingPunch: summary.isMissingPunch,
        participantId: participant.participantId,
        participantType: participant.participantType,
        projectId,
        workedMinutes: summary.workedMinutes,
      },
      update: {
        abnormalRecordCount,
        approvedMakeupCount: approvedMakeupRequests.length,
        calculatedAt,
        isAbsent: summary.isAbsent,
        isEarlyLeave: summary.isEarlyLeave,
        isLate: summary.isLate,
        isMissingPunch: summary.isMissingPunch,
        workedMinutes: summary.workedMinutes,
      },
      where: {
        projectId_attendanceDate_participantType_participantId: {
          attendanceDate,
          participantId: participant.participantId,
          participantType: participant.participantType,
          projectId,
        },
      },
    });
  }
}
