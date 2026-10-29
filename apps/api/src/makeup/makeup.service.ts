import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  Prisma,
  AttendanceResult,
  MakeupRequest,
  Project,
  ProjectManagerMember,
  ProjectWorkerMember,
} from "@prisma/client";
import {
  canApproveScopedMakeupRequest,
  type AuthorizationTargetScope,
} from "@construction/domain/roles.js";

import {
  attendanceLockKey,
  memberStateOn,
  workerRole,
} from "../attendance/member-history.js";
import {
  loadPlanningData,
  authorizedPlanLevel,
} from "../attendance/attendance-plans.js";
import { ROLE_LEVEL } from "@construction/domain/roles.js";
import { API_ENV } from "../config/env.module.js";
import type { ApiEnv } from "../config/env.js";
import { decryptPersonnelName } from "../management/personnel-name.js";
import { AttendanceService } from "../attendance/attendance.service.js";
import type {
  AttendanceResultResponse,
  ProfileOwnerTypeValue,
} from "../attendance/attendance.types.js";
import { AuthorizationContextService } from "../authorization/authorization-context.service.js";
import { PrismaService } from "../infrastructure/database/prisma.service.js";

import type {
  CreateMakeupRequestBody,
  MakeupInboxItem,
  MakeupInboxResponse,
  MakeupRequestResponse,
  MakeupStatusValue,
  ReviewMakeupRequestBody,
  ReviewMakeupResponse,
} from "./makeup.types.js";

type CountResult = {
  readonly count: number;
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
  | "pointLabel"
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
  year: "numeric",
});

const dateOnlyToDate = (value: string): Date =>
  new Date(`${value}T00:00:00.000Z`);

const toDateOnly = (value: Date): string => value.toISOString().slice(0, 10);

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
        message: "Failed to format China date from requestedOccurredAt",
        requestedOccurredAt: value.toISOString(),
      }),
    );
  }

  return `${year}-${month}-${day}`;
};

const createProjectTargetScope = (
  project: Project,
): AuthorizationTargetScope => ({
  companyId: project.companyId,
  projectId: project.id,
  scopeId: project.id,
  scopeType: "PROJECT",
});

const createTeamTargetScope = (
  project: Project,
  teamId: string,
): AuthorizationTargetScope => ({
  companyId: project.companyId,
  projectId: project.id,
  scopeId: teamId,
  scopeType: "TEAM",
  teamId,
});

export const createMakeupRequestResponse = (
  request: MakeupRequestForResponse,
): MakeupRequestResponse => ({
  approvalReason: request.approvalReason,
  approvedAt:
    request.approvedAt === null ? null : request.approvedAt.toISOString(),
  approverUserId: request.approverUserId,
  attendanceDate: toDateOnly(request.attendanceDate),
  id: request.id,
  participantId: request.participantId,
  participantType: request.participantType,
  pointCode: request.pointCode,
  pointLabel: request.pointLabel,
  projectId: request.projectId,
  reason: request.reason,
  requestedOccurredAt: request.requestedOccurredAt.toISOString(),
  requesterUserId: request.requesterUserId,
  status: request.status as MakeupStatusValue,
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

const getValidWorkerParticipant = (
  profile: WorkerProfileWithMemberships,
  projectId: string,
): MakeupParticipant | null => {
  const member = profile.projectMemberships[0];

  if (member === undefined) {
    return null;
  }

  return {
    participantId: profile.id,
    participantType: "WORKER",
  };
};

const getValidManagerParticipant = (
  profile: ManagerProfileWithMemberships,
  projectId: string,
): MakeupParticipant | null => {
  const member = profile.projectMemberships[0];

  if (member === undefined) {
    return null;
  }

  return {
    participantId: profile.id,
    participantType: "MANAGER",
  };
};

const assertSinglePendingReviewUpdate = (
  result: CountResult,
  requestId: string,
): void => {
  if (result.count !== 1) {
    throw new ConflictException({
      message: "MAKEUP_REQUEST_NOT_PENDING",
      requestId,
    });
  }
};

@Injectable()
export class MakeupService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthorizationContextService)
    private readonly authorizationContext: AuthorizationContextService,
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(AttendanceService)
    private readonly attendanceService: AttendanceService,
  ) {}

  async createMakeupRequest(
    projectId: string,
    userId: string,
    request: CreateMakeupRequestBody,
  ): Promise<MakeupRequestResponse> {
    await this.getProjectOrThrow(projectId);
    const participant = await this.resolveMakeupParticipant(userId, projectId);
    const attendanceDate = dateOnlyToDate(request.attendanceDate);
    const requestedOccurredAt = new Date(request.requestedOccurredAt);
    this.assertRequestedOccurredAtMatchesAttendanceDate(
      requestedOccurredAt,
      request.attendanceDate,
    );
    if (requestedOccurredAt.getTime() > Date.now())
      throw new BadRequestException({ message: "不能申请未来时间的补卡。" });
    const plan = await this.attendanceService.getMyPlan(
      projectId,
      userId,
      request.attendanceDate,
    );
    if (
      !plan.isWorkday ||
      !plan.points.some((point) => point.code === request.pointCode)
    )
      throw new BadRequestException({
        message: "补卡时点不属于当天有效排班。",
      });

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${attendanceLockKey(projectId, participant.participantType, participant.participantId, request.attendanceDate)}, 0))`;
      await this.attendanceService.assertPointAvailable(
        tx,
        projectId,
        participant.participantType,
        participant.participantId,
        request.attendanceDate,
        request.pointCode,
      );
      const pending = await tx.makeupRequest.findFirst({
        where: {
          projectId,
          ...participant,
          attendanceDate,
          pointCode: request.pointCode,
          status: "PENDING",
        },
      });
      if (pending !== null)
        throw new ConflictException({
          message: "该时点已有待审批补卡，请勿重复申请。",
        });
      return tx.makeupRequest.create({
        data: {
          attendanceDate,
          participantId: participant.participantId,
          participantType: participant.participantType,
          pointCode: request.pointCode,
          pointLabel: plan.points.find(
            (point) => point.code === request.pointCode,
          )!.label,
          projectId,
          reason: request.reason,
          requestedOccurredAt,
          requesterUserId: userId,
          status: "PENDING",
        },
      });
    });
    return createMakeupRequestResponse(created);
  }

  async approveMakeupRequest(
    requestId: string,
    approverUserId: string,
    body: ReviewMakeupRequestBody,
  ): Promise<ReviewMakeupResponse> {
    const request = await this.getPendingMakeupRequestOrThrow(requestId);
    await this.assertReviewerAuthorized(request, approverUserId);
    return this.prisma.$transaction(
      async (tx): Promise<ReviewMakeupResponse> => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${attendanceLockKey(request.projectId, request.participantType, request.participantId, toDateOnly(request.attendanceDate))}, 0))`;
        await this.attendanceService.assertPointAvailable(
          tx,
          request.projectId,
          request.participantType,
          request.participantId,
          toDateOnly(request.attendanceDate),
          request.pointCode,
        );
        const update = await tx.makeupRequest.updateMany({
          where: { id: request.id, status: "PENDING" },
          data: {
            approvalReason: body.approvalReason,
            approvedAt: new Date(),
            approverUserId,
            status: "APPROVED",
          },
        });
        assertSinglePendingReviewUpdate(update, request.id);
        const updated = await tx.makeupRequest.findUniqueOrThrow({
          where: { id: request.id },
        });
        const result = await this.attendanceService.recalculateDailyResult(
          tx,
          updated.projectId,
          toDateOnly(updated.attendanceDate),
          updated.participantType,
          updated.participantId,
        );
        return {
          request: createMakeupRequestResponse(updated),
          result: createAttendanceResultResponse(result),
        };
      },
    );
  }

  async rejectMakeupRequest(
    requestId: string,
    approverUserId: string,
    body: ReviewMakeupRequestBody,
  ): Promise<ReviewMakeupResponse> {
    const request = await this.getPendingMakeupRequestOrThrow(requestId);
    await this.assertReviewerAuthorized(request, approverUserId);
    const updateResult = await this.prisma.makeupRequest.updateMany({
      data: {
        approvalReason: body.approvalReason,
        approvedAt: new Date(),
        approverUserId,
        status: "REJECTED",
      },
      where: {
        id: request.id,
        status: "PENDING",
      },
    });
    assertSinglePendingReviewUpdate(updateResult, request.id);
    const updated = await this.getMakeupRequestOrThrow(request.id);

    return {
      request: createMakeupRequestResponse(updated),
      result: null,
    };
  }

  async listTeamPendingRequests(
    teamId: string,
  ): Promise<readonly MakeupRequestResponse[]> {
    const team = await this.prisma.team.findUnique({ where: { id: teamId } });

    if (team === null) {
      throw new NotFoundException({ message: "TEAM_NOT_FOUND", teamId });
    }

    const [workerMembers, managerMembers] = await Promise.all([
      this.prisma.projectWorkerMember.findMany({
        select: { workerId: true },
        where: { projectId: team.projectId, status: "ACTIVE", teamId },
      }),
      this.prisma.projectManagerMember.findMany({
        select: { managerId: true },
        where: {
          projectId: team.projectId,
          status: "ACTIVE",
          teamScopeId: teamId,
        },
      }),
    ]);

    const workerIds = workerMembers.map((m) => m.workerId);
    const managerIds = managerMembers.map((m) => m.managerId);
    const requests = await this.prisma.makeupRequest.findMany({
      orderBy: { createdAt: "asc" },
      where: {
        projectId: team.projectId,
        status: "PENDING",
        OR: [
          ...(workerIds.length > 0
            ? [
                {
                  participantType: "WORKER" as const,
                  participantId: { in: workerIds },
                },
              ]
            : []),
          ...(managerIds.length > 0
            ? [
                {
                  participantType: "MANAGER" as const,
                  participantId: { in: managerIds },
                },
              ]
            : []),
        ],
      },
    });

    return requests.map(createMakeupRequestResponse);
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

  private async resolveMakeupParticipant(
    userId: string,
    projectId: string,
  ): Promise<MakeupParticipant> {
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
        message: "USER_BOUND_TO_MULTIPLE_MAKEUP_PROFILE_TYPES",
        projectId,
        userId,
      });
    }

    if (workerProfile !== null) {
      const workerParticipant = getValidWorkerParticipant(
        workerProfile,
        projectId,
      );

      if (workerParticipant !== null) {
        return workerParticipant;
      }
    }

    if (managerProfile !== null) {
      const managerParticipant = getValidManagerParticipant(
        managerProfile,
        projectId,
      );

      if (managerParticipant !== null) {
        return managerParticipant;
      }
    }

    throw new BadRequestException({
      message: "MAKEUP_PARTICIPANT_MEMBERSHIP_NOT_FOUND",
      projectId,
      userId,
    });
  }

  private async getMakeupRequestOrThrow(
    requestId: string,
  ): Promise<MakeupRequest> {
    const request = await this.prisma.makeupRequest.findUnique({
      where: {
        id: requestId,
      },
    });

    if (request === null) {
      throw new NotFoundException({
        message: "MAKEUP_REQUEST_NOT_FOUND",
        requestId,
      });
    }

    return request;
  }

  private async getPendingMakeupRequestOrThrow(
    requestId: string,
  ): Promise<MakeupRequest> {
    const request = await this.getMakeupRequestOrThrow(requestId);

    if (request.status !== "PENDING") {
      throw new ConflictException({
        message: "MAKEUP_REQUEST_NOT_PENDING",
        requestId,
        status: request.status,
      });
    }

    return request;
  }

  private async assertReviewerAuthorized(
    request: MakeupRequest,
    approverUserId: string,
  ): Promise<void> {
    if (!(await this.reviewerAllowed(request, approverUserId)))
      throw new ForbiddenException({
        message: "MAKEUP_APPROVAL_DENIED",
        requestId: request.id,
        reason: "只能审批授权范围内下级的申请，不能自审或审批同级。",
      });
  }
  private async reviewerAllowed(
    request: MakeupRequest,
    approverUserId: string,
  ): Promise<boolean> {
    const [project, authorization, requesterAuthorization, planning, member] =
      await Promise.all([
        this.getProjectOrThrow(request.projectId),
        this.authorizationContext.loadAuthorizationData(approverUserId),
        this.authorizationContext.loadAuthorizationData(
          request.requesterUserId,
        ),
        loadPlanningData(this.prisma, [request.projectId]),
        request.participantType === "WORKER"
          ? this.prisma.projectWorkerMember.findUnique({
              where: {
                projectId_workerId: {
                  projectId: request.projectId,
                  workerId: request.participantId,
                },
              },
            })
          : this.prisma.projectManagerMember.findUnique({
              where: {
                projectId_managerId: {
                  projectId: request.projectId,
                  managerId: request.participantId,
                },
              },
            }),
      ]);
    if (member === null)
      throw new BadRequestException({
        message: "MAKEUP_MEMBER_NOT_FOUND",
        requestId: request.id,
      });
    const state = memberStateOn(
      {
        memberId: member.id,
        teamId: "teamId" in member ? member.teamId : member.teamScopeId,
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
      },
      planning.histories,
      toDateOnly(request.attendanceDate),
    );
    const targetScope =
      state.teamId === null
        ? createProjectTargetScope(project)
        : createTeamTargetScope(project, state.teamId);
    const decision = canApproveScopedMakeupRequest({
      approverUserId,
      requesterUserId: request.requesterUserId,
      assignments: authorization.assignments,
      permissionsByRoleCode: authorization.permissionsByRoleCode,
      targetScope,
    });
    const requesterLevel = Math.max(
      ROLE_LEVEL[state.roleCode],
      authorizedPlanLevel(requesterAuthorization, targetScope),
    );
    return (
      decision.isAuthorized &&
      authorizedPlanLevel(authorization, targetScope) > requesterLevel
    );
  }

  async pendingInbox(
    userId: string,
    cursor: string | null,
  ): Promise<MakeupInboxResponse> {
    const authorization =
      await this.authorizationContext.loadAuthorizationData(userId);
    const assignments = authorization.assignments.filter(
      (a) => ROLE_LEVEL[a.roleCode] >= 2,
    );
    const scopes: Prisma.MakeupRequestWhereInput[] = assignments.map((a) => {
      if (a.scope.scopeType === "GLOBAL") return {};
      if (a.scope.scopeType === "COMPANY")
        return { project: { companyId: a.scope.scopeId } };
      if (a.scope.scopeType === "TEAM")
        return { project: { teams: { some: { id: a.scope.scopeId } } } };
      return { projectId: a.scope.scopeId };
    });
    if (scopes.length === 0) return { items: [], nextCursor: null };
    const candidates = await this.prisma.makeupRequest.findMany({
      where: {
        status: "PENDING",
        requesterUserId: { not: userId },
        OR: scopes,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 51,
      ...(cursor === null ? {} : { cursor: { id: cursor }, skip: 1 }),
    });
    const page = candidates.slice(0, 50);
    const projectIds = [...new Set(page.map((r) => r.projectId))];
    const [projects, workers, managers, histories, teams, grants] =
      await Promise.all([
        this.prisma.project.findMany({ where: { id: { in: projectIds } } }),
        this.prisma.projectWorkerMember.findMany({
          where: {
            projectId: { in: projectIds },
            workerId: {
              in: page
                .filter((r) => r.participantType === "WORKER")
                .map((r) => r.participantId),
            },
          },
          include: { worker: true },
        }),
        this.prisma.projectManagerMember.findMany({
          where: {
            projectId: { in: projectIds },
            managerId: {
              in: page
                .filter((r) => r.participantType === "MANAGER")
                .map((r) => r.participantId),
            },
          },
          include: { manager: true },
        }),
        this.prisma.projectMemberHistory.findMany({
          where: { projectId: { in: projectIds } },
          orderBy: [{ recordedAt: "desc" }, { version: "desc" }],
        }),
        this.prisma.team.findMany({
          where: { projectId: { in: projectIds } },
          select: { id: true, name: true },
        }),
        this.prisma.userRole.findMany({
          where: { userId: { in: page.map((r) => r.requesterUserId) } },
          include: { role: true },
        }),
      ]);
    const projectMap = new Map(projects.map((p) => [p.id, p]));
    const teamNames = new Map(teams.map((t) => [t.id, t.name]));
    const items: MakeupInboxItem[] = [];
    for (const row of page) {
      const member =
        row.participantType === "WORKER"
          ? workers.find(
              (m) =>
                m.projectId === row.projectId &&
                m.workerId === row.participantId,
            )
          : managers.find(
              (m) =>
                m.projectId === row.projectId &&
                m.managerId === row.participantId,
            );
      const project = projectMap.get(row.projectId);
      if (member === undefined || project === undefined)
        throw new BadRequestException({
          message: "MAKEUP_MEMBER_NOT_FOUND",
          requestId: row.id,
        });
      const state = memberStateOn(
        {
          memberId: member.id,
          teamId: "teamId" in member ? member.teamId : member.teamScopeId,
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
        },
        histories,
        toDateOnly(row.attendanceDate),
      );
      const targetScope =
        state.teamId === null
          ? createProjectTargetScope(project)
          : createTeamTargetScope(project, state.teamId);
      const requesterData = {
        permissionsByRoleCode: authorization.permissionsByRoleCode,
        assignments: grants
          .filter((g) => g.userId === row.requesterUserId)
          .map((g) => ({
            roleCode: g.role.code,
            scope: { scopeType: g.scopeType, scopeId: g.scopeId },
          })),
      };
      const decision = canApproveScopedMakeupRequest({
        approverUserId: userId,
        requesterUserId: row.requesterUserId,
        assignments: authorization.assignments,
        permissionsByRoleCode: authorization.permissionsByRoleCode,
        targetScope,
      });
      if (
        !decision.isAuthorized ||
        authorizedPlanLevel(authorization, targetScope) <=
          Math.max(
            ROLE_LEVEL[state.roleCode],
            authorizedPlanLevel(requesterData, targetScope),
          )
      )
        continue;
      const displayName =
        "worker" in member
          ? member.worker.encryptedName.startsWith("name-v1:")
            ? decryptPersonnelName(
                member.worker.encryptedName,
                this.env.PERSONNEL_ENCRYPTION_KEY,
              )
            : null
          : member.manager.name;
      items.push({
        ...createMakeupRequestResponse(row),
        displayName,
        projectName: project.name,
        teamName:
          state.teamId === null ? null : (teamNames.get(state.teamId) ?? null),
      });
    }
    return {
      items,
      nextCursor: candidates.length > 50 ? candidates[49]!.id : null,
    };
  }

  private assertRequestedOccurredAtMatchesAttendanceDate(
    requestedOccurredAt: Date,
    attendanceDate: string,
  ): void {
    const occurredDate = getChinaDateOnly(requestedOccurredAt);

    if (occurredDate !== attendanceDate) {
      throw new BadRequestException({
        attendanceDate,
        message: "MAKEUP_REQUESTED_OCCURRED_AT_DATE_MISMATCH",
        occurredDate,
        requestedOccurredAt: requestedOccurredAt.toISOString(),
      });
    }
  }
}
