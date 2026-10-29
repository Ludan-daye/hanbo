import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { API_ENV } from "../config/env.module.js";
import type { ApiEnv } from "../config/env.js";
import { PrismaService } from "../infrastructure/database/prisma.service.js";
import { decryptPersonnelName } from "./personnel-name.js";
import type { ManagedTeamResponse, TeamWriteRequest } from "./teams.types.js";

const teamRelations = {
  leaderWorkerMember: { include: { worker: true } },
  leaderManagerMember: { include: { manager: true } },
  _count: {
    select: {
      workers: { where: { status: "ACTIVE" } },
      managerScopedMembers: { where: { status: "ACTIVE" } },
    },
  },
} satisfies Prisma.TeamInclude;
type TeamWithLeader = Prisma.TeamGetPayload<{ include: typeof teamRelations }>;

@Injectable()
export class TeamsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  private response(team: TeamWithLeader): ManagedTeamResponse {
    const worker = team.leaderWorkerMember;
    const manager = team.leaderManagerMember;
    return {
      id: team.id,
      projectId: team.projectId,
      name: team.name,
      status: team.status,
      workType: team.workType,
      remark: team.remark,
      updatedAt: team.updatedAt.toISOString(),
      memberCount: team._count.workers + team._count.managerScopedMembers,
      leader:
        worker !== null
          ? {
              memberId: worker.id,
              participantType: "WORKER",
              phone: worker.worker.phone,
              displayName: worker.worker.encryptedName.startsWith("name-v1:")
                ? decryptPersonnelName(
                    worker.worker.encryptedName,
                    this.env.PERSONNEL_ENCRYPTION_KEY,
                  )
                : null,
            }
          : manager !== null
            ? {
                memberId: manager.id,
                participantType: "MANAGER",
                displayName: manager.manager.name,
                phone: manager.manager.phone,
              }
            : null,
    };
  }

  async list(projectId: string): Promise<readonly ManagedTeamResponse[]> {
    const teams = await this.prisma.team.findMany({
      where: { projectId },
      include: teamRelations,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return teams.map((team): ManagedTeamResponse => this.response(team));
  }

  async get(projectId: string, teamId: string): Promise<ManagedTeamResponse> {
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, projectId },
      include: teamRelations,
    });
    if (team === null)
      throw new NotFoundException({
        message: "PROJECT_TEAM_NOT_FOUND",
        projectId,
        teamId,
      });
    return this.response(team);
  }

  async update(
    projectId: string,
    teamId: string,
    actorUserId: string,
    body: TeamWriteRequest,
  ): Promise<ManagedTeamResponse> {
    try {
      await this.prisma.$transaction(async (transaction): Promise<void> => {
        if (body.leader !== null) {
          if (body.leader.participantType === "WORKER") {
            await transaction.$queryRaw`SELECT "id" FROM "project_worker_members" WHERE "id" = ${body.leader.memberId} AND "projectId" = ${projectId} FOR SHARE`;
            const member = await transaction.projectWorkerMember.findFirst({
              where: {
                id: body.leader.memberId,
                projectId,
                teamId,
                status: "ACTIVE",
              },
            });
            if (member === null)
              throw new BadRequestException({
                message: "TEAM_LEADER_MUST_BE_ACTIVE_TEAM_MEMBER",
                teamId,
              });
          } else {
            await transaction.$queryRaw`SELECT "id" FROM "project_manager_members" WHERE "id" = ${body.leader.memberId} AND "projectId" = ${projectId} FOR SHARE`;
            const member = await transaction.projectManagerMember.findFirst({
              where: {
                id: body.leader.memberId,
                projectId,
                teamScopeId: teamId,
                status: "ACTIVE",
              },
            });
            if (member === null)
              throw new BadRequestException({
                message: "TEAM_LEADER_MUST_BE_ACTIVE_TEAM_MEMBER",
                teamId,
              });
          }
        }
        const previous = await transaction.team.findFirst({
          where: { id: teamId, projectId },
        });
        if (previous === null)
          throw new NotFoundException({
            message: "PROJECT_TEAM_NOT_FOUND",
            teamId,
          });
        const updated = await transaction.team.updateMany({
          where: {
            id: teamId,
            projectId,
            updatedAt: new Date(body.expectedUpdatedAt),
          },
          data: {
            name: body.name,
            workType: body.workType,
            remark: body.remark,
            status: body.status,
            leaderWorkerMemberId:
              body.leader?.participantType === "WORKER"
                ? body.leader.memberId
                : null,
            leaderManagerMemberId:
              body.leader?.participantType === "MANAGER"
                ? body.leader.memberId
                : null,
            updatedAt: new Date(
              Math.max(Date.now(), previous.updatedAt.getTime() + 1),
            ),
          },
        });
        if (updated.count !== 1)
          throw new ConflictException({
            message: "TEAM_CHANGED_RELOAD_BEFORE_SAVING",
            teamId,
          });
        await transaction.auditLog.create({
          data: {
            actorUserId,
            action: "team.update",
            entityType: "team",
            entityId: teamId,
            metadata: {
              projectId,
              previousLeaderWorkerMemberId: previous.leaderWorkerMemberId,
              previousLeaderManagerMemberId: previous.leaderManagerMemberId,
              leader: body.leader,
              previousStatus: previous.status,
              status: body.status,
            },
          },
        });
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new ConflictException({
          message: "PROJECT_TEAM_NAME_ALREADY_EXISTS",
          projectId,
        });
      throw error;
    }
    return this.get(projectId, teamId);
  }
}
