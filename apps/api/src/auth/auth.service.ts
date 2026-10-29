import { workerRole } from "../attendance/member-history.js";
import { createHash, randomBytes } from "node:crypto";

import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { BindingInvitation, ManagerProfile, User, WorkerProfile } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { getHighestRoleCode } from "@construction/domain/roles.js";

import { assertAccountProfileComplete, assertIdentityMatches } from "./account-onboarding.js";
import { decryptPersonnelName } from "../management/personnel-name.js";
import { AuthorizationContextService } from "../authorization/authorization-context.service.js";
import { API_ENV } from "../config/env.module.js";
import type { ApiEnv } from "../config/env.js";
import { PrismaService } from "../infrastructure/database/prisma.service.js";
import { WechatCodeSessionConnector } from "../infrastructure/wechat/wechat-code-session.connector.js";

import type {
  AccessTokenPayload,
  AuthenticatedUser,
  AuthenticatedUserResponse,
  BindByInvitationRequest,
  BindByInvitationResponse,
  LoginResponse,
  MeProfileSummary,
  MeResponse,
  RefreshResponse,
  RefreshTokenRequest,
  RequestMetadata,
  WechatLoginRequest
} from "./auth.types.js";

export const hashSensitiveToken = (token: string): string => createHash("sha256").update(token).digest("hex");

const createRefreshToken = (): string => randomBytes(32).toString("base64url");

const getDateAfterSeconds = (now: Date, seconds: number): Date => new Date(now.getTime() + seconds * 1000);

const createUserResponse = (user: User): AuthenticatedUserResponse => ({
  id: user.id,
  isBound: user.isBound,
  openid: user.openid,
  status: user.status
});

const getRequiredWorkerProfileId = (invitation: BindingInvitation): string => {
  if (invitation.workerProfileId === null) {
    throw new BadRequestException({
      invitationId: invitation.id,
      message: "WORKER_INVITATION_WITHOUT_WORKER_PROFILE"
    });
  }

  return invitation.workerProfileId;
};

const getRequiredManagerProfileId = (invitation: BindingInvitation): string => {
  if (invitation.managerProfileId === null) {
    throw new BadRequestException({
      invitationId: invitation.id,
      message: "MANAGER_INVITATION_WITHOUT_MANAGER_PROFILE"
    });
  }

  return invitation.managerProfileId;
};

const getBindableProfile = <T extends WorkerProfile | ManagerProfile>(
  profile: T | null,
  profileId: string
): T => {
  if (profile === null) {
    throw new BadRequestException({
      message: "BINDING_TARGET_PROFILE_NOT_FOUND",
      profileId
    });
  }

  if (profile.userId !== null) {
    throw new ConflictException({
      message: "BINDING_TARGET_PROFILE_ALREADY_BOUND",
      profileId
    });
  }

  return profile;
};

const assertSingleGuardedWrite = (count: number, message: string, context: Record<string, unknown>): void => {
  if (count !== 1) {
    throw new ConflictException({
      ...context,
      message
    });
  }
};

const createProfileSummary = (user: {
  readonly managerProfile: { readonly id: string } | null;
  readonly workerProfile: { readonly id: string } | null;
}): MeProfileSummary => {
  if (user.workerProfile !== null) {
    return { id: user.workerProfile.id, type: "WORKER" };
  }

  if (user.managerProfile !== null) {
    return { id: user.managerProfile.id, type: "MANAGER" };
  }

  return { id: null, type: null };
};

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WechatCodeSessionConnector) private readonly wechatConnector: WechatCodeSessionConnector,
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(AuthorizationContextService) private readonly authorizationContext: AuthorizationContextService
  ) {}

  async loginWithWechatCode(request: WechatLoginRequest, metadata: RequestMetadata): Promise<LoginResponse> {
    const wechatSession = await this.wechatConnector.exchangeCode(request.code);
    const now = new Date();
    const unionidData = wechatSession.unionid === undefined ? {} : { unionid: wechatSession.unionid };
    const existingUser = await this.prisma.user.findUnique({
      where: {
        openid: wechatSession.openid
      }
    });

    if (existingUser?.status === "DISABLED") {
      throw new ForbiddenException({
        message: "USER_DISABLED",
        userId: existingUser.id
      });
    }

    const user =
      existingUser === null
        ? await this.prisma.user.create({
            data: {
              openid: wechatSession.openid,
              ...unionidData,
              lastLoginAt: now
            }
          })
        : await this.updateActiveLoginUser(existingUser.id, wechatSession.openid, unionidData, now);

    const refreshToken = createRefreshToken();
    const refreshTokenExpiresAt = getDateAfterSeconds(now, this.env.AUTH_REFRESH_TOKEN_TTL_SECONDS);
    const session = await this.prisma.userSession.create({
      data: {
        expiresAt: refreshTokenExpiresAt,
        ipAddress: metadata.ipAddress,
        tokenHash: hashSensitiveToken(refreshToken),
        userAgent: metadata.userAgent,
        userId: user.id
      }
    });
    const accessToken = await this.createAccessToken(user, session.id);

    return {
      accessToken,
      accessTokenExpiresAt: getDateAfterSeconds(now, this.env.JWT_ACCESS_TOKEN_TTL_SECONDS).toISOString(),
      refreshToken,
      refreshTokenExpiresAt: refreshTokenExpiresAt.toISOString(),
      user: createUserResponse(user)
    };
  }

  private async updateActiveLoginUser(
    userId: string,
    openid: string,
    unionidData: { readonly unionid?: string },
    now: Date
  ): Promise<User> {
    const updateResult = await this.prisma.user.updateMany({
      data: {
        ...unionidData,
        lastLoginAt: now
      },
      where: {
        openid,
        status: "ACTIVE"
      }
    });

    if (updateResult.count !== 1) {
      throw new ForbiddenException({
        message: "USER_DISABLED",
        userId
      });
    }

    const user = await this.prisma.user.findUnique({
      where: {
        id: userId
      }
    });

    if (user === null) {
      throw new UnauthorizedException({
        message: "LOGIN_USER_NOT_FOUND_AFTER_UPDATE",
        userId
      });
    }

    return user;
  }

  async refreshAccessToken(request: RefreshTokenRequest, metadata: RequestMetadata): Promise<RefreshResponse> {
    const now = new Date();
    const session = await this.prisma.userSession.findUnique({
      include: {
        user: true
      },
      where: {
        tokenHash: hashSensitiveToken(request.refreshToken)
      }
    });

    if (session === null || session.revokedAt !== null || session.expiresAt.getTime() <= now.getTime()) {
      throw new UnauthorizedException({
        message: "REFRESH_SESSION_INACTIVE"
      });
    }

    if (session.user.status !== "ACTIVE") {
      throw new UnauthorizedException({
        message: "USER_DISABLED",
        userId: session.userId
      });
    }

    await this.prisma.userSession.update({
      data: {
        lastUsedAt: now
      },
      where: {
        id: session.id
      }
    });

    return {
      accessToken: await this.createAccessToken(session.user, session.id),
      accessTokenExpiresAt: getDateAfterSeconds(now, this.env.JWT_ACCESS_TOKEN_TTL_SECONDS).toISOString(),
      user: createUserResponse(session.user)
    };
  }

  async logout(currentUser: AuthenticatedUser): Promise<{ readonly status: "ok" }> {
    await this.prisma.userSession.update({
      data: {
        revokedAt: new Date()
      },
      where: {
        id: currentUser.sessionId
      }
    });

    return { status: "ok" };
  }

  async bindByInvitation(
    currentUser: AuthenticatedUser,
    request: BindByInvitationRequest
  ): Promise<BindByInvitationResponse> {
    const now = new Date();
    const currentUserRecord = await this.prisma.user.findUnique({
      include: {
        managerProfile: true,
        workerProfile: true
      },
      where: {
        id: currentUser.userId
      }
    });

    if (currentUserRecord === null) {
      throw new UnauthorizedException({
        message: "CURRENT_USER_NOT_FOUND",
        userId: currentUser.userId
      });
    }

    if (currentUserRecord.isBound || currentUserRecord.workerProfile !== null || currentUserRecord.managerProfile !== null) {
      throw new ConflictException({
        message: "CURRENT_USER_ALREADY_BOUND",
        userId: currentUser.userId
      });
    }

    const invitation = await this.prisma.bindingInvitation.findUnique({
      where: {
        codeHash: hashSensitiveToken(request.invitationCode)
      }
    });

    if (invitation === null || invitation.status !== "PENDING" || invitation.expiresAt.getTime() <= now.getTime()) {
      throw new BadRequestException({
        message: "BINDING_INVITATION_NOT_AVAILABLE"
      });
    }

    if (invitation.targetType === "WORKER") {
      return this.bindWorkerProfile(currentUserRecord, invitation, now);
    }

    return this.bindManagerProfile(currentUserRecord, invitation, now);
  }

  async getMe(userId: string): Promise<MeResponse> {
    const user = await this.prisma.user.findUnique({
      include: {
        managerProfile: true,
        workerProfile: true
      },
      where: {
        id: userId
      }
    });

    if (user === null) {
      throw new UnauthorizedException({
        message: "CURRENT_USER_NOT_FOUND",
        userId
      });
    }

    const { assignments } = await this.authorizationContext.loadAuthorizationData(userId);

    return {
      profile: createProfileSummary(user),
      roles: {
        assignments: assignments.map((assignment) => ({
          roleCode: assignment.roleCode,
          scope: {
            scopeId: assignment.scope.scopeId,
            scopeType: assignment.scope.scopeType
          }
        })),
        highestRoleCode: getHighestRoleCode(assignments)
      },
      user: {
        id: user.id,
        isBound: user.isBound,
        status: user.status
      }
    };
  }

  private async bindWorkerProfile(
    user: User,
    invitation: BindingInvitation,
    now: Date
  ): Promise<BindByInvitationResponse> {
    const userId: string = user.id;
    assertAccountProfileComplete(user);
    const workerProfileId = getRequiredWorkerProfileId(invitation);
    const profile = getBindableProfile(
      await this.prisma.workerProfile.findUnique({
        where: {
          id: workerProfileId
        }
      }),
      workerProfileId
    );
    assertIdentityMatches(
      { realName: decryptPersonnelName(user.encryptedRealName!, this.env.PERSONNEL_ENCRYPTION_KEY), phone: user.phone! },
      { realName: decryptPersonnelName(profile.encryptedName, this.env.PERSONNEL_ENCRYPTION_KEY), phone: profile.phone },
    );

    return this.prisma.$transaction(async (transaction): Promise<BindByInvitationResponse> => {
      const invitationUpdate = await transaction.bindingInvitation.updateMany({
        data: {
          acceptedByUserId: userId,
          status: "ACCEPTED",
          usedAt: now
        },
        where: {
          acceptedByUserId: null,
          expiresAt: {
            gt: now
          },
          id: invitation.id,
          status: "PENDING",
          usedAt: null
        }
      });
      assertSingleGuardedWrite(invitationUpdate.count, "BINDING_INVITATION_NOT_AVAILABLE", {
        invitationId: invitation.id
      });

      const profileUpdate = await transaction.workerProfile.updateMany({
        data: {
          userId
        },
        where: {
          id: workerProfileId,
          encryptedName: profile.encryptedName,
          phone: profile.phone,
          userId: null
        }
      });
      assertSingleGuardedWrite(profileUpdate.count, "BINDING_TARGET_PROFILE_ALREADY_BOUND", {
        profileId: workerProfileId
      });

      const userUpdate = await transaction.user.updateMany({
        data: {
          isBound: true
        },
        where: {
          id: userId,
          encryptedRealName: user.encryptedRealName,
          phone: user.phone,
          isBound: false
        }
      });
      assertSingleGuardedWrite(userUpdate.count, "CURRENT_USER_ALREADY_BOUND", {
        userId
      });

      await this.grantWorkerMembershipRoles(transaction, userId, workerProfileId);

      await transaction.auditLog.create({
        data: {
          action: "auth.bind.worker",
          actorUserId: userId,
          entityId: workerProfileId,
          entityType: "worker_profile",
          metadata: {
            invitationId: invitation.id
          }
        }
      });

      return {
        profileId: workerProfileId,
        targetType: "WORKER"
      };
    });
  }

  private async bindManagerProfile(
    user: User,
    invitation: BindingInvitation,
    now: Date
  ): Promise<BindByInvitationResponse> {
    const userId: string = user.id;
    assertAccountProfileComplete(user);
    const managerProfileId = getRequiredManagerProfileId(invitation);
    const profile = getBindableProfile(
      await this.prisma.managerProfile.findUnique({
        where: {
          id: managerProfileId
        }
      }),
      managerProfileId
    );
    assertIdentityMatches(
      { realName: decryptPersonnelName(user.encryptedRealName!, this.env.PERSONNEL_ENCRYPTION_KEY), phone: user.phone! },
      { realName: profile.name, phone: profile.phone },
    );

    return this.prisma.$transaction(async (transaction): Promise<BindByInvitationResponse> => {
      const invitationUpdate = await transaction.bindingInvitation.updateMany({
        data: {
          acceptedByUserId: userId,
          status: "ACCEPTED",
          usedAt: now
        },
        where: {
          acceptedByUserId: null,
          expiresAt: {
            gt: now
          },
          id: invitation.id,
          status: "PENDING",
          usedAt: null
        }
      });
      assertSingleGuardedWrite(invitationUpdate.count, "BINDING_INVITATION_NOT_AVAILABLE", {
        invitationId: invitation.id
      });

      const profileUpdate = await transaction.managerProfile.updateMany({
        data: {
          userId
        },
        where: {
          id: managerProfileId,
          name: profile.name,
          phone: profile.phone,
          userId: null
        }
      });
      assertSingleGuardedWrite(profileUpdate.count, "BINDING_TARGET_PROFILE_ALREADY_BOUND", {
        profileId: managerProfileId
      });

      const userUpdate = await transaction.user.updateMany({
        data: {
          isBound: true
        },
        where: {
          id: userId,
          encryptedRealName: user.encryptedRealName,
          phone: user.phone,
          isBound: false
        }
      });
      assertSingleGuardedWrite(userUpdate.count, "CURRENT_USER_ALREADY_BOUND", {
        userId
      });

      await this.grantManagerMembershipRoles(transaction, userId, managerProfileId);

      await transaction.auditLog.create({
        data: {
          action: "auth.bind.manager",
          actorUserId: userId,
          entityId: managerProfileId,
          entityType: "manager_profile",
          metadata: {
            invitationId: invitation.id
          }
        }
      });

      return {
        profileId: managerProfileId,
        targetType: "MANAGER"
      };
    });
  }

  private async grantWorkerMembershipRoles(
    transaction: Prisma.TransactionClient,
    userId: string,
    workerProfileId: string
  ): Promise<void> {
    const memberships = await transaction.projectWorkerMember.findMany({
      where: { status: "ACTIVE", workerId: workerProfileId }
    });
    if (memberships.length === 0) {
      return;
    }
    for (const membership of memberships) {
      const code = workerRole(membership.projectRoleLabel);
      const role = await transaction.role.findUnique({ where: { code } });
      if (role === null) throw new ConflictException({ message: "MEMBERSHIP_ROLE_NOT_FOUND", code });
      const assignment = { roleId: role.id, userId, scopeType: code === "TEAM_LEADER" ? "TEAM" as const : "PROJECT" as const,
        scopeId: code === "TEAM_LEADER" ? membership.teamId! : membership.projectId };
      await transaction.userRole.upsert({ create: assignment, update: {}, where: { userId_roleId_scopeType_scopeId: assignment } });
    }
  }

  private async grantManagerMembershipRoles(
    transaction: Prisma.TransactionClient,
    userId: string,
    managerProfileId: string
  ): Promise<void> {
    const memberships = await transaction.projectManagerMember.findMany({
      where: { managerId: managerProfileId, status: "ACTIVE" }
    });
    for (const membership of memberships) {
      const role = await transaction.role.findUnique({ where: { code: membership.roleCode } });
      if (role === null) {
        throw new ConflictException({ message: "MANAGER_ROLE_NOT_FOUND", roleCode: membership.roleCode });
      }
      const scopeType = membership.teamScopeId !== null ? "TEAM" : "PROJECT";
      const scopeId = membership.teamScopeId !== null ? membership.teamScopeId : membership.projectId;
      await transaction.userRole.upsert({
        create: { roleId: role.id, scopeId, scopeType, userId },
        update: {},
        where: {
          userId_roleId_scopeType_scopeId: {
            roleId: role.id,
            scopeId,
            scopeType,
            userId
          }
        }
      });
    }
  }

  private async createAccessToken(user: User, sessionId: string): Promise<string> {
    const payload: AccessTokenPayload = {
      sid: sessionId,
      sub: user.id,
      sv: user.sessionVersion
    };

    return this.jwtService.signAsync(payload, {
      expiresIn: this.env.JWT_ACCESS_TOKEN_TTL_SECONDS,
      secret: this.env.JWT_ACCESS_TOKEN_SECRET
    });
  }
}
