import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { PersonnelTransferRequest, Prisma } from "@prisma/client";

import { API_ENV } from "../config/env.module.js";
import type { ApiEnv } from "../config/env.js";
import { PrismaService } from "../infrastructure/database/prisma.service.js";

import { membershipGrants } from "./membership-roles.js";
import { ParticipantsService } from "./participants.service.js";
import type {
  AdditionalMemberRole,
  ParticipantPageResponse,
  ReuseProjectResponse,
} from "./participants.types.js";
import { decryptPersonnelName } from "./personnel-name.js";
import type { TransferListQuery } from "./transfer-requests.parsers.js";
import type {
  TransferCandidatesQuery,
  TransferRequestPage,
  TransferRequestResponse,
  TransferRequestWrite,
  TransferStatusValue,
} from "./transfer-requests.types.js";

const maskPhone = (phone: string): string =>
  /^\d{11}$/.test(phone) ? `${phone.slice(0, 3)}****${phone.slice(7)}` : phone;

/**
 * Decision 6 (2026-11-20): a project admin who wants a person from another project of the
 * same company asks; a company admin approves (the person is added through the existing
 * reuse flow, keeping profile and WeChat binding) or rejects.
 */
@Injectable()
export class TransferRequestsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(ParticipantsService)
    private readonly participants: ParticipantsService,
  ) {}

  /** Same-company projects the actor does not manage (managed ones go through direct reuse). */
  async sources(
    projectId: string,
    actorUserId: string,
  ): Promise<readonly ReuseProjectResponse[]> {
    const target = await this.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
    });
    const managed = new Set(
      (await this.participants.reuseProjects(projectId, actorUserId)).map(
        (project) => project.id,
      ),
    );
    const projects = await this.prisma.project.findMany({
      where: { companyId: target.companyId, id: { not: projectId } },
      select: { id: true, name: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return projects.filter((project) => !managed.has(project.id));
  }

  /** People of a source project, for picking: no full phone numbers. */
  async candidates(
    projectId: string,
    actorUserId: string,
    query: TransferCandidatesQuery,
  ): Promise<ParticipantPageResponse> {
    await this.assertSource(projectId, actorUserId, query.sourceProjectId);
    const page = await this.participants.page(query.sourceProjectId, {
      page: query.page,
      pageSize: query.pageSize,
      participantType: null,
      permissionRole: null,
      search: query.search,
      status: null,
      teamId: null,
    });
    return {
      ...page,
      items: page.items.map((item) => ({ ...item, phone: maskPhone(item.phone) })),
    };
  }

  async create(
    projectId: string,
    actorUserId: string,
    body: TransferRequestWrite,
  ): Promise<TransferRequestResponse> {
    const target = await this.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
    });
    await this.assertSource(projectId, actorUserId, body.sourceProjectId);
    const source = await this.participants.get(
      body.sourceProjectId,
      body.sourceMemberId,
    );
    if (source.participantType !== body.participantType)
      throw new BadRequestException({
        message: "PARTICIPANT_TYPE_CANNOT_CHANGE",
      });
    if (
      body.teamId !== null &&
      (await this.prisma.team.count({
        where: { id: body.teamId, projectId },
      })) !== 1
    )
      throw new BadRequestException({
        message: "TEAM_DOES_NOT_BELONG_TO_PROJECT",
        projectId,
      });
    await this.participants.assertAssignableGrants(
      projectId,
      actorUserId,
      [],
      membershipGrants(
        projectId,
        body.projectRoleLabel,
        body.teamId,
        body.additionalRoles ?? [],
      ),
    );
    const created = await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`personnel-transfer:${projectId}:${source.profileId}`}, 0))`;
      const member =
        source.participantType === "WORKER"
          ? await transaction.projectWorkerMember.findUnique({
              where: {
                projectId_workerId: { projectId, workerId: source.profileId },
              },
            })
          : await transaction.projectManagerMember.findUnique({
              where: {
                projectId_managerId: { projectId, managerId: source.profileId },
              },
            });
      if (member !== null)
        throw new ConflictException({
          message: "PROJECT_MEMBER_ALREADY_EXISTS",
          memberId: member.id,
        });
      const pending = await transaction.personnelTransferRequest.findFirst({
        where: {
          participantType: source.participantType,
          profileId: source.profileId,
          status: "PENDING",
          targetProjectId: projectId,
        },
      });
      if (pending !== null)
        throw new ConflictException({
          message: "TRANSFER_REQUEST_ALREADY_PENDING",
          requestId: pending.id,
        });
      const row = await transaction.personnelTransferRequest.create({
        data: {
          additionalRoles: [...(body.additionalRoles ?? [])],
          companyId: target.companyId,
          enteredAt: new Date(body.enteredAt),
          participantType: source.participantType,
          profileId: source.profileId,
          projectRoleLabel: body.projectRoleLabel,
          requestedByUserId: actorUserId,
          requiresAttendance: body.requiresAttendance,
          sourceMemberId: source.memberId,
          sourceProjectId: body.sourceProjectId,
          status: "PENDING",
          targetProjectId: projectId,
          teamId: body.teamId,
        },
      });
      await transaction.auditLog.create({
        data: {
          action: "PERSONNEL_TRANSFER_REQUESTED",
          actorUserId,
          entityId: row.id,
          entityType: "personnel_transfer_request",
          metadata: {
            participantType: row.participantType,
            profileId: row.profileId,
            sourceProjectId: row.sourceProjectId,
          },
          projectId,
        },
      });
      return row;
    });
    return (await this.views([created]))[0]!;
  }

  async listForProject(
    projectId: string,
  ): Promise<readonly TransferRequestResponse[]> {
    return this.views(
      await this.prisma.personnelTransferRequest.findMany({
        where: { targetProjectId: projectId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 50,
      }),
    );
  }

  /** 30 per page; pending oldest first, done newest first; optional source-or-target project. */
  async listForCompany(
    companyId: string,
    query: TransferListQuery,
  ): Promise<TransferRequestPage> {
    const PAGE = 30;
    const rows = await this.prisma.personnelTransferRequest.findMany({
      where: {
        companyId,
        status:
          query.status === "PENDING"
            ? "PENDING"
            : { in: ["APPROVED", "REJECTED"] },
        ...(query.projectId === null
          ? {}
          : {
              OR: [
                { sourceProjectId: query.projectId },
                { targetProjectId: query.projectId },
              ],
            }),
      },
      orderBy:
        query.status === "PENDING"
          ? [{ createdAt: "asc" }, { id: "asc" }]
          : [{ reviewedAt: "desc" }, { id: "desc" }],
      take: PAGE + 1,
      ...(query.cursor === null
        ? {}
        : { cursor: { id: query.cursor }, skip: 1 }),
    });
    const page = rows.slice(0, PAGE);
    return {
      items: await this.views(page),
      nextCursor: rows.length > PAGE ? page[PAGE - 1]!.id : null,
    };
  }

  /** How many requests wait for this company's decision (company home). */
  async countPending(companyId: string): Promise<number> {
    return this.prisma.personnelTransferRequest.count({
      where: { companyId, status: "PENDING" },
    });
  }

  async approve(
    companyId: string,
    requestId: string,
    actorUserId: string,
    reason: string | null,
  ): Promise<TransferRequestResponse> {
    const request = await this.pendingRequest(companyId, requestId);
    const claimed = await this.prisma.personnelTransferRequest.updateMany({
      where: { id: request.id, companyId, status: "PENDING" },
      data: {
        reviewedAt: new Date(),
        reviewedByUserId: actorUserId,
        reviewReason: reason,
        status: "APPROVED",
      },
    });
    if (claimed.count !== 1)
      throw new ConflictException({
        message: "TRANSFER_REQUEST_NOT_PENDING",
        requestId,
      });
    let memberId: string;
    try {
      // Approval acts on the person as they are now, not as they were when asked.
      const source = await this.participants.get(
        request.sourceProjectId,
        request.sourceMemberId,
      );
      memberId = (
        await this.participants.reuse(request.targetProjectId, actorUserId, {
          additionalRoles: request.additionalRoles as AdditionalMemberRole[],
          enteredAt: request.enteredAt.toISOString(),
          expectedProfileUpdatedAt: source.profileUpdatedAt,
          expectedSourceUpdatedAt: source.updatedAt,
          participantType: request.participantType,
          projectRoleLabel: request.projectRoleLabel,
          requiresAttendance: request.requiresAttendance,
          sourceMemberId: request.sourceMemberId,
          sourceProjectId: request.sourceProjectId,
          teamId: request.teamId,
        })
      ).memberId;
    } catch (cause: unknown) {
      // Could not add the person: hand the request back so it can be retried or rejected.
      await this.prisma.personnelTransferRequest.updateMany({
        where: {
          id: request.id,
          status: "APPROVED",
          createdMemberId: null,
          reviewedByUserId: actorUserId,
        },
        data: {
          reviewedAt: null,
          reviewedByUserId: null,
          reviewReason: null,
          status: "PENDING",
        },
      });
      throw cause;
    }
    const approved = await this.prisma.$transaction(async (transaction) => {
      const row = await transaction.personnelTransferRequest.update({
        where: { id: request.id },
        data: { createdMemberId: memberId },
      });
      await transaction.auditLog.create({
        data: this.reviewAudit(row, actorUserId, "PERSONNEL_TRANSFER_APPROVED"),
      });
      return row;
    });
    return (await this.views([approved]))[0]!;
  }

  async reject(
    companyId: string,
    requestId: string,
    actorUserId: string,
    reason: string | null,
  ): Promise<TransferRequestResponse> {
    const request = await this.pendingRequest(companyId, requestId);
    const rejected = await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.personnelTransferRequest.updateMany({
        where: { id: request.id, companyId, status: "PENDING" },
        data: {
          reviewedAt: new Date(),
          reviewedByUserId: actorUserId,
          reviewReason: reason,
          status: "REJECTED",
        },
      });
      if (result.count !== 1)
        throw new ConflictException({
          message: "TRANSFER_REQUEST_NOT_PENDING",
          requestId,
        });
      const row = await transaction.personnelTransferRequest.findUniqueOrThrow({
        where: { id: request.id },
      });
      await transaction.auditLog.create({
        data: this.reviewAudit(row, actorUserId, "PERSONNEL_TRANSFER_REJECTED"),
      });
      return row;
    });
    return (await this.views([rejected]))[0]!;
  }

  private reviewAudit(
    row: PersonnelTransferRequest,
    actorUserId: string,
    action: string,
  ): Prisma.AuditLogUncheckedCreateInput {
    return {
      action,
      actorUserId,
      entityId: row.id,
      entityType: "personnel_transfer_request",
      metadata: {
        createdMemberId: row.createdMemberId,
        sourceProjectId: row.sourceProjectId,
      },
      projectId: row.targetProjectId,
    };
  }

  private async pendingRequest(
    companyId: string,
    requestId: string,
  ): Promise<PersonnelTransferRequest> {
    const request = await this.prisma.personnelTransferRequest.findFirst({
      where: { id: requestId, companyId },
    });
    if (request === null)
      throw new NotFoundException({
        message: "TRANSFER_REQUEST_NOT_FOUND",
        requestId,
      });
    if (request.status !== "PENDING")
      throw new ConflictException({
        message: "TRANSFER_REQUEST_NOT_PENDING",
        requestId,
      });
    return request;
  }

  private async assertSource(
    projectId: string,
    actorUserId: string,
    sourceProjectId: string,
  ): Promise<void> {
    const sources = await this.sources(projectId, actorUserId);
    if (!sources.some((project) => project.id === sourceProjectId))
      throw new ForbiddenException({
        message: "TRANSFER_SOURCE_NOT_ALLOWED",
        sourceProjectId,
      });
  }

  private decrypt(value: string | null | undefined): string | null {
    return value?.startsWith("name-v1:")
      ? decryptPersonnelName(value, this.env.PERSONNEL_ENCRYPTION_KEY)
      : null;
  }

  private async views(
    rows: readonly PersonnelTransferRequest[],
  ): Promise<TransferRequestResponse[]> {
    if (rows.length === 0) return [];
    const ids = (type: "WORKER" | "MANAGER"): string[] =>
      rows.filter((row) => row.participantType === type).map((row) => row.profileId);
    const userIds = [
      ...new Set(
        rows.flatMap((row) =>
          row.reviewedByUserId === null
            ? [row.requestedByUserId]
            : [row.requestedByUserId, row.reviewedByUserId],
        ),
      ),
    ];
    const [projects, teams, workers, managers, users] = await Promise.all([
      this.prisma.project.findMany({
        where: {
          id: {
            in: rows.flatMap((row) => [row.sourceProjectId, row.targetProjectId]),
          },
        },
        select: { id: true, name: true },
      }),
      this.prisma.team.findMany({
        where: {
          id: { in: rows.flatMap((row) => (row.teamId === null ? [] : [row.teamId])) },
        },
        select: { id: true, name: true },
      }),
      this.prisma.workerProfile.findMany({
        where: { id: { in: ids("WORKER") } },
        select: { encryptedName: true, id: true, workType: true },
      }),
      this.prisma.managerProfile.findMany({
        where: { id: { in: ids("MANAGER") } },
        select: { id: true, name: true, workType: true },
      }),
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { encryptedRealName: true, id: true, nickname: true },
      }),
    ]);
    const projectName = (id: string): string =>
      projects.find((project) => project.id === id)?.name ?? "";
    const userName = (id: string | null): string | null => {
      if (id === null) return null;
      const user = users.find((row) => row.id === id);
      return user === undefined
        ? null
        : (this.decrypt(user.encryptedRealName) ?? user.nickname ?? null);
    };
    return rows.map((row): TransferRequestResponse => {
      const worker = workers.find((profile) => profile.id === row.profileId);
      const manager = managers.find((profile) => profile.id === row.profileId);
      return {
        additionalRoles: row.additionalRoles as AdditionalMemberRole[],
        createdAt: row.createdAt.toISOString(),
        createdMemberId: row.createdMemberId,
        displayName:
          row.participantType === "WORKER"
            ? this.decrypt(worker?.encryptedName)
            : (manager?.name ?? null),
        enteredAt: row.enteredAt.toISOString(),
        id: row.id,
        participantType: row.participantType,
        projectRoleLabel: row.projectRoleLabel,
        requestedByName: userName(row.requestedByUserId),
        requiresAttendance: row.requiresAttendance,
        reviewedAt: row.reviewedAt?.toISOString() ?? null,
        reviewedByName: userName(row.reviewedByUserId),
        reviewReason: row.reviewReason,
        sourceProjectId: row.sourceProjectId,
        sourceProjectName: projectName(row.sourceProjectId),
        status: row.status as TransferStatusValue,
        targetProjectId: row.targetProjectId,
        targetProjectName: projectName(row.targetProjectId),
        teamId: row.teamId,
        teamName: teams.find((team) => team.id === row.teamId)?.name ?? null,
        workType:
          row.participantType === "WORKER"
            ? (worker?.workType ?? null)
            : (manager?.workType ?? null),
      };
    });
  }
}
