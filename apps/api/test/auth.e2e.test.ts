import { createHash } from "node:crypto";

import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { AuthModule } from "../src/auth/auth.module.js";
import type { WechatCodeSession } from "../src/infrastructure/wechat/wechat-code-session.connector.js";
import { WechatCodeSessionConnector } from "../src/infrastructure/wechat/wechat-code-session.connector.js";
import { PrismaService } from "../src/infrastructure/database/prisma.service.js";

type UserStatusValue = "ACTIVE" | "DISABLED";
type ProfileOwnerTypeValue = "WORKER" | "MANAGER";
type BindingInvitationStatusValue = "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";

type UserRecord = {
  id: string;
  isBound: boolean;
  lastLoginAt: Date | null;
  managerProfile: ManagerProfileRecord | null;
  openid: string;
  phone: string | null;
  sessionVersion: number;
  status: UserStatusValue;
  unionid: string | null;
  workerProfile: WorkerProfileRecord | null;
};

type UserSessionRecord = {
  expiresAt: Date;
  id: string;
  ipAddress: string | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  tokenHash: string;
  user: UserRecord;
  userAgent: string | null;
  userId: string;
};

type WorkerProfileRecord = {
  id: string;
  phone: string;
  userId: string | null;
};

type ManagerProfileRecord = {
  id: string;
  phone: string;
  userId: string | null;
};

type BindingInvitationRecord = {
  acceptedByUserId: string | null;
  codeHash: string;
  expiresAt: Date;
  id: string;
  managerProfileId: string | null;
  status: BindingInvitationStatusValue;
  targetType: ProfileOwnerTypeValue;
  usedAt: Date | null;
  workerProfileId: string | null;
};

type UserUpsertArgs = {
  create: {
    lastLoginAt: Date;
    openid: string;
    unionid?: string;
  };
  update: {
    lastLoginAt: Date;
    unionid?: string;
  };
  where: {
    openid: string;
  };
};

type UserCreateArgs = {
  data: {
    lastLoginAt: Date;
    openid: string;
    unionid?: string;
  };
};

type UserFindUniqueArgs = {
  where: {
    id?: string;
    openid?: string;
  };
};

type UserUpdateArgs = {
  data: {
    isBound?: boolean;
    phone?: string;
  };
  where: {
    id: string;
  };
};

type CountResult = {
  readonly count: number;
};

type UserUpdateManyArgs = {
  data: {
    isBound?: boolean;
    phone?: string;
  };
  where: {
    id: string;
    isBound?: boolean;
    openid?: string;
    status?: "ACTIVE";
  };
};

type UserSessionCreateArgs = {
  data: {
    expiresAt: Date;
    ipAddress: string | null;
    tokenHash: string;
    userAgent: string | null;
    userId: string;
  };
};

type UserSessionFindUniqueArgs = {
  include?: {
    user?: boolean;
  };
  where: {
    id?: string;
    tokenHash?: string;
  };
};

type UserSessionUpdateArgs = {
  data: {
    lastUsedAt?: Date;
    revokedAt?: Date;
  };
  where: {
    id: string;
  };
};

type BindingInvitationFindUniqueArgs = {
  where: {
    codeHash: string;
  };
};

type BindingInvitationUpdateArgs = {
  data: {
    acceptedByUserId: string;
    status: "ACCEPTED";
    usedAt: Date;
  };
  where: {
    id: string;
  };
};

type BindingInvitationUpdateManyArgs = {
  data: {
    acceptedByUserId: string;
    status: "ACCEPTED";
    usedAt: Date;
  };
  where: {
    acceptedByUserId: null;
    expiresAt: {
      gt: Date;
    };
    id: string;
    status: "PENDING";
    usedAt: null;
  };
};

type WorkerProfileFindUniqueArgs = {
  where: {
    id: string;
  };
};

type WorkerProfileUpdateArgs = {
  data: {
    userId: string;
  };
  where: {
    id: string;
  };
};

type ProfileUpdateManyArgs = {
  data: {
    userId: string;
  };
  where: {
    id: string;
    userId: null;
  };
};

type AuditLogCreateArgs = {
  data: {
    action: string;
    actorUserId: string;
    entityId: string;
    entityType: string;
    metadata: Record<string, unknown>;
  };
};

type RoleFindUniqueArgs = {
  where: {
    code: string;
  };
};

type RoleRecord = {
  id: string;
  code: string;
};

type ProjectWorkerMemberFindManyArgs = {
  where: {
    workerId: string;
    status: string;
  };
};

type ProjectWorkerMemberRecord = {
  projectId: string;
  workerId: string;
  status: string;
};

type ProjectManagerMemberFindManyArgs = {
  where: {
    managerId: string;
    status: string;
  };
};

type ProjectManagerMemberRecord = {
  projectId: string;
  managerId: string;
  roleCode: string;
  status: string;
  teamScopeId: string | null;
};

type UserRoleUpsertArgs = {
  create: {
    roleId: string;
    scopeId: string;
    scopeType: string;
    userId: string;
  };
  update: Record<string, never>;
  where: {
    userId_roleId_scopeType_scopeId: {
      roleId: string;
      scopeId: string;
      scopeType: string;
      userId: string;
    };
  };
};

type UserRoleRecord = {
  roleId: string;
  scopeId: string;
  scopeType: string;
  userId: string;
};

const tokenHash = (value: string): string => createHash("sha256").update(value).digest("hex");

class AuthPrismaTestDouble {
  readonly users = new Map<string, UserRecord>();
  readonly sessions = new Map<string, UserSessionRecord>();
  readonly workerProfiles = new Map<string, WorkerProfileRecord>();
  readonly managerProfiles = new Map<string, ManagerProfileRecord>();
  readonly bindingInvitations = new Map<string, BindingInvitationRecord>();
  readonly auditLogs: AuditLogCreateArgs["data"][] = [];
  readonly userRoles: UserRoleRecord[] = [];
  readonly seededRoles = new Map<string, RoleRecord>();
  readonly workerMemberships: ProjectWorkerMemberRecord[] = [];
  readonly managerMemberships: ProjectManagerMemberRecord[] = [];
  beforeTransaction: (() => void) | undefined = undefined;

  private userSequence = 0;
  private sessionSequence = 0;

  readonly role = {
    findUnique: async (args: RoleFindUniqueArgs): Promise<RoleRecord | null> =>
      this.seededRoles.get(args.where.code) ?? null
  };

  readonly projectWorkerMember = {
    findMany: async (args: ProjectWorkerMemberFindManyArgs): Promise<ProjectWorkerMemberRecord[]> =>
      this.workerMemberships.filter(
        (m: ProjectWorkerMemberRecord): boolean => m.workerId === args.where.workerId && m.status === args.where.status
      )
  };

  readonly projectManagerMember = {
    findMany: async (args: ProjectManagerMemberFindManyArgs): Promise<ProjectManagerMemberRecord[]> =>
      this.managerMemberships.filter(
        (m: ProjectManagerMemberRecord): boolean => m.managerId === args.where.managerId && m.status === args.where.status
      )
  };

  readonly userRole = {
    upsert: async (args: UserRoleUpsertArgs): Promise<UserRoleRecord> => {
      const { userId, roleId, scopeType, scopeId } = args.create;
      const existing = this.userRoles.find(
        (r: UserRoleRecord): boolean =>
          r.userId === userId &&
          r.roleId === roleId &&
          r.scopeType === scopeType &&
          r.scopeId === scopeId
      );
      if (existing === undefined) {
        const newRecord: UserRoleRecord = { userId, roleId, scopeType, scopeId };
        this.userRoles.push(newRecord);
        return newRecord;
      }
      return existing;
    }
  };

  readonly user = {
    create: async (args: UserCreateArgs): Promise<UserRecord> => {
      this.userSequence += 1;
      const user: UserRecord = {
        id: `user-${this.userSequence}`,
        isBound: false,
        lastLoginAt: args.data.lastLoginAt,
        managerProfile: null,
        openid: args.data.openid,
        phone: null,
        sessionVersion: 1,
        status: "ACTIVE",
        unionid: args.data.unionid ?? null,
        workerProfile: null
      };
      this.users.set(user.id, user);
      return user;
    },
    upsert: async (args: UserUpsertArgs): Promise<UserRecord> => {
      const existingUser = Array.from(this.users.values()).find(
        (user: UserRecord): boolean => user.openid === args.where.openid
      );

      if (existingUser !== undefined) {
        const updatedUser: UserRecord = {
          ...existingUser,
          lastLoginAt: args.update.lastLoginAt,
          unionid: args.update.unionid ?? existingUser.unionid
        };
        this.users.set(updatedUser.id, updatedUser);
        return updatedUser;
      }

      this.userSequence += 1;
      const user: UserRecord = {
        id: `user-${this.userSequence}`,
        isBound: false,
        lastLoginAt: args.create.lastLoginAt,
        managerProfile: null,
        openid: args.create.openid,
        phone: null,
        sessionVersion: 1,
        status: "ACTIVE",
        unionid: args.create.unionid ?? null,
        workerProfile: null
      };
      this.users.set(user.id, user);
      return user;
    },
    findUnique: async (args: UserFindUniqueArgs): Promise<UserRecord | null> => {
      if (args.where.id !== undefined) {
        return this.users.get(args.where.id) ?? null;
      }

      if (args.where.openid !== undefined) {
        return Array.from(this.users.values()).find((user: UserRecord): boolean => user.openid === args.where.openid) ?? null;
      }

      return null;
    },
    update: async (args: UserUpdateArgs): Promise<UserRecord> => {
      const user = this.users.get(args.where.id);

      if (user === undefined) {
        throw new Error(JSON.stringify({ message: "User not found in test double", userId: args.where.id }));
      }

      const updatedUser: UserRecord = {
        ...user,
        isBound: args.data.isBound ?? user.isBound,
        phone: args.data.phone ?? user.phone
      };
      this.users.set(updatedUser.id, updatedUser);
      return updatedUser;
    },
    updateMany: async (args: UserUpdateManyArgs): Promise<CountResult> => {
      const user =
        args.where.openid === undefined
          ? this.users.get(args.where.id)
          : Array.from(this.users.values()).find((candidate: UserRecord): boolean => candidate.openid === args.where.openid);

      if (
        user === undefined ||
        (args.where.isBound !== undefined && user.isBound !== args.where.isBound) ||
        (args.where.status !== undefined && user.status !== args.where.status)
      ) {
        return { count: 0 };
      }

      const updatedUser: UserRecord = {
        ...user,
        isBound: args.data.isBound ?? user.isBound,
        phone: args.data.phone ?? user.phone
      };
      this.users.set(updatedUser.id, updatedUser);
      return { count: 1 };
    }
  };

  readonly userSession = {
    create: async (args: UserSessionCreateArgs): Promise<UserSessionRecord> => {
      const user = this.users.get(args.data.userId);

      if (user === undefined) {
        throw new Error(JSON.stringify({ message: "Session user not found in test double", userId: args.data.userId }));
      }

      this.sessionSequence += 1;
      const session: UserSessionRecord = {
        expiresAt: args.data.expiresAt,
        id: `session-${this.sessionSequence}`,
        ipAddress: args.data.ipAddress,
        lastUsedAt: null,
        revokedAt: null,
        tokenHash: args.data.tokenHash,
        user,
        userAgent: args.data.userAgent,
        userId: user.id
      };
      this.sessions.set(session.id, session);
      return session;
    },
    findUnique: async (args: UserSessionFindUniqueArgs): Promise<UserSessionRecord | null> => {
      if (args.where.id !== undefined) {
        return this.sessions.get(args.where.id) ?? null;
      }

      if (args.where.tokenHash !== undefined) {
        return (
          Array.from(this.sessions.values()).find(
            (session: UserSessionRecord): boolean => session.tokenHash === args.where.tokenHash
          ) ?? null
        );
      }

      return null;
    },
    update: async (args: UserSessionUpdateArgs): Promise<UserSessionRecord> => {
      const session = this.sessions.get(args.where.id);

      if (session === undefined) {
        throw new Error(JSON.stringify({ message: "Session not found in test double", sessionId: args.where.id }));
      }

      const updatedSession: UserSessionRecord = {
        ...session,
        lastUsedAt: args.data.lastUsedAt ?? session.lastUsedAt,
        revokedAt: args.data.revokedAt ?? session.revokedAt
      };
      this.sessions.set(updatedSession.id, updatedSession);
      return updatedSession;
    }
  };

  readonly bindingInvitation = {
    findUnique: async (args: BindingInvitationFindUniqueArgs): Promise<BindingInvitationRecord | null> =>
      this.bindingInvitations.get(args.where.codeHash) ?? null,
    update: async (args: BindingInvitationUpdateArgs): Promise<BindingInvitationRecord> => {
      const invitation = Array.from(this.bindingInvitations.values()).find(
        (candidate: BindingInvitationRecord): boolean => candidate.id === args.where.id
      );

      if (invitation === undefined) {
        throw new Error(JSON.stringify({ invitationId: args.where.id, message: "Invitation not found in test double" }));
      }

      const updatedInvitation: BindingInvitationRecord = {
        ...invitation,
        acceptedByUserId: args.data.acceptedByUserId,
        status: args.data.status,
        usedAt: args.data.usedAt
      };
      this.bindingInvitations.delete(invitation.codeHash);
      this.bindingInvitations.set(updatedInvitation.codeHash, updatedInvitation);
      return updatedInvitation;
    },
    updateMany: async (args: BindingInvitationUpdateManyArgs): Promise<CountResult> => {
      const invitation = Array.from(this.bindingInvitations.values()).find(
        (candidate: BindingInvitationRecord): boolean => candidate.id === args.where.id
      );

      if (
        invitation === undefined ||
        invitation.acceptedByUserId !== args.where.acceptedByUserId ||
        invitation.status !== args.where.status ||
        invitation.usedAt !== args.where.usedAt ||
        invitation.expiresAt.getTime() <= args.where.expiresAt.gt.getTime()
      ) {
        return { count: 0 };
      }

      const updatedInvitation: BindingInvitationRecord = {
        ...invitation,
        acceptedByUserId: args.data.acceptedByUserId,
        status: args.data.status,
        usedAt: args.data.usedAt
      };
      this.bindingInvitations.delete(invitation.codeHash);
      this.bindingInvitations.set(updatedInvitation.codeHash, updatedInvitation);
      return { count: 1 };
    }
  };

  readonly workerProfile = {
    findUnique: async (args: WorkerProfileFindUniqueArgs): Promise<WorkerProfileRecord | null> =>
      this.workerProfiles.get(args.where.id) ?? null,
    update: async (args: WorkerProfileUpdateArgs): Promise<WorkerProfileRecord> => {
      const profile = this.workerProfiles.get(args.where.id);

      if (profile === undefined) {
        throw new Error(JSON.stringify({ message: "Worker profile not found in test double", workerId: args.where.id }));
      }

      const updatedProfile: WorkerProfileRecord = {
        ...profile,
        userId: args.data.userId
      };
      this.workerProfiles.set(updatedProfile.id, updatedProfile);
      return updatedProfile;
    },
    updateMany: async (args: ProfileUpdateManyArgs): Promise<CountResult> => {
      const profile = this.workerProfiles.get(args.where.id);

      if (profile === undefined || profile.userId !== args.where.userId) {
        return { count: 0 };
      }

      const updatedProfile: WorkerProfileRecord = {
        ...profile,
        userId: args.data.userId
      };
      this.workerProfiles.set(updatedProfile.id, updatedProfile);
      return { count: 1 };
    }
  };

  readonly managerProfile = {
    findUnique: async (args: WorkerProfileFindUniqueArgs): Promise<ManagerProfileRecord | null> =>
      this.managerProfiles.get(args.where.id) ?? null,
    update: async (args: WorkerProfileUpdateArgs): Promise<ManagerProfileRecord> => {
      const profile = this.managerProfiles.get(args.where.id);

      if (profile === undefined) {
        throw new Error(JSON.stringify({ managerId: args.where.id, message: "Manager profile not found in test double" }));
      }

      const updatedProfile: ManagerProfileRecord = {
        ...profile,
        userId: args.data.userId
      };
      this.managerProfiles.set(updatedProfile.id, updatedProfile);
      return updatedProfile;
    },
    updateMany: async (args: ProfileUpdateManyArgs): Promise<CountResult> => {
      const profile = this.managerProfiles.get(args.where.id);

      if (profile === undefined || profile.userId !== args.where.userId) {
        return { count: 0 };
      }

      const updatedProfile: ManagerProfileRecord = {
        ...profile,
        userId: args.data.userId
      };
      this.managerProfiles.set(updatedProfile.id, updatedProfile);
      return { count: 1 };
    }
  };

  readonly auditLog = {
    create: async (args: AuditLogCreateArgs): Promise<AuditLogCreateArgs["data"]> => {
      this.auditLogs.push(args.data);
      return args.data;
    }
  };

  async $transaction<T>(callback: (transaction: AuthPrismaTestDouble) => Promise<T>): Promise<T> {
    if (this.beforeTransaction !== undefined) {
      this.beforeTransaction();
      this.beforeTransaction = undefined;
    }

    return callback(this);
  }
}

class WechatConnectorTestDouble {
  async exchangeCode(code: string): Promise<WechatCodeSession> {
    return {
      openid: `openid-${code}`,
      sessionKey: `session-key-${code}`,
      unionid: `unionid-${code}`
    };
  }
}

const applyTestEnv = (): void => {
  process.env.AUTH_REFRESH_TOKEN_TTL_SECONDS = "2592000";
  process.env.API_PORT = "3000";
  process.env.DATABASE_URL = "postgresql://construction:construction@localhost:5432/construction_personnel?schema=public";
  process.env.FACE_SERVICE_API_KEY = "face-service-key";
  process.env.FACE_SERVICE_BASE_URL = "http://localhost:8000";
  process.env.JWT_ACCESS_TOKEN_SECRET = "test-jwt-secret-with-at-least-32-characters";
  process.env.JWT_ACCESS_TOKEN_TTL_SECONDS = "900";
  process.env.NODE_ENV = "test";
  process.env.OBJECT_STORAGE_ACCESS_KEY = "object-storage-access-key";
  process.env.OBJECT_STORAGE_BUCKET = "construction-personnel";
  process.env.OBJECT_STORAGE_ENDPOINT = "http://localhost:9000";
  process.env.OBJECT_STORAGE_SECRET_KEY = "object-storage-secret-key";
  process.env.WECHAT_APP_ID = "wechat-app-id";
  process.env.WECHAT_APP_SECRET = "wechat-app-secret";
};

const createApp = async (
  prisma: AuthPrismaTestDouble,
  wechatConnector: WechatConnectorTestDouble
): Promise<INestApplication> => {
  const moduleRef = await Test.createTestingModule({
    imports: [AuthModule]
  })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .overrideProvider(WechatCodeSessionConnector)
    .useValue(wechatConnector)
    .compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
};

describe("AuthModule", (): void => {
  let app: INestApplication | undefined;
  let prisma: AuthPrismaTestDouble;

  beforeEach((): void => {
    applyTestEnv();
    prisma = new AuthPrismaTestDouble();
  });

  afterEach(async (): Promise<void> => {
    if (app !== undefined) {
      await app.close();
      app = undefined;
    }
  });

  test("logs in with WeChat code and creates a refresh session", async (): Promise<void> => {
    app = await createApp(prisma, new WechatConnectorTestDouble());

    const response = await request(app.getHttpServer())
      .post("/auth/wechat/login")
      .send({ code: "login-code-1" })
      .expect(201);

    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.refreshToken).toEqual(expect.any(String));
    expect(response.body.user).toMatchObject({
      isBound: false,
      openid: "openid-login-code-1",
      status: "ACTIVE"
    });
    expect(prisma.sessions.size).toBe(1);
  });

  test("rejects disabled users during WeChat login", async (): Promise<void> => {
    prisma.users.set("user-disabled", {
      id: "user-disabled",
      isBound: false,
      lastLoginAt: null,
      managerProfile: null,
      openid: "openid-login-code-1",
      phone: null,
      sessionVersion: 1,
      status: "DISABLED",
      unionid: null,
      workerProfile: null
    });
    app = await createApp(prisma, new WechatConnectorTestDouble());

    await request(app.getHttpServer()).post("/auth/wechat/login").send({ code: "login-code-1" }).expect(403);
    expect(prisma.sessions.size).toBe(0);
    expect(prisma.users.get("user-disabled")?.lastLoginAt).toBeNull();
  });

  test("refresh rejects revoked sessions", async (): Promise<void> => {
    app = await createApp(prisma, new WechatConnectorTestDouble());

    const loginResponse = await request(app.getHttpServer())
      .post("/auth/wechat/login")
      .send({ code: "login-code-1" })
      .expect(201);
    const session = Array.from(prisma.sessions.values())[0];

    if (session === undefined) {
      throw new Error(JSON.stringify({ message: "Expected session from login" }));
    }

    session.revokedAt = new Date();

    await request(app.getHttpServer())
      .post("/auth/refresh")
      .send({ refreshToken: loginResponse.body.refreshToken })
      .expect(401);
  });

  test("logout revokes the current session", async (): Promise<void> => {
    app = await createApp(prisma, new WechatConnectorTestDouble());

    const loginResponse = await request(app.getHttpServer())
      .post("/auth/wechat/login")
      .send({ code: "login-code-1" })
      .expect(201);

    await request(app.getHttpServer())
      .post("/auth/logout")
      .set("Authorization", `Bearer ${loginResponse.body.accessToken}`)
      .expect(201)
      .expect({ status: "ok" });

    const session = Array.from(prisma.sessions.values())[0];
    expect(session?.revokedAt).toBeInstanceOf(Date);
  });

  test("bind consumes worker invitation and links profile to current user", async (): Promise<void> => {
    app = await createApp(prisma, new WechatConnectorTestDouble());
    prisma.workerProfiles.set("worker-1", {
      id: "worker-1",
      phone: "13800000000",
      userId: null
    });
    prisma.bindingInvitations.set(tokenHash("invite-code-1"), {
      acceptedByUserId: null,
      codeHash: tokenHash("invite-code-1"),
      expiresAt: new Date(Date.now() + 60_000),
      id: "invitation-1",
      managerProfileId: null,
      status: "PENDING",
      targetType: "WORKER",
      usedAt: null,
      workerProfileId: "worker-1"
    });

    const loginResponse = await request(app.getHttpServer())
      .post("/auth/wechat/login")
      .send({ code: "login-code-1" })
      .expect(201);

    await request(app.getHttpServer())
      .post("/auth/bind")
      .set("Authorization", `Bearer ${loginResponse.body.accessToken}`)
      .send({ invitationCode: "invite-code-1" })
      .expect(201)
      .expect({
        profileId: "worker-1",
        targetType: "WORKER"
      });

    expect(prisma.workerProfiles.get("worker-1")?.userId).toBe("user-1");
    expect(prisma.users.get("user-1")?.isBound).toBe(true);
    expect(prisma.bindingInvitations.get(tokenHash("invite-code-1"))?.status).toBe("ACCEPTED");
  });

  test("bind does not overwrite profile when invitation is consumed after precheck", async (): Promise<void> => {
    app = await createApp(prisma, new WechatConnectorTestDouble());
    prisma.workerProfiles.set("worker-1", {
      id: "worker-1",
      phone: "13800000000",
      userId: null
    });
    prisma.bindingInvitations.set(tokenHash("invite-code-1"), {
      acceptedByUserId: null,
      codeHash: tokenHash("invite-code-1"),
      expiresAt: new Date(Date.now() + 60_000),
      id: "invitation-1",
      managerProfileId: null,
      status: "PENDING",
      targetType: "WORKER",
      usedAt: null,
      workerProfileId: "worker-1"
    });

    const loginResponse = await request(app.getHttpServer())
      .post("/auth/wechat/login")
      .send({ code: "login-code-1" })
      .expect(201);

    prisma.beforeTransaction = (): void => {
      const invitation = prisma.bindingInvitations.get(tokenHash("invite-code-1"));

      if (invitation === undefined) {
        throw new Error(JSON.stringify({ message: "Expected invitation before race simulation" }));
      }

      prisma.bindingInvitations.set(tokenHash("invite-code-1"), {
        ...invitation,
        acceptedByUserId: "other-user",
        status: "ACCEPTED",
        usedAt: new Date()
      });
      prisma.workerProfiles.set("worker-1", {
        id: "worker-1",
        phone: "13800000000",
        userId: "other-user"
      });
    };

    await request(app.getHttpServer())
      .post("/auth/bind")
      .set("Authorization", `Bearer ${loginResponse.body.accessToken}`)
      .send({ invitationCode: "invite-code-1" })
      .expect(409);

    expect(prisma.workerProfiles.get("worker-1")?.userId).toBe("other-user");
    expect(prisma.users.get("user-1")?.isBound).toBe(false);
    expect(prisma.bindingInvitations.get(tokenHash("invite-code-1"))?.acceptedByUserId).toBe("other-user");
  });

  test("binding a worker grants WORKER@PROJECT for each active membership", async (): Promise<void> => {
    app = await createApp(prisma, new WechatConnectorTestDouble());
    // seed the WORKER role
    prisma.seededRoles.set("WORKER", { id: "role-WORKER", code: "WORKER" });
    // seed worker profile
    prisma.workerProfiles.set("worker-1", {
      id: "worker-1",
      phone: "13800000000",
      userId: null
    });
    // seed an ACTIVE worker membership at project-1
    prisma.workerMemberships.push({ projectId: "project-1", workerId: "worker-1", status: "ACTIVE" });
    // seed a PENDING WORKER invitation for worker-1
    prisma.bindingInvitations.set(tokenHash("invite-worker-roles"), {
      acceptedByUserId: null,
      codeHash: tokenHash("invite-worker-roles"),
      expiresAt: new Date(Date.now() + 60_000),
      id: "invitation-worker-roles",
      managerProfileId: null,
      status: "PENDING",
      targetType: "WORKER",
      usedAt: null,
      workerProfileId: "worker-1"
    });

    // login as an unbound user
    const loginResponse = await request(app.getHttpServer())
      .post("/auth/wechat/login")
      .send({ code: "worker-roles-code" })
      .expect(201);

    // bind with the invitation
    await request(app.getHttpServer())
      .post("/auth/bind")
      .set("Authorization", `Bearer ${loginResponse.body.accessToken}`)
      .send({ invitationCode: "invite-worker-roles" })
      .expect(201)
      .expect({ profileId: "worker-1", targetType: "WORKER" });

    // expect the WORKER@PROJECT role was granted for project-1
    const userId = loginResponse.body.user.id as string;
    expect(prisma.userRoles).toContainEqual({
      userId,
      roleId: "role-WORKER",
      scopeType: "PROJECT",
      scopeId: "project-1"
    });
  });

  test("binding a manager grants their role-code at TEAM scope (teamScopeId) for active memberships", async (): Promise<void> => {
    app = await createApp(prisma, new WechatConnectorTestDouble());
    // seed TEAM_LEADER role
    prisma.seededRoles.set("TEAM_LEADER", { id: "role-TEAM_LEADER", code: "TEAM_LEADER" });
    // seed manager profile
    prisma.managerProfiles.set("manager-1", {
      id: "manager-1",
      phone: "13800000001",
      userId: null
    });
    // seed an ACTIVE manager membership at project-1 with teamScopeId "team-1" and roleCode TEAM_LEADER
    prisma.managerMemberships.push({
      projectId: "project-1",
      managerId: "manager-1",
      roleCode: "TEAM_LEADER",
      status: "ACTIVE",
      teamScopeId: "team-1"
    });
    // seed a PENDING MANAGER invitation for manager-1
    prisma.bindingInvitations.set(tokenHash("invite-manager-roles"), {
      acceptedByUserId: null,
      codeHash: tokenHash("invite-manager-roles"),
      expiresAt: new Date(Date.now() + 60_000),
      id: "invitation-manager-roles",
      managerProfileId: "manager-1",
      status: "PENDING",
      targetType: "MANAGER",
      usedAt: null,
      workerProfileId: null
    });

    // login as a fresh unbound user
    const loginResponse = await request(app.getHttpServer())
      .post("/auth/wechat/login")
      .send({ code: "manager-roles-code" })
      .expect(201);

    // bind with the invitation
    await request(app.getHttpServer())
      .post("/auth/bind")
      .set("Authorization", `Bearer ${loginResponse.body.accessToken}`)
      .send({ invitationCode: "invite-manager-roles" })
      .expect(201)
      .expect({ profileId: "manager-1", targetType: "MANAGER" });

    // expect TEAM_LEADER@TEAM role was granted at team scope team-1
    const userId = loginResponse.body.user.id as string;
    expect(prisma.userRoles).toContainEqual({
      userId,
      roleId: "role-TEAM_LEADER",
      scopeType: "TEAM",
      scopeId: "team-1"
    });
  });
});
