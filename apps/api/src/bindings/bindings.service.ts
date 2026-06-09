import { randomBytes } from "node:crypto";

import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type {
  BindingInvitation,
  ManagerProfile,
  Project,
  ProjectManagerMember,
  ProjectWorkerMember,
  WorkerProfile
} from "@prisma/client";

import { hashSensitiveToken } from "../auth/auth.service.js";
import { PrismaService } from "../infrastructure/database/prisma.service.js";

import type {
  BindingInvitationResponse,
  CreateBindingInvitationRequest
} from "./bindings.types.js";

type WorkerMemberWithProfile = ProjectWorkerMember & {
  readonly worker: WorkerProfile;
};

type ManagerMemberWithProfile = ProjectManagerMember & {
  readonly manager: ManagerProfile;
};

type BindingTarget = {
  readonly managerProfileId: string | null;
  readonly profileId: string;
  readonly targetType: "MANAGER" | "WORKER";
  readonly workerProfileId: string | null;
};

const invitationLifetimeMs = 7 * 24 * 60 * 60 * 1000;

const createInvitationCode = (): string => randomBytes(24).toString("base64url");

const getInvitationExpiration = (now: Date): Date => new Date(now.getTime() + invitationLifetimeMs);

const createBindingInvitationResponse = (
  projectId: string,
  code: string,
  invitation: BindingInvitation,
  profileId: string
): BindingInvitationResponse => ({
  code,
  expiresAt: invitation.expiresAt.toISOString(),
  id: invitation.id,
  profileId,
  projectId,
  targetType: invitation.targetType
});

const assertActiveMember = (status: string, profileId: string, projectId: string): void => {
  if (status !== "ACTIVE") {
    throw new BadRequestException({
      message: "BINDING_TARGET_MEMBER_NOT_ACTIVE",
      profileId,
      projectId,
      status
    });
  }
};

const assertUnboundProfile = (userId: string | null, profileId: string): void => {
  if (userId !== null) {
    throw new ConflictException({
      message: "BINDING_TARGET_PROFILE_ALREADY_BOUND",
      profileId
    });
  }
};

@Injectable()
export class BindingsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async createProjectInvitation(
    projectId: string,
    actorUserId: string,
    request: CreateBindingInvitationRequest
  ): Promise<BindingInvitationResponse> {
    await this.getProjectOrThrow(projectId);
    const target =
      request.targetType === "WORKER"
        ? await this.getWorkerBindingTarget(projectId, request.profileId)
        : await this.getManagerBindingTarget(projectId, request.profileId);
    const code = createInvitationCode();
    const now = new Date();
    const expiresAt = getInvitationExpiration(now);

    const invitation = await this.prisma.$transaction(async (transaction): Promise<BindingInvitation> => {
      const created = await transaction.bindingInvitation.create({
        data: {
          acceptedByUserId: null,
          codeHash: hashSensitiveToken(code),
          createdByUserId: actorUserId,
          expiresAt,
          managerProfileId: target.managerProfileId,
          status: "PENDING",
          targetType: target.targetType,
          usedAt: null,
          workerProfileId: target.workerProfileId
        }
      });

      await transaction.auditLog.create({
        data: {
          action: "binding.invitation.create",
          actorUserId,
          entityId: created.id,
          entityType: "binding_invitation",
          metadata: {
            profileId: target.profileId,
            projectId,
            targetType: target.targetType
          }
        }
      });

      return created;
    });

    return createBindingInvitationResponse(projectId, code, invitation, target.profileId);
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

  private async getWorkerBindingTarget(projectId: string, profileId: string): Promise<BindingTarget> {
    const member = await this.prisma.projectWorkerMember.findUnique({
      include: {
        worker: true
      },
      where: {
        projectId_workerId: {
          projectId,
          workerId: profileId
        }
      }
    });

    if (member === null) {
      throw new NotFoundException({
        message: "BINDING_TARGET_PROJECT_WORKER_NOT_FOUND",
        profileId,
        projectId
      });
    }

    return this.createWorkerBindingTarget(member);
  }

  private createWorkerBindingTarget(member: WorkerMemberWithProfile): BindingTarget {
    assertActiveMember(member.status, member.workerId, member.projectId);
    assertUnboundProfile(member.worker.userId, member.workerId);

    return {
      managerProfileId: null,
      profileId: member.workerId,
      targetType: "WORKER",
      workerProfileId: member.workerId
    };
  }

  private async getManagerBindingTarget(projectId: string, profileId: string): Promise<BindingTarget> {
    const member = await this.prisma.projectManagerMember.findUnique({
      include: {
        manager: true
      },
      where: {
        projectId_managerId: {
          managerId: profileId,
          projectId
        }
      }
    });

    if (member === null) {
      throw new NotFoundException({
        message: "BINDING_TARGET_PROJECT_MANAGER_NOT_FOUND",
        profileId,
        projectId
      });
    }

    return this.createManagerBindingTarget(member);
  }

  private createManagerBindingTarget(member: ManagerMemberWithProfile): BindingTarget {
    assertActiveMember(member.status, member.managerId, member.projectId);
    assertUnboundProfile(member.manager.userId, member.managerId);

    return {
      managerProfileId: member.managerId,
      profileId: member.managerId,
      targetType: "MANAGER",
      workerProfileId: null
    };
  }
}
