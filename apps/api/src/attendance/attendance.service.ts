import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
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
  WorkerProfile
} from "@prisma/client";
import { summarizeDailyAttendance, type AttendanceRecordInput, type ShiftRule } from "@construction/domain/attendance.js";

import { API_ENV } from "../config/env.module.js";
import type { ApiEnv } from "../config/env.js";
import {
  deriveFacePassed,
  FACE_VERIFICATION_CONNECTOR,
  type FaceVerificationConnector
} from "../infrastructure/face/face-verification.types.js";
import { PrismaService } from "../infrastructure/database/prisma.service.js";

import type {
  AttendanceRecordResponse,
  AttendanceRecordStatusValue,
  AttendanceResultResponse,
  ConfigureDefaultScheduleRequest,
  ConfigureDefaultShiftRequest,
  DefaultShiftResponse,
  DefaultScheduleResponse,
  IsoWeekdayValue,
  ProfileOwnerTypeValue,
  ScheduleOwnerTypeValue,
  ShiftSegmentResponse,
  SubmitAttendanceRecordRequest,
  SubmitAttendanceRecordResponse
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

type AttendanceParticipant = {
  readonly memberId: string;
  readonly participantId: string;
  readonly participantType: ProfileOwnerTypeValue;
};

type GeofenceDecision = {
  readonly distanceM: number;
  readonly isInside: boolean;
};

const earthRadiusM = 6_371_000;
const projectScheduleOwnerType: ScheduleOwnerTypeValue = "PROJECT";
const isoWeekdays: readonly IsoWeekdayValue[] = [1, 2, 3, 4, 5, 6, 7];
const chinaDateFormatter = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Shanghai",
  year: "numeric"
});

const dateOnlyToDate = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

const dateOnlyAndTimeToChinaDate = (dateOnly: string, time: string): Date => new Date(`${dateOnly}T${time}:00.000+08:00`);

const toDateOnly = (value: Date): string => value.toISOString().slice(0, 10);

const getIsoWeekday = (value: Date): IsoWeekdayValue => {
  const utcDay = value.getUTCDay();

  if (utcDay === 0) {
    return 7;
  }

  return utcDay as IsoWeekdayValue;
};

const createWorkdayMask = (workdays: readonly IsoWeekdayValue[]): number =>
  workdays.reduce((mask: number, weekday: IsoWeekdayValue): number => mask | (1 << (weekday - 1)), 0);

const expandWorkdayMask = (workdayMask: number): readonly IsoWeekdayValue[] =>
  isoWeekdays.filter((weekday: IsoWeekdayValue): boolean => (workdayMask & (1 << (weekday - 1))) !== 0);

const isDateInScheduleRange = (schedule: Schedule, attendanceDate: Date): boolean =>
  schedule.startsOn.getTime() <= attendanceDate.getTime() &&
  (schedule.endsOn === null || schedule.endsOn.getTime() >= attendanceDate.getTime());

const isDateEnabledBySchedule = (schedule: Schedule, attendanceDate: Date): boolean => {
  const weekday = getIsoWeekday(attendanceDate);

  return (schedule.workdayMask & (1 << (weekday - 1))) !== 0;
};

const getChinaDateOnly = (value: Date): string => {
  const parts = chinaDateFormatter.formatToParts(value);
  const partValues = new Map<string, string>(
    parts.map((part: Intl.DateTimeFormatPart): readonly [string, string] => [part.type, part.value])
  );
  const year = partValues.get("year");
  const month = partValues.get("month");
  const day = partValues.get("day");

  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(
      JSON.stringify({
        message: "Failed to format China date from occurredAt",
        occurredAt: value.toISOString()
      })
    );
  }

  return `${year}-${month}-${day}`;
};

const toRadians = (value: number): number => (value * Math.PI) / 180;

const calculateDistanceMeters = (
  fromLatitude: number,
  fromLongitude: number,
  toLatitude: number,
  toLongitude: number
): number => {
  const latitudeDelta = toRadians(toLatitude - fromLatitude);
  const longitudeDelta = toRadians(toLongitude - fromLongitude);
  const fromLatitudeRadians = toRadians(fromLatitude);
  const toLatitudeRadians = toRadians(toLatitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitudeRadians) * Math.cos(toLatitudeRadians) * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * earthRadiusM * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

const formatMeters = (value: number): string => value.toFixed(2);

const toSortedSegments = (segments: readonly ShiftSegment[]): readonly ShiftSegment[] =>
  [...segments].sort((left: ShiftSegment, right: ShiftSegment): number => left.sequence - right.sequence);

const createShiftSegmentResponse = (segment: ShiftSegment): ShiftSegmentResponse => ({
  earlyGraceMins: segment.earlyGraceMins,
  endTime: segment.endTime,
  id: segment.id,
  lateGraceMins: segment.lateGraceMins,
  sequence: segment.sequence as 1 | 2,
  shiftId: segment.shiftId,
  startTime: segment.startTime
});

const createDefaultShiftResponse = (shift: Shift, segments: readonly ShiftSegment[]): DefaultShiftResponse => {
  const sortedSegments = toSortedSegments(segments);

  if (sortedSegments.length !== 2 || sortedSegments[0]?.sequence !== 1 || sortedSegments[1]?.sequence !== 2) {
    throw new BadRequestException({
      message: "DEFAULT_SHIFT_REQUIRES_TWO_ORDERED_SEGMENTS",
      shiftId: shift.id
    });
  }

  return {
    id: shift.id,
    isDefault: shift.isDefault,
    name: shift.name,
    projectId: shift.projectId,
    segments: [createShiftSegmentResponse(sortedSegments[0]), createShiftSegmentResponse(sortedSegments[1])]
  };
};

const createDefaultScheduleResponse = (schedule: Schedule): DefaultScheduleResponse => ({
  endsOn: schedule.endsOn === null ? null : toDateOnly(schedule.endsOn),
  id: schedule.id,
  ownerId: schedule.ownerId,
  ownerType: schedule.ownerType as ScheduleOwnerTypeValue,
  shiftId: schedule.shiftId,
  startsOn: toDateOnly(schedule.startsOn),
  workdays: expandWorkdayMask(schedule.workdayMask)
});

export const createAttendanceRecordResponse = (record: AttendanceRecord): AttendanceRecordResponse => ({
  abnormalReason: record.abnormalReason,
  attendanceDate: toDateOnly(record.attendanceDate),
  facePassed: record.facePassed,
  faceScore: record.faceScore === null ? null : String(record.faceScore),
  geofenceDistanceM: record.geofenceDistanceM === null ? null : String(record.geofenceDistanceM),
  id: record.id,
  latitude: String(record.latitude),
  locationAccuracyM: record.locationAccuracyM === null ? null : String(record.locationAccuracyM),
  longitude: String(record.longitude),
  occurredAt: record.occurredAt.toISOString(),
  participantId: record.participantId,
  participantType: record.participantType,
  pointCode: record.pointCode,
  projectId: record.projectId,
  selfieHash: record.selfieHash,
  selfieObjectKey: record.selfieObjectKey,
  sitePhotoHash: record.sitePhotoHash,
  sitePhotoObjectKey: record.sitePhotoObjectKey,
  status: record.status as AttendanceRecordStatusValue
});

const createAttendanceResultResponse = (result: AttendanceResult): AttendanceResultResponse => ({
  attendanceDate: toDateOnly(result.attendanceDate),
  isAbsent: result.isAbsent,
  isEarlyLeave: result.isEarlyLeave,
  isLate: result.isLate,
  isMissingPunch: result.isMissingPunch,
  participantId: result.participantId,
  participantType: result.participantType,
  projectId: result.projectId,
  workedMinutes: result.workedMinutes
});

const createShiftRule = (attendanceDate: string, segments: readonly ShiftSegment[]): ShiftRule => {
  const sortedSegments = toSortedSegments(segments);
  const segment1 = sortedSegments[0];
  const segment2 = sortedSegments[1];

  if (segment1 === undefined || segment2 === undefined || segment1.sequence !== 1 || segment2.sequence !== 2) {
    throw new BadRequestException({
      message: "DEFAULT_SHIFT_REQUIRES_TWO_ORDERED_SEGMENTS"
    });
  }

  return {
    earlyLeaveGraceMinutes: segment2.earlyGraceMins,
    lateGraceMinutes: segment1.lateGraceMins,
    segment1EndAt: dateOnlyAndTimeToChinaDate(attendanceDate, segment1.endTime),
    segment1StartAt: dateOnlyAndTimeToChinaDate(attendanceDate, segment1.startTime),
    segment2EndAt: dateOnlyAndTimeToChinaDate(attendanceDate, segment2.endTime),
    segment2StartAt: dateOnlyAndTimeToChinaDate(attendanceDate, segment2.startTime)
  };
};

const toAttendanceRecordInput = (record: AttendanceRecord): AttendanceRecordInput => ({
  id: record.id,
  isValid: record.status === "VALID",
  occurredAt: new Date(record.occurredAt.getTime()),
  pointCode: record.pointCode,
  source: record.source
});

const toMakeupRecordInput = (request: MakeupRequest): AttendanceRecordInput => ({
  id: request.id,
  isValid: true,
  occurredAt: new Date(request.requestedOccurredAt.getTime()),
  pointCode: request.pointCode,
  source: "MAKEUP"
});

const summarizeAttendanceOrThrow = (
  shiftRule: ShiftRule,
  records: readonly AttendanceRecordInput[]
): ReturnType<typeof summarizeDailyAttendance> => {
  try {
    return summarizeDailyAttendance(shiftRule, records);
  } catch (error: unknown) {
    throw new BadRequestException({
      errorMessage: error instanceof Error ? error.message : "Unknown attendance calculation error",
      message: "ATTENDANCE_SUMMARY_RECALCULATION_FAILED"
    });
  }
};

const getValidWorkerMember = (
  profile: WorkerProfileWithMemberships,
  projectId: string
): AttendanceParticipant | null => {
  const member = profile.projectMemberships[0];

  if (member === undefined) {
    return null;
  }

  if (member.status !== "ACTIVE") {
    throw new BadRequestException({
      memberId: member.id,
      message: "WORKER_MEMBER_NOT_ACTIVE",
      projectId,
      status: member.status
    });
  }

  if (!member.requiresAttendance) {
    throw new BadRequestException({
      memberId: member.id,
      message: "WORKER_MEMBER_ATTENDANCE_DISABLED",
      projectId
    });
  }

  return {
    memberId: member.id,
    participantId: profile.id,
    participantType: "WORKER"
  };
};

const getValidManagerMember = (
  profile: ManagerProfileWithMemberships,
  projectId: string
): AttendanceParticipant | null => {
  const member = profile.projectMemberships[0];

  if (member === undefined) {
    return null;
  }

  if (member.status !== "ACTIVE") {
    throw new BadRequestException({
      memberId: member.id,
      message: "MANAGER_MEMBER_NOT_ACTIVE",
      projectId,
      status: member.status
    });
  }

  if (!member.requiresAttendance) {
    throw new BadRequestException({
      memberId: member.id,
      message: "MANAGER_MEMBER_ATTENDANCE_DISABLED",
      projectId
    });
  }

  return {
    memberId: member.id,
    participantId: profile.id,
    participantType: "MANAGER"
  };
};

const getAbnormalReason = (facePassed: boolean, geofenceDecision: GeofenceDecision): string | null => {
  if (!facePassed) {
    return "FACE_NOT_PASSED";
  }

  if (!geofenceDecision.isInside) {
    return "OUTSIDE_GEOFENCE";
  }

  return null;
};

@Injectable()
export class AttendanceService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FACE_VERIFICATION_CONNECTOR) private readonly faceConnector: FaceVerificationConnector,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  async configureDefaultShift(projectId: string, request: ConfigureDefaultShiftRequest): Promise<DefaultShiftResponse> {
    await this.getProjectOrThrow(projectId);

    return this.prisma.$transaction(async (transaction): Promise<DefaultShiftResponse> => {
      await transaction.shift.updateMany({
        data: {
          isDefault: false
        },
        where: {
          projectId
        }
      });
      const shift = await transaction.shift.create({
        data: {
          isDefault: true,
          name: request.name,
          projectId
        }
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
            startTime: segmentRequest.startTime
          }
        });
        segments.push(segment);
      }

      return createDefaultShiftResponse(shift, segments);
    });
  }

  async configureDefaultSchedule(
    projectId: string,
    request: ConfigureDefaultScheduleRequest
  ): Promise<DefaultScheduleResponse> {
    await this.getProjectOrThrow(projectId);
    const defaultShift = await this.getDefaultShiftOrThrow(projectId);

    return this.prisma.$transaction(async (transaction): Promise<DefaultScheduleResponse> => {
      await transaction.schedule.deleteMany({
        where: {
          ownerId: projectId,
          ownerType: projectScheduleOwnerType
        }
      });
      const schedule = await transaction.schedule.create({
        data: {
          endsOn: request.endsOn === null ? null : dateOnlyToDate(request.endsOn),
          ownerId: projectId,
          ownerType: projectScheduleOwnerType,
          shiftId: defaultShift.id,
          startsOn: dateOnlyToDate(request.startsOn),
          workdayMask: createWorkdayMask(request.workdays)
        }
      });

      return createDefaultScheduleResponse(schedule);
    });
  }

  async submitAttendanceRecord(
    projectId: string,
    userId: string,
    request: SubmitAttendanceRecordRequest
  ): Promise<SubmitAttendanceRecordResponse> {
    const project = await this.getProjectOrThrow(projectId);
    const participant = await this.resolveAttendanceParticipant(userId, projectId);
    const attendanceDate = dateOnlyToDate(request.attendanceDate);
    const occurredAt = new Date(request.occurredAt);
    this.assertOccurredAtMatchesAttendanceDate(occurredAt, request.attendanceDate);
    const shift = await this.getShiftForAttendanceSubmissionOrThrow(projectId, attendanceDate);

    const geofenceDecision = this.createGeofenceDecision(project, request.latitude, request.longitude);
    const faceResult = await this.faceConnector.verifyFace({
      baselineRef: null,
      selfieObjectKey: request.selfieObjectKey
    });
    const facePassed = deriveFacePassed(faceResult, this.env.FACE_SCORE_THRESHOLD);
    const abnormalReason = getAbnormalReason(facePassed, geofenceDecision);
    const status: AttendanceRecordStatusValue = abnormalReason === null ? "VALID" : "INVALID";
    const record = await this.prisma.attendanceRecord.create({
      data: {
        abnormalReason,
        attendanceDate,
        facePassed,
        faceScore: String(faceResult.score),
        geofenceDistanceM: formatMeters(geofenceDecision.distanceM),
        latitude: request.latitude,
        locationAccuracyM: request.locationAccuracyM,
        longitude: request.longitude,
        occurredAt,
        participantId: participant.participantId,
        participantType: participant.participantType,
        pointCode: request.pointCode,
        projectId,
        selfieHash: request.selfieHash,
        selfieObjectKey: request.selfieObjectKey,
        sitePhotoHash: request.sitePhotoHash,
        sitePhotoObjectKey: request.sitePhotoObjectKey,
        source: "DEVICE",
        status
      }
    });
    const result = await this.recalculateAttendanceResult(projectId, request.attendanceDate, attendanceDate, participant, shift);

    return {
      record: createAttendanceRecordResponse(record),
      result: createAttendanceResultResponse(result)
    };
  }

  async recalculateDailyResult(
    projectId: string,
    attendanceDateText: string,
    participantType: ProfileOwnerTypeValue,
    participantId: string
  ): Promise<AttendanceResult> {
    await this.getProjectOrThrow(projectId);
    const attendanceDate = dateOnlyToDate(attendanceDateText);
    const shift = await this.getShiftForAttendanceSummary(projectId, attendanceDate);

    return this.recalculateAttendanceResult(projectId, attendanceDateText, attendanceDate, {
      memberId: participantId,
      participantId,
      participantType
    }, shift);
  }

  private async getProjectOrThrow(projectId: string): Promise<Project> {
    const project = await this.prisma.project.findUnique({
      where: {
        id: projectId
      }
    });

    if (project === null) {
      throw new NotFoundException({
        message: "PROJECT_NOT_FOUND",
        projectId
      });
    }

    return project;
  }

  private async getDefaultShiftOrThrow(projectId: string): Promise<ShiftWithSegments> {
    const shift = await this.prisma.shift.findFirst({
      include: {
        segments: true
      },
      where: {
        isDefault: true,
        projectId
      }
    });

    if (shift === null) {
      throw new BadRequestException({
        message: "DEFAULT_SHIFT_NOT_CONFIGURED",
        projectId
      });
    }

    return shift;
  }

  private async loadProjectSchedulesWithShift(projectId: string): Promise<readonly ProjectScheduleWithShift[]> {
    return this.prisma.schedule.findMany({
      include: {
        shift: {
          include: {
            segments: true
          }
        }
      },
      orderBy: {
        startsOn: "desc"
      },
      where: {
        ownerId: projectId,
        ownerType: projectScheduleOwnerType
      }
    });
  }

  private async getShiftForAttendanceSubmissionOrThrow(projectId: string, attendanceDate: Date): Promise<ShiftWithSegments> {
    const schedules = await this.loadProjectSchedulesWithShift(projectId);

    if (schedules.length === 0) {
      return this.getDefaultShiftOrThrow(projectId);
    }

    const activeSchedule = schedules.find(
      (schedule: ProjectScheduleWithShift): boolean =>
        isDateInScheduleRange(schedule, attendanceDate) && isDateEnabledBySchedule(schedule, attendanceDate)
    );

    if (activeSchedule === undefined) {
      throw new BadRequestException({
        attendanceDate: toDateOnly(attendanceDate),
        message: "ATTENDANCE_DATE_NOT_SCHEDULED",
        projectId
      });
    }

    return activeSchedule.shift;
  }

  private async getShiftForAttendanceSummary(projectId: string, attendanceDate: Date): Promise<ShiftWithSegments> {
    const schedules = await this.prisma.schedule.findMany({
      include: {
        shift: {
          include: {
            segments: true
          }
        }
      },
      orderBy: {
        startsOn: "desc"
      },
      where: {
        ownerId: projectId,
        ownerType: projectScheduleOwnerType
      }
    });

    if (schedules.length === 0) {
      return this.getDefaultShiftOrThrow(projectId);
    }

    const activeSchedule = schedules.find(
      (schedule: ProjectScheduleWithShift): boolean =>
        isDateInScheduleRange(schedule, attendanceDate) && isDateEnabledBySchedule(schedule, attendanceDate)
    );

    if (activeSchedule === undefined) {
      return this.getDefaultShiftOrThrow(projectId);
    }

    return activeSchedule.shift;
  }

  private async resolveAttendanceParticipant(userId: string, projectId: string): Promise<AttendanceParticipant> {
    const [workerProfile, managerProfile] = await Promise.all([
      this.prisma.workerProfile.findUnique({
        include: {
          projectMemberships: {
            where: {
              projectId
            }
          }
        },
        where: {
          userId
        }
      }),
      this.prisma.managerProfile.findUnique({
        include: {
          projectMemberships: {
            where: {
              projectId
            }
          }
        },
        where: {
          userId
        }
      })
    ]);

    if (workerProfile !== null && managerProfile !== null) {
      throw new ConflictException({
        message: "USER_BOUND_TO_MULTIPLE_ATTENDANCE_PROFILE_TYPES",
        projectId,
        userId
      });
    }

    if (workerProfile !== null) {
      const workerParticipant = getValidWorkerMember(workerProfile, projectId);

      if (workerParticipant !== null) {
        return workerParticipant;
      }
    }

    if (managerProfile !== null) {
      const managerParticipant = getValidManagerMember(managerProfile, projectId);

      if (managerParticipant !== null) {
        return managerParticipant;
      }
    }

    throw new BadRequestException({
      message: "ATTENDANCE_PARTICIPANT_MEMBERSHIP_NOT_FOUND",
      projectId,
      userId
    });
  }

  private createGeofenceDecision(project: Project, latitude: string, longitude: string): GeofenceDecision {
    const distanceM = calculateDistanceMeters(
      Number(String(project.centerLatitude)),
      Number(String(project.centerLongitude)),
      Number(latitude),
      Number(longitude)
    );

    return {
      distanceM,
      isInside: distanceM <= project.geofenceRadiusM
    };
  }

  private assertOccurredAtMatchesAttendanceDate(occurredAt: Date, attendanceDate: string): void {
    const occurredDate = getChinaDateOnly(occurredAt);

    if (occurredDate !== attendanceDate) {
      throw new BadRequestException({
        attendanceDate,
        message: "ATTENDANCE_OCCURRED_AT_DATE_MISMATCH",
        occurredAt: occurredAt.toISOString(),
        occurredDate
      });
    }
  }

  private async recalculateAttendanceResult(
    projectId: string,
    attendanceDateText: string,
    attendanceDate: Date,
    participant: AttendanceParticipant,
    shift: ShiftWithSegments
  ): Promise<AttendanceResult> {
    const [records, approvedMakeupRequests] = await Promise.all([
      this.prisma.attendanceRecord.findMany({
        orderBy: {
          occurredAt: "asc"
        },
        where: {
          attendanceDate,
          participantId: participant.participantId,
          participantType: participant.participantType,
          projectId
        }
      }),
      this.prisma.makeupRequest.findMany({
        where: {
          attendanceDate,
          participantId: participant.participantId,
          participantType: participant.participantType,
          projectId,
          status: "APPROVED"
        }
      })
    ]);
    const summary = summarizeAttendanceOrThrow(
      createShiftRule(attendanceDateText, shift.segments),
      [...records.map(toAttendanceRecordInput), ...approvedMakeupRequests.map(toMakeupRecordInput)]
    );
    const abnormalRecordCount = records.filter(
      (record: AttendanceRecord): boolean => record.status === "INVALID"
    ).length;
    const calculatedAt = new Date();

    return this.prisma.attendanceResult.upsert({
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
        workedMinutes: summary.workedMinutes
      },
      update: {
        abnormalRecordCount,
        approvedMakeupCount: approvedMakeupRequests.length,
        calculatedAt,
        isAbsent: summary.isAbsent,
        isEarlyLeave: summary.isEarlyLeave,
        isLate: summary.isLate,
        isMissingPunch: summary.isMissingPunch,
        workedMinutes: summary.workedMinutes
      },
      where: {
        projectId_attendanceDate_participantType_participantId: {
          attendanceDate,
          participantId: participant.participantId,
          participantType: participant.participantType,
          projectId
        }
      }
    });
  }
}
