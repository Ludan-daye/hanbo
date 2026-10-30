import { workerRole } from "../attendance/member-history.js";
import { randomBytes } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { authorizePermission } from "@construction/domain/roles.js";
import type { Prisma } from "@prisma/client";

import type { AuthorizationData } from "../authorization/authorization.types.js";
import { AuthorizationContextService } from "../authorization/authorization-context.service.js";
import { API_ENV } from "../config/env.module.js";
import type { ApiEnv } from "../config/env.js";
import { PrismaService } from "../infrastructure/database/prisma.service.js";

import {
  decryptPersonnelName,
  encryptPersonnelName,
  personnelNameSearchHashes,
  personnelSearchHash,
} from "./personnel-name.js";
import {
  additionalRoleView,
  membershipGrants,
  replaceAdditionalRoles,
  synchronizeMembershipGrants,
  validateAdditionalRoles,
} from "./membership-roles.js";
import type {
  AdditionalMemberRole,
  ManagedParticipantResponse,
  ParticipantPageQuery,
  ParticipantPageResponse,
  ParticipantWriteRequest,
  ReuseParticipantRequest,
  ReuseProjectResponse,
} from "./participants.types.js";

type WorkerMember = Prisma.ProjectWorkerMemberGetPayload<{
  include: {
    worker: true;
    team: true;
    additionalRoles: { include: { team: true } };
  };
}>;
type ManagerMember = Prisma.ProjectManagerMemberGetPayload<{
  include: {
    manager: true;
    teamScope: true;
    additionalRoles: { include: { team: true } };
  };
}>;
const nextTimestamp = (previous: Date, now: Date): Date =>
  new Date(Math.max(previous.getTime() + 1, now.getTime()));

const managerRole = (
  value: string,
): "WORKER" | "PROJECT_ADMIN" | "TEAM_LEADER" => {
  if (
    value === "WORKER" ||
    value === "PROJECT_ADMIN" ||
    value === "TEAM_LEADER"
  )
    return value;
  throw new BadRequestException({ message: "INVALID_MANAGER_ROLE" });
};


@Injectable()
export class ParticipantsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(AuthorizationContextService)
    private readonly authorization: AuthorizationContextService,
  ) {}

  private workerResponse(member: WorkerMember): ManagedParticipantResponse {
    const available: boolean =
      member.worker.encryptedName.startsWith("name-v1:");
    return {
      displayName: available
        ? decryptPersonnelName(
            member.worker.encryptedName,
            this.env.PERSONNEL_ENCRYPTION_KEY,
          )
        : null,
      additionalRoles: member.additionalRoles.map(additionalRoleView),
      nameStatus: available ? "AVAILABLE" : "REQUIRES_UPDATE",
      memberId: member.id,
      participantType: "WORKER",
      phone: member.worker.phone,
      profileId: member.workerId,
      projectId: member.projectId,
      projectRoleLabel: member.projectRoleLabel,
      workType: member.worker.workType,
      requiresAttendance: member.requiresAttendance,
      status: member.status,
      teamId: member.teamId,
      teamName: member.team?.name ?? null,
      enteredAt: member.enteredAt.toISOString(),
      exitedAt: member.exitedAt?.toISOString() ?? null,
      updatedAt: member.updatedAt.toISOString(),
      profileUpdatedAt: member.worker.updatedAt.toISOString(),
    };
  }

  private managerResponse(member: ManagerMember): ManagedParticipantResponse {
    return {
      displayName: member.manager.name,
      additionalRoles: member.additionalRoles.map(additionalRoleView),
      nameStatus: "AVAILABLE",
      memberId: member.id,
      participantType: "MANAGER",
      phone: member.manager.phone,
      profileId: member.managerId,
      projectId: member.projectId,
      projectRoleLabel: member.roleCode,
      workType: member.manager.workType,
      requiresAttendance: member.requiresAttendance,
      status: member.status,
      teamId: member.teamScopeId,
      teamName: member.teamScope?.name ?? null,
      enteredAt: member.enteredAt.toISOString(),
      exitedAt: member.exitedAt?.toISOString() ?? null,
      updatedAt: member.updatedAt.toISOString(),
      profileUpdatedAt: member.manager.updatedAt.toISOString(),
    };
  }

  async get(
    projectId: string,
    memberId: string,
  ): Promise<ManagedParticipantResponse> {
    const [worker, manager] = await Promise.all([
      this.prisma.projectWorkerMember.findFirst({
        where: { id: memberId, projectId },
        include: {
          worker: true,
          team: true,
          additionalRoles: { include: { team: true } },
        },
      }),
      this.prisma.projectManagerMember.findFirst({
        where: { id: memberId, projectId },
        include: {
          manager: true,
          teamScope: true,
          additionalRoles: { include: { team: true } },
        },
      }),
    ]);
    if (worker !== null && manager !== null)
      throw new ConflictException({
        message: "AMBIGUOUS_PROJECT_MEMBER_ID",
        memberId,
      });
    if (worker !== null) return this.workerResponse(worker);
    if (manager !== null) return this.managerResponse(manager);
    throw new NotFoundException({
      message: "PROJECT_MEMBER_NOT_FOUND",
      projectId,
      memberId,
    });
  }

  async page(
    projectId: string,
    query: ParticipantPageQuery,
  ): Promise<ParticipantPageResponse> {
    const search: string = query.search;
    const workerWhere: Prisma.ProjectWorkerMemberWhereInput = {
      projectId,
      AND: [
        ...(query.permissionRole === null
          ? []
          : [
              {
                OR: [
                  query.permissionRole === "WORKER"
                    ? {
                        projectRoleLabel: {
                          notIn: ["TEAM_LEADER", "PROJECT_ADMIN"],
                        },
                      }
                    : { projectRoleLabel: query.permissionRole },
                  {
                    additionalRoles: {
                      some: { roleCode: query.permissionRole },
                    },
                  },
                ],
              },
            ]),
        ...(query.teamId === null
          ? []
          : [
              {
                OR: [
                  { teamId: query.teamId },
                  { additionalRoles: { some: { teamId: query.teamId } } },
                ],
              },
            ]),
      ],
      ...(query.status === null ? {} : { status: query.status }),
      ...(search.length === 0
        ? {}
        : {
            OR: [
              { worker: { phone: { contains: search } } },
              {
                worker: { workType: { contains: search, mode: "insensitive" } },
              },
              {
                worker: {
                  nameSearchHashes: {
                    has: personnelSearchHash(
                      search,
                      this.env.PERSONNEL_ENCRYPTION_KEY,
                    ),
                  },
                },
              },
              { projectRoleLabel: { contains: search, mode: "insensitive" } },
              { team: { name: { contains: search, mode: "insensitive" } } },
            ],
          }),
    };
    const managerWhere: Prisma.ProjectManagerMemberWhereInput = {
      projectId,
      AND: [
        ...(query.permissionRole === null
          ? []
          : [
              {
                OR: [
                  { roleCode: query.permissionRole },
                  {
                    additionalRoles: {
                      some: { roleCode: query.permissionRole },
                    },
                  },
                ],
              },
            ]),
        ...(query.teamId === null
          ? []
          : [
              {
                OR: [
                  { teamScopeId: query.teamId },
                  { additionalRoles: { some: { teamId: query.teamId } } },
                ],
              },
            ]),
      ],
      ...(query.status === null ? {} : { status: query.status }),
      ...(search.length === 0
        ? {}
        : {
            OR: [
              { manager: { phone: { contains: search } } },
              {
                manager: { name: { startsWith: search, mode: "insensitive" } },
              },
              {
                manager: {
                  workType: { contains: search, mode: "insensitive" },
                },
              },
              {
                teamScope: { name: { contains: search, mode: "insensitive" } },
              },
            ],
          }),
    };
    const [workerCount, managerCount] = await Promise.all([
      query.participantType === "MANAGER"
        ? Promise.resolve(0)
        : this.prisma.projectWorkerMember.count({ where: workerWhere }),
      query.participantType === "WORKER"
        ? Promise.resolve(0)
        : this.prisma.projectManagerMember.count({ where: managerWhere }),
    ]);
    const offset: number = (query.page - 1) * query.pageSize;
    const workerTake: number = Math.max(
      0,
      Math.min(query.pageSize, workerCount - offset),
    );
    const managerTake: number = Math.max(
      0,
      Math.min(
        query.pageSize - workerTake,
        managerCount - Math.max(0, offset - workerCount),
      ),
    );
    const [workers, managers] = await Promise.all([
      workerTake === 0
        ? Promise.resolve([] as WorkerMember[])
        : this.prisma.projectWorkerMember.findMany({
            where: workerWhere,
            include: {
              worker: true,
              team: true,
              additionalRoles: { include: { team: true } },
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            skip: offset,
            take: workerTake,
          }),
      managerTake === 0
        ? Promise.resolve([] as ManagerMember[])
        : this.prisma.projectManagerMember.findMany({
            where: managerWhere,
            include: {
              manager: true,
              teamScope: true,
              additionalRoles: { include: { team: true } },
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            skip: Math.max(0, offset - workerCount),
            take: managerTake,
          }),
    ]);
    return {
      page: query.page,
      pageSize: query.pageSize,
      total: workerCount + managerCount,
      items: [
        ...workers.map(
          (member): ManagedParticipantResponse => this.workerResponse(member),
        ),
        ...managers.map(
          (member): ManagedParticipantResponse => this.managerResponse(member),
        ),
      ],
    };
  }

  private async validateTeam(
    transaction: Prisma.TransactionClient,
    projectId: string,
    teamId: string | null,
  ): Promise<void> {
    if (teamId === null) return;
    if (
      (await transaction.team.findFirst({
        where: { id: teamId, projectId },
      })) === null
    ) {
      throw new BadRequestException({
        message: "TEAM_DOES_NOT_BELONG_TO_PROJECT",
        projectId,
        teamId,
      });
    }
  }

  private async checkPhone(
    transaction: Prisma.TransactionClient,
    projectId: string,
    phone: string,
    memberId: string | null,
  ): Promise<void> {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`member-phone:${phone}`}, 0))`;
    const [worker, manager] = await Promise.all([
      transaction.projectWorkerMember.findFirst({
        where: {
          projectId,
          worker: { phone },
          ...(memberId === null ? {} : { id: { not: memberId } }),
        },
        select: { id: true },
      }),
      transaction.projectManagerMember.findFirst({
        where: {
          projectId,
          manager: { phone },
          ...(memberId === null ? {} : { id: { not: memberId } }),
        },
        select: { id: true },
      }),
    ]);
    if (worker !== null || manager !== null)
      throw new ConflictException({
        message: "PROJECT_MEMBER_PHONE_ALREADY_EXISTS",
        projectId,
      });
  }

  async create(
    projectId: string,
    actorUserId: string,
    body: ParticipantWriteRequest,
  ): Promise<ManagedParticipantResponse> {
    if (
      body.expectedUpdatedAt !== null ||
      body.expectedProfileUpdatedAt !== null
    )
      throw new BadRequestException({
        message: "NEW_MEMBER_MUST_NOT_INCLUDE_VERSION",
      });
    const memberId: string = await this.prisma.$transaction(
      async (transaction): Promise<string> => {
        await this.validateTeam(transaction, projectId, body.teamId);
        await this.checkPhone(transaction, projectId, body.phone, null);
        let createdId: string;
        if (body.participantType === "WORKER") {
          const worker = await transaction.workerProfile.create({
            data: {
              encryptedName: encryptPersonnelName(
                body.displayName,
                this.env.PERSONNEL_ENCRYPTION_KEY,
                randomBytes(12),
              ),
              nameSearchHashes: [
                ...personnelNameSearchHashes(
                  body.displayName,
                  this.env.PERSONNEL_ENCRYPTION_KEY,
                ),
              ],
              phone: body.phone,
              workType: body.workType,
              realNameStatus: "PENDING",
              faceProfileStatus: "PENDING",
              employmentStatus: "ACTIVE",
            },
          });
          const member = await transaction.projectWorkerMember.create({
            data: {
              workerId: worker.id,
              projectId,
              teamId: body.teamId,
              projectRoleLabel: body.projectRoleLabel,
              requiresAttendance: body.requiresAttendance,
              status: body.status,
              enteredAt: new Date(body.enteredAt),
              exitedAt: body.exitedAt === null ? null : new Date(body.exitedAt),
            },
          });
          createdId = member.id;
        } else {
          const manager = await transaction.managerProfile.create({
            data: {
              name: body.displayName,
              phone: body.phone,
              workType: body.workType,
              status: "ACTIVE",
            },
          });
          const member = await transaction.projectManagerMember.create({
            data: {
              managerId: manager.id,
              projectId,
              teamScopeId: body.teamId,
              roleCode: managerRole(body.projectRoleLabel),
              requiresAttendance: body.requiresAttendance,
              status: body.status,
              enteredAt: new Date(body.enteredAt),
              exitedAt: body.exitedAt === null ? null : new Date(body.exitedAt),
            },
          });
          createdId = member.id;
        }
        await validateAdditionalRoles(
          transaction,
          projectId,
          body.projectRoleLabel,
          body.teamId,
          body.additionalRoles ?? [],
        );
        await replaceAdditionalRoles(
          transaction,
          projectId,
          createdId,
          body.participantType,
          body.additionalRoles ?? [],
        );
        await transaction.auditLog.create({
          data: {
            actorUserId,
            action: "project.member.create",
            entityType: "project_member",
            entityId: createdId,
            metadata: {
              projectId,
              participantType: body.participantType,
              additionalRoles: [...(body.additionalRoles ?? [])],
            },
          },
        });
        return createdId;
      },
    );
    return this.get(projectId, memberId);
  }

  async reuseProjects(
    projectId: string,
    actorUserId: string,
  ): Promise<readonly ReuseProjectResponse[]> {
    const target = await this.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
    });
    const authorization =
      await this.authorization.loadAuthorizationData(actorUserId);
    const projects = await this.prisma.project.findMany({
      where: { companyId: target.companyId, id: { not: projectId } },
      select: { id: true, name: true, companyId: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return projects
      .filter(
        (project): boolean =>
          authorizePermission({
            ...authorization,
            requiredPermissionCode: "project.manage",
            targetScope: {
              scopeType: "PROJECT",
              scopeId: project.id,
              projectId: project.id,
              companyId: project.companyId,
            },
          }).isAuthorized,
      )
      .map(
        (project): ReuseProjectResponse => ({
          id: project.id,
          name: project.name,
        }),
      );
  }

  async reuse(
    projectId: string,
    actorUserId: string,
    body: ReuseParticipantRequest,
  ): Promise<ManagedParticipantResponse> {
    const sources = await this.reuseProjects(projectId, actorUserId);
    if (
      !sources.some((project): boolean => project.id === body.sourceProjectId)
    )
      throw new ForbiddenException({
        message: "PERSONNEL_REUSE_SOURCE_NOT_ALLOWED",
      });
    const source = await this.get(body.sourceProjectId, body.sourceMemberId);
    if (source.participantType !== body.participantType)
      throw new BadRequestException({
        message: "PARTICIPANT_TYPE_CANNOT_CHANGE",
      });
    const memberId = await this.prisma.$transaction(
      async (transaction): Promise<string> => {
        await this.validateTeam(transaction, projectId, body.teamId);
        await this.checkPhone(transaction, projectId, source.phone, null);
        let createdId: string;
        let userId: string | null;
        if (source.participantType === "WORKER") {
          await transaction.$queryRaw`SELECT "id" FROM "worker_profiles" WHERE "id" = ${source.profileId} FOR SHARE`;
          await transaction.$queryRaw`SELECT "id" FROM "project_worker_members" WHERE "id" = ${source.memberId} FOR SHARE`;
          const current =
            await transaction.projectWorkerMember.findUniqueOrThrow({
              where: { id: source.memberId },
              include: { worker: true },
            });
          if (
            current.updatedAt.toISOString() !== body.expectedSourceUpdatedAt ||
            current.worker.updatedAt.toISOString() !==
              body.expectedProfileUpdatedAt
          )
            throw new ConflictException({
              message: "MEMBER_CHANGED_RELOAD_BEFORE_SAVING",
            });
          if (current.worker.employmentStatus !== "ACTIVE")
            throw new ConflictException({
              message: "REUSE_PROFILE_NOT_ACTIVE",
            });
          const existing = await transaction.projectWorkerMember.findUnique({
            where: {
              projectId_workerId: { projectId, workerId: source.profileId },
            },
          });
          if (existing !== null)
            throw new ConflictException({
              message: "PROJECT_MEMBER_ALREADY_EXISTS",
              memberId: existing.id,
            });
          const created = await transaction.projectWorkerMember.create({
            data: {
              projectId,
              workerId: source.profileId,
              teamId: body.teamId,
              projectRoleLabel: body.projectRoleLabel,
              requiresAttendance: body.requiresAttendance,
              enteredAt: new Date(body.enteredAt),
              status: "ACTIVE",
            },
          });
          createdId = created.id;
          userId = current.worker.userId;
        } else {
          await transaction.$queryRaw`SELECT "id" FROM "manager_profiles" WHERE "id" = ${source.profileId} FOR SHARE`;
          await transaction.$queryRaw`SELECT "id" FROM "project_manager_members" WHERE "id" = ${source.memberId} FOR SHARE`;
          const current =
            await transaction.projectManagerMember.findUniqueOrThrow({
              where: { id: source.memberId },
              include: { manager: true },
            });
          if (
            current.updatedAt.toISOString() !== body.expectedSourceUpdatedAt ||
            current.manager.updatedAt.toISOString() !==
              body.expectedProfileUpdatedAt
          )
            throw new ConflictException({
              message: "MEMBER_CHANGED_RELOAD_BEFORE_SAVING",
            });
          if (current.manager.status !== "ACTIVE")
            throw new ConflictException({
              message: "REUSE_PROFILE_NOT_ACTIVE",
            });
          const existing = await transaction.projectManagerMember.findUnique({
            where: {
              projectId_managerId: { projectId, managerId: source.profileId },
            },
          });
          if (existing !== null)
            throw new ConflictException({
              message: "PROJECT_MEMBER_ALREADY_EXISTS",
              memberId: existing.id,
            });
          const created = await transaction.projectManagerMember.create({
            data: {
              projectId,
              managerId: source.profileId,
              teamScopeId: body.teamId,
              roleCode: managerRole(body.projectRoleLabel),
              requiresAttendance: body.requiresAttendance,
              enteredAt: new Date(body.enteredAt),
              status: "ACTIVE",
            },
          });
          createdId = created.id;
          userId = current.manager.userId;
        }
        const additionalRoles = body.additionalRoles ?? [];
        await validateAdditionalRoles(
          transaction,
          projectId,
          body.projectRoleLabel,
          body.teamId,
          additionalRoles,
        );
        await replaceAdditionalRoles(
          transaction,
          projectId,
          createdId,
          body.participantType,
          additionalRoles,
        );
        await synchronizeMembershipGrants(
          transaction,
          userId,
          [],
          membershipGrants(
            projectId,
            body.projectRoleLabel,
            body.teamId,
            additionalRoles,
          ),
        );
        await transaction.auditLog.create({
          data: {
            actorUserId,
            action: "project.member.reuse",
            entityType: "project_member",
            entityId: createdId,
            metadata: {
              projectId,
              sourceProjectId: source.projectId,
              sourceMemberId: source.memberId,
              participantType: source.participantType,
              profileId: source.profileId,
            },
          },
        });
        return createdId;
      },
    );
    return this.get(projectId, memberId);
  }

  private assertProfileWriteScope(
    authorization: AuthorizationData,
    projects: readonly { readonly id: string; readonly companyId: string }[],
  ): void {
    for (const project of projects) {
      const decision = authorizePermission({
        ...authorization,
        requiredPermissionCode: "project.manage",
        targetScope: {
          scopeType: "PROJECT",
          scopeId: project.id,
          projectId: project.id,
          companyId: project.companyId,
        },
      });
      if (!decision.isAuthorized)
        throw new ForbiddenException({
          message: "SHARED_PROFILE_REQUIRES_ALL_PROJECT_PERMISSIONS",
        });
    }
  }

  async update(
    projectId: string,
    memberId: string,
    actorUserId: string,
    body: ParticipantWriteRequest,
  ): Promise<ManagedParticipantResponse> {
    const previous: ManagedParticipantResponse = await this.get(
      projectId,
      memberId,
    );
    if (previous.participantType !== body.participantType)
      throw new BadRequestException({
        message: "PARTICIPANT_TYPE_CANNOT_CHANGE",
      });
    if (
      previous.updatedAt !== body.expectedUpdatedAt ||
      previous.profileUpdatedAt !== body.expectedProfileUpdatedAt
    )
      throw new ConflictException({
        message: "MEMBER_CHANGED_RELOAD_BEFORE_SAVING",
      });
    const authorization: AuthorizationData =
      await this.authorization.loadAuthorizationData(actorUserId);
    await this.prisma.$transaction(async (transaction): Promise<void> => {
      await this.validateTeam(transaction, projectId, body.teamId);
      await this.checkPhone(transaction, projectId, body.phone, memberId);
      // Serialize profile edits, binding and reuse before inspecting shared memberships.
      const profiles: readonly {
        readonly updatedAt: Date;
        readonly userId: string | null;
      }[] =
        body.participantType === "WORKER"
          ? await transaction.$queryRaw`SELECT "updatedAt", "userId" FROM "worker_profiles" WHERE "id" = ${previous.profileId} FOR UPDATE`
          : await transaction.$queryRaw`SELECT "updatedAt", "userId" FROM "manager_profiles" WHERE "id" = ${previous.profileId} FOR UPDATE`;
      if (profiles[0]?.updatedAt.toISOString() !== previous.profileUpdatedAt)
        throw new ConflictException({
          message: "MEMBER_CHANGED_RELOAD_BEFORE_SAVING",
        });
      if (body.participantType === "WORKER") {
        await this.updateWorker(
          transaction,
          projectId,
          memberId,
          actorUserId,
          previous,
          body,
          authorization,
        );
      } else {
        await this.updateManager(
          transaction,
          projectId,
          memberId,
          actorUserId,
          previous,
          body,
          authorization,
        );
      }
      const additionalRoles: readonly AdditionalMemberRole[] =
        body.additionalRoles ??
        previous.additionalRoles.map(({ roleCode, teamId }) => ({
          roleCode,
          teamId,
        }));
      const oldGrants = membershipGrants(
        projectId,
        previous.projectRoleLabel,
        previous.teamId,
        previous.additionalRoles,
      );
      const nextGrants = membershipGrants(
        projectId,
        body.projectRoleLabel,
        body.teamId,
        additionalRoles,
      );
      const grantsChanged =
        oldGrants.length !== nextGrants.length ||
        oldGrants.some(
          (old) =>
            !nextGrants.some(
              (next) =>
                old.roleCode === next.roleCode && old.scopeId === next.scopeId,
            ),
        );
      if (profiles[0]!.userId === actorUserId && grantsChanged)
        throw new ConflictException({
          message: "CANNOT_CHANGE_OWN_MANAGEMENT_ASSIGNMENT",
        });
      await validateAdditionalRoles(
        transaction,
        projectId,
        body.projectRoleLabel,
        body.teamId,
        additionalRoles,
      );
      await replaceAdditionalRoles(
        transaction,
        projectId,
        memberId,
        body.participantType,
        additionalRoles,
      );
      await synchronizeMembershipGrants(
        transaction,
        profiles[0]!.userId,
        oldGrants,
        body.status === "ACTIVE" ? nextGrants : [],
      );
      {
        const eligibleTeams = [
          body.teamId,
          ...additionalRoles.map((role) => role.teamId),
        ].filter((id): id is string => id !== null);
        const leader =
          body.participantType === "WORKER"
            ? { leaderWorkerMemberId: memberId }
            : { leaderManagerMemberId: memberId };
        const cleared = await transaction.team.findMany({
          where: {
            projectId,
            ...leader,
            ...(body.status === "ACTIVE"
              ? { id: { notIn: eligibleTeams } }
              : {}),
          },
          select: { id: true },
        });
        for (const team of cleared)
          await transaction.$executeRaw`UPDATE "teams" SET "leaderWorkerMemberId" = NULL, "leaderManagerMemberId" = NULL, "updatedAt" = GREATEST(CURRENT_TIMESTAMP, "updatedAt" + interval '1 millisecond') WHERE "id" = ${team.id}`;
        for (const team of cleared)
          await transaction.auditLog.create({
            data: {
              actorUserId,
              action: "team.leader.cleared",
              entityType: "team",
              entityId: team.id,
              metadata: {
                projectId,
                memberId,
                reason:
                  body.status !== "ACTIVE"
                    ? "MEMBER_INACTIVE"
                    : "MEMBER_TRANSFERRED",
              },
            },
          });
      }
      await transaction.auditLog.create({
        data: {
          actorUserId,
          action: "project.member.update",
          entityType: "project_member",
          entityId: memberId,
          metadata: {
            projectId,
            identityChanged:
              previous.displayName !== body.displayName ||
              previous.phone !== body.phone,
            previousAdditionalRoles: previous.additionalRoles.map(
              ({ roleCode, teamId }) => ({ roleCode, teamId }),
            ),
            additionalRoles: [...additionalRoles],
            previousStatus: previous.status,
            status: body.status,
            previousTeamId: previous.teamId,
            teamId: body.teamId,
          },
        },
      });
    });
    return this.get(projectId, memberId);
  }

  private async updateWorker(
    transaction: Prisma.TransactionClient,
    projectId: string,
    memberId: string,
    actorUserId: string,
    previous: ManagedParticipantResponse,
    body: ParticipantWriteRequest,
    authorization: AuthorizationData,
  ): Promise<void> {
    const profileChanged: boolean =
      previous.displayName !== body.displayName ||
      previous.phone !== body.phone ||
      previous.workType !== body.workType;
    if (profileChanged) {
      const memberships = await transaction.projectWorkerMember.findMany({
        where: { workerId: previous.profileId },
        include: { project: true },
      });
      this.assertProfileWriteScope(
        authorization,
        memberships.map((member) => member.project),
      );
      for (const membership of memberships)
        await this.checkPhone(
          transaction,
          membership.projectId,
          body.phone,
          membership.id,
        );
      const profileUpdate = await transaction.workerProfile.updateMany({
        where: {
          id: previous.profileId,
          updatedAt: new Date(previous.profileUpdatedAt),
        },
        data: {
          encryptedName: encryptPersonnelName(
            body.displayName,
            this.env.PERSONNEL_ENCRYPTION_KEY,
            randomBytes(12),
          ),
          nameSearchHashes: [
            ...personnelNameSearchHashes(
              body.displayName,
              this.env.PERSONNEL_ENCRYPTION_KEY,
            ),
          ],
          phone: body.phone,
          workType: body.workType,
          updatedAt: nextTimestamp(
            new Date(previous.profileUpdatedAt),
            new Date(),
          ),
        },
      });
      if (profileUpdate.count !== 1)
        throw new ConflictException({
          message: "MEMBER_CHANGED_RELOAD_BEFORE_SAVING",
        });
    }
    const memberUpdate = await transaction.projectWorkerMember.updateMany({
      where: {
        id: memberId,
        projectId,
        updatedAt: new Date(previous.updatedAt),
      },
      data: {
        teamId: body.teamId,
        projectRoleLabel: body.projectRoleLabel,
        status: body.status,
        requiresAttendance: body.requiresAttendance,
        enteredAt: new Date(body.enteredAt),
        exitedAt: body.exitedAt === null ? null : new Date(body.exitedAt),
        updatedAt: nextTimestamp(new Date(previous.updatedAt), new Date()),
      },
    });
    if (memberUpdate.count !== 1)
      throw new ConflictException({
        message: "MEMBER_CHANGED_RELOAD_BEFORE_SAVING",
      });
    const worker = await transaction.workerProfile.findUniqueOrThrow({
      where: { id: previous.profileId },
      select: { userId: true },
    });
    const oldRole = workerRole(previous.projectRoleLabel);
    const nextRole = workerRole(body.projectRoleLabel);
    if (
      worker.userId === actorUserId &&
      (oldRole !== nextRole ||
        body.teamId !== previous.teamId ||
        body.status !== previous.status)
    )
      throw new ConflictException({
        message: "CANNOT_CHANGE_OWN_MANAGEMENT_ASSIGNMENT",
      });
    if (profileChanged)
      await this.synchronizeAccountIdentity(transaction, worker.userId, body);
  }

  private async synchronizeAccountIdentity(
    transaction: Prisma.TransactionClient,
    userId: string | null,
    body: ParticipantWriteRequest,
  ): Promise<void> {
    if (userId === null) return;
    await transaction.user.update({
      where: { id: userId },
      data: {
        phone: body.phone,
        encryptedRealName: encryptPersonnelName(
          body.displayName,
          this.env.PERSONNEL_ENCRYPTION_KEY,
          randomBytes(12),
        ),
      },
    });
  }

  private async updateManager(
    transaction: Prisma.TransactionClient,
    projectId: string,
    memberId: string,
    actorUserId: string,
    previous: ManagedParticipantResponse,
    body: ParticipantWriteRequest,
    authorization: AuthorizationData,
  ): Promise<void> {
    const manager = await transaction.managerProfile.findUniqueOrThrow({
      where: { id: previous.profileId },
      select: { userId: true },
    });
    if (
      manager.userId === actorUserId &&
      (body.status !== previous.status ||
        body.projectRoleLabel !== previous.projectRoleLabel ||
        body.teamId !== previous.teamId)
    ) {
      throw new ConflictException({
        message: "CANNOT_CHANGE_OWN_MANAGEMENT_ASSIGNMENT",
      });
    }
    if (
      previous.displayName !== body.displayName ||
      previous.phone !== body.phone ||
      previous.workType !== body.workType
    ) {
      const memberships = await transaction.projectManagerMember.findMany({
        where: { managerId: previous.profileId },
        include: { project: true },
      });
      this.assertProfileWriteScope(
        authorization,
        memberships.map((member) => member.project),
      );
      for (const membership of memberships)
        await this.checkPhone(
          transaction,
          membership.projectId,
          body.phone,
          membership.id,
        );
      const profileUpdate = await transaction.managerProfile.updateMany({
        where: {
          id: previous.profileId,
          updatedAt: new Date(previous.profileUpdatedAt),
        },
        data: {
          name: body.displayName,
          phone: body.phone,
          workType: body.workType,
          updatedAt: nextTimestamp(
            new Date(previous.profileUpdatedAt),
            new Date(),
          ),
        },
      });
      if (profileUpdate.count !== 1)
        throw new ConflictException({
          message: "MEMBER_CHANGED_RELOAD_BEFORE_SAVING",
        });
    }
    const memberUpdate = await transaction.projectManagerMember.updateMany({
      where: {
        id: memberId,
        projectId,
        updatedAt: new Date(previous.updatedAt),
      },
      data: {
        teamScopeId: body.teamId,
        roleCode: managerRole(body.projectRoleLabel),
        status: body.status,
        requiresAttendance: body.requiresAttendance,
        enteredAt: new Date(body.enteredAt),
        exitedAt: body.exitedAt === null ? null : new Date(body.exitedAt),
        updatedAt: nextTimestamp(new Date(previous.updatedAt), new Date()),
      },
    });
    if (memberUpdate.count !== 1)
      throw new ConflictException({
        message: "MEMBER_CHANGED_RELOAD_BEFORE_SAVING",
      });
    if (
      previous.displayName !== body.displayName ||
      previous.phone !== body.phone
    )
      await this.synchronizeAccountIdentity(transaction, manager.userId, body);
  }
}
