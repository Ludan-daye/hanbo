import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { AttendanceResult, MakeupRequest, Project, ProjectManagerMember, ProjectWorkerMember, Shift, ShiftSegment } from "@prisma/client";
import {
  canApproveScopedMakeupRequest,
  type AuthorizationTargetScope
} from "@construction/domain/roles.js";

import { AttendanceService } from "../attendance/attendance.service.js";
import type { AttendanceResultResponse, ProfileOwnerTypeValue } from "../attendance/attendance.types.js";
import { AuthorizationContextService } from "../authorization/authorization-context.service.js";
import { PrismaService } from "../infrastructure/database/prisma.service.js";

import type {
  CreateMakeupRequestBody,
  MakeupRequestResponse,
  MakeupStatusValue,
  ReviewMakeupRequestBody,
  ReviewMakeupResponse
} from "./makeup.types.js";

type CountResult = {
  readonly count: number;
};

type ShiftWithSegments = Shift & {
  readonly segments: readonly ShiftSegment[];
};

type WorkerProfileWithMemberships = {
  readonly id: string;
  readonly projectMemberships: readonly ProjectWorkerMember[];
};

type ManagerProfileWithMemberships = {
  readonly id: string;
  readonly projectMemberships: readonly ProjectManagerMember[];
};

type MakeupParticipant = {
  readonly participantId: string;
  readonly participantType: ProfileOwnerTypeValue;
};

type MakeupRequestForResponse = Pick<
  MakeupRequest,
  | "approvalReason"
  | "approvedAt"
  | "approverUserId"
  | "attendanceDate"
  | "id"
  | "participantId"
  | "participantType"
  | "pointCode"
  | "projectId"
  | "reason"
  | "requestedOccurredAt"
  | "requesterUserId"
  | "status"
>;

const chinaDateFormatter = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Shanghai",
  year: "numeric"
});

const dateOnlyToDate = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

const toDateOnly = (value: Date): string => value.toISOString().slice(0, 10);

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
        message: "Failed to format China date from requestedOccurredAt",
        requestedOccurredAt: value.toISOString()
      })
    );
  }

  return `${year}-${month}-${day}`;
};

const getPointSegmentSequence = (pointCode: MakeupRequest["pointCode"]): 1 | 2 => {
  if (pointCode === "SEGMENT_1_START" || pointCode === "SEGMENT_1_END") {
    return 1;
  }

  return 2;
};

const createProjectTargetScope = (project: Project): AuthorizationTargetScope => ({
  companyId: project.companyId,
  projectId: project.id,
  scopeId: project.id,
  scopeType: "PROJECT"
});

const createTeamTargetScope = (project: Project, teamId: string): AuthorizationTargetScope => ({
  companyId: project.companyId,
  projectId: project.id,
  scopeId: teamId,
  scopeType: "TEAM",
  teamId
});

export const createMakeupRequestResponse = (request: MakeupRequestForResponse): MakeupRequestResponse => ({
  approvalReason: request.approvalReason,
  approvedAt: request.approvedAt === null ? null : request.approvedAt.toISOString(),
  approverUserId: request.approverUserId,
  attendanceDate: toDateOnly(request.attendanceDate),
  id: request.id,
  participantId: request.participantId,
  participantType: request.participantType,
  pointCode: request.pointCode,
  projectId: request.projectId,
  reason: request.reason,
  requestedOccurredAt: request.requestedOccurredAt.toISOString(),
  requesterUserId: request.requesterUserId,
  status: request.status as MakeupStatusValue
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

const getValidWorkerParticipant = (profile: WorkerProfileWithMemberships, projectId: string): MakeupParticipant | null => {
  const member = profile.projectMemberships[0];

  if (member === undefined) {
    return null;
  }

  if (member.status !== "ACTIVE") {
    throw new BadRequestException({
      memberId: member.id,
      message: "WORKER_MEMBER_NOT_ACTIVE_FOR_MAKEUP",
      projectId,
      status: member.status
    });
  }

  if (!member.requiresAttendance) {
    throw new BadRequestException({
      memberId: member.id,
      message: "WORKER_MEMBER_ATTENDANCE_DISABLED_FOR_MAKEUP",
      projectId
    });
  }

  return {
    participantId: profile.id,
    participantType: "WORKER"
  };
};

const getValidManagerParticipant = (profile: ManagerProfileWithMemberships, projectId: string): MakeupParticipant | null => {
  const member = profile.projectMemberships[0];

  if (member === undefined) {
    return null;
  }

  if (member.status !== "ACTIVE") {
    throw new BadRequestException({
      memberId: member.id,
      message: "MANAGER_MEMBER_NOT_ACTIVE_FOR_MAKEUP",
      projectId,
      status: member.status
    });
  }

  if (!member.requiresAttendance) {
    throw new BadRequestException({
      memberId: member.id,
      message: "MANAGER_MEMBER_ATTENDANCE_DISABLED_FOR_MAKEUP",
      projectId
    });
  }

  return {
    participantId: profile.id,
    participantType: "MANAGER"
  };
};

const assertSinglePendingReviewUpdate = (result: CountResult, requestId: string): void => {
  if (result.count !== 1) {
    throw new ConflictException({
      message: "MAKEUP_REQUEST_NOT_PENDING",
      requestId
    });
  }
};

@Injectable()
export class MakeupService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthorizationContextService) private readonly authorizationContext: AuthorizationContextService,
    @Inject(AttendanceService) private readonly attendanceService: AttendanceService
  ) {}

  async createMakeupRequest(
    projectId: string,
    userId: string,
    request: CreateMakeupRequestBody
  ): Promise<MakeupRequestResponse> {
    await this.getProjectOrThrow(projectId);
    const defaultShift = await this.getDefaultShiftOrThrow(projectId);
    this.assertPointBelongsToDefaultShift(defaultShift, request.pointCode);
    const participant = await this.resolveMakeupParticipant(userId, projectId);
    const attendanceDate = dateOnlyToDate(request.attendanceDate);
    const requestedOccurredAt = new Date(request.requestedOccurredAt);
    this.assertRequestedOccurredAtMatchesAttendanceDate(requestedOccurredAt, request.attendanceDate);

    const created = await this.prisma.makeupRequest.create({
      data: {
        attendanceDate,
        participantId: participant.participantId,
        participantType: participant.participantType,
        pointCode: request.pointCode,
        projectId,
        reason: request.reason,
        requestedOccurredAt,
        requesterUserId: userId,
        status: "PENDING"
      }
    });

    return createMakeupRequestResponse(created);
  }

  async approveMakeupRequest(
    requestId: string,
    approverUserId: string,
    body: ReviewMakeupRequestBody
  ): Promise<ReviewMakeupResponse> {
    const request = await this.getPendingMakeupRequestOrThrow(requestId);
    await this.assertReviewerAuthorized(request, approverUserId);
    const approvedAt = new Date();
    const updateResult = await this.prisma.makeupRequest.updateMany({
      data: {
        approvalReason: body.approvalReason,
        approvedAt,
        approverUserId,
        status: "APPROVED"
      },
      where: {
        id: request.id,
        status: "PENDING"
      }
    });
    assertSinglePendingReviewUpdate(updateResult, request.id);
    const updated = await this.getMakeupRequestOrThrow(request.id);
    const result = await this.attendanceService.recalculateDailyResult(
      updated.projectId,
      toDateOnly(updated.attendanceDate),
      updated.participantType,
      updated.participantId
    );

    return {
      request: createMakeupRequestResponse(updated),
      result: createAttendanceResultResponse(result)
    };
  }

  async rejectMakeupRequest(
    requestId: string,
    approverUserId: string,
    body: ReviewMakeupRequestBody
  ): Promise<ReviewMakeupResponse> {
    const request = await this.getPendingMakeupRequestOrThrow(requestId);
    await this.assertReviewerAuthorized(request, approverUserId);
    const updateResult = await this.prisma.makeupRequest.updateMany({
      data: {
        approvalReason: body.approvalReason,
        approverUserId,
        status: "REJECTED"
      },
      where: {
        id: request.id,
        status: "PENDING"
      }
    });
    assertSinglePendingReviewUpdate(updateResult, request.id);
    const updated = await this.getMakeupRequestOrThrow(request.id);

    return {
      request: createMakeupRequestResponse(updated),
      result: null
    };
  }

  async listTeamPendingRequests(teamId: string): Promise<readonly MakeupRequestResponse[]> {
    const team = await this.prisma.team.findUnique({ where: { id: teamId } });

    if (team === null) {
      throw new NotFoundException({ message: "TEAM_NOT_FOUND", teamId });
    }

    const [workerMembers, managerMembers] = await Promise.all([
      this.prisma.projectWorkerMember.findMany({
        select: { workerId: true },
        where: { projectId: team.projectId, status: "ACTIVE", teamId }
      }),
      this.prisma.projectManagerMember.findMany({
        select: { managerId: true },
        where: { projectId: team.projectId, status: "ACTIVE", teamScopeId: teamId }
      })
    ]);

    const workerIds = workerMembers.map((m) => m.workerId);
    const managerIds = managerMembers.map((m) => m.managerId);
    const requests = await this.prisma.makeupRequest.findMany({
      orderBy: { createdAt: "asc" },
      where: {
        projectId: team.projectId,
        status: "PENDING",
        OR: [
          ...(workerIds.length > 0 ? [{ participantType: "WORKER" as const, participantId: { in: workerIds } }] : []),
          ...(managerIds.length > 0 ? [{ participantType: "MANAGER" as const, participantId: { in: managerIds } }] : [])
        ]
      }
    });

    return requests.map(createMakeupRequestResponse);
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
        message: "DEFAULT_SHIFT_NOT_CONFIGURED_FOR_MAKEUP",
        projectId
      });
    }

    return shift;
  }

  private assertPointBelongsToDefaultShift(shift: ShiftWithSegments, pointCode: MakeupRequest["pointCode"]): void {
    const sequence = getPointSegmentSequence(pointCode);
    const hasSegment = shift.segments.some((segment: ShiftSegment): boolean => segment.sequence === sequence);

    if (!hasSegment) {
      throw new BadRequestException({
        message: "MAKEUP_POINT_NOT_IN_DEFAULT_SHIFT",
        pointCode,
        shiftId: shift.id
      });
    }
  }

  private async resolveMakeupParticipant(userId: string, projectId: string): Promise<MakeupParticipant> {
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
        message: "USER_BOUND_TO_MULTIPLE_MAKEUP_PROFILE_TYPES",
        projectId,
        userId
      });
    }

    if (workerProfile !== null) {
      const workerParticipant = getValidWorkerParticipant(workerProfile, projectId);

      if (workerParticipant !== null) {
        return workerParticipant;
      }
    }

    if (managerProfile !== null) {
      const managerParticipant = getValidManagerParticipant(managerProfile, projectId);

      if (managerParticipant !== null) {
        return managerParticipant;
      }
    }

    throw new BadRequestException({
      message: "MAKEUP_PARTICIPANT_MEMBERSHIP_NOT_FOUND",
      projectId,
      userId
    });
  }

  private async getMakeupRequestOrThrow(requestId: string): Promise<MakeupRequest> {
    const request = await this.prisma.makeupRequest.findUnique({
      where: {
        id: requestId
      }
    });

    if (request === null) {
      throw new NotFoundException({
        message: "MAKEUP_REQUEST_NOT_FOUND",
        requestId
      });
    }

    return request;
  }

  private async getPendingMakeupRequestOrThrow(requestId: string): Promise<MakeupRequest> {
    const request = await this.getMakeupRequestOrThrow(requestId);

    if (request.status !== "PENDING") {
      throw new ConflictException({
        message: "MAKEUP_REQUEST_NOT_PENDING",
        requestId,
        status: request.status
      });
    }

    return request;
  }

  private async assertReviewerAuthorized(request: MakeupRequest, approverUserId: string): Promise<void> {
    const [project, authorizationData] = await Promise.all([
      this.getProjectOrThrow(request.projectId),
      this.authorizationContext.loadAuthorizationData(approverUserId)
    ]);
    const targetScope = await this.resolveReviewTargetScope(project, request);
    const decision = canApproveScopedMakeupRequest({
      approverUserId,
      assignments: authorizationData.assignments,
      permissionsByRoleCode: authorizationData.permissionsByRoleCode,
      requesterUserId: request.requesterUserId,
      targetScope
    });

    if (!decision.isAuthorized) {
      throw new ForbiddenException({
        approverUserId,
        message: "MAKEUP_APPROVAL_DENIED",
        reason: decision.reason,
        requestId: request.id,
        targetScope
      });
    }
  }

  private async resolveReviewTargetScope(
    project: Project,
    request: MakeupRequest
  ): Promise<AuthorizationTargetScope> {
    if (request.participantType === "WORKER") {
      const member = await this.prisma.projectWorkerMember.findUnique({
        where: {
          projectId_workerId: {
            projectId: request.projectId,
            workerId: request.participantId
          }
        }
      });

      if (member === null) {
        throw new BadRequestException({
          message: "MAKEUP_WORKER_MEMBER_NOT_FOUND",
          participantId: request.participantId,
          projectId: request.projectId,
          requestId: request.id
        });
      }

      return member.teamId === null ? createProjectTargetScope(project) : createTeamTargetScope(project, member.teamId);
    }

    const member = await this.prisma.projectManagerMember.findUnique({
      where: {
        projectId_managerId: {
          managerId: request.participantId,
          projectId: request.projectId
        }
      }
    });

    if (member === null) {
      throw new BadRequestException({
        message: "MAKEUP_MANAGER_MEMBER_NOT_FOUND",
        participantId: request.participantId,
        projectId: request.projectId,
        requestId: request.id
      });
    }

    return member.teamScopeId === null ? createProjectTargetScope(project) : createTeamTargetScope(project, member.teamScopeId);
  }

  private assertRequestedOccurredAtMatchesAttendanceDate(requestedOccurredAt: Date, attendanceDate: string): void {
    const occurredDate = getChinaDateOnly(requestedOccurredAt);

    if (occurredDate !== attendanceDate) {
      throw new BadRequestException({
        attendanceDate,
        message: "MAKEUP_REQUESTED_OCCURRED_AT_DATE_MISMATCH",
        occurredDate,
        requestedOccurredAt: requestedOccurredAt.toISOString()
      });
    }
  }
}
