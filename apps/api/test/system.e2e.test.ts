import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { PrismaService } from "../src/infrastructure/database/prisma.service.js";
import { SystemModule } from "../src/system/system.module.js";

// Platform company endpoints (system admin plan phase 1) over HTTP, against an in-memory
// Prisma: only SYSTEM_ADMIN gets in; credit code format and uniqueness; optimistic updates.
// Appointing and revoking administrators run against a real database
// (system-admin.integration.test.ts).

type RoleCode = "SYSTEM_ADMIN" | "COMPANY_ADMIN" | "PROJECT_ADMIN" | "TEAM_LEADER" | "WORKER";
type ScopeType = "GLOBAL" | "COMPANY" | "PROJECT" | "TEAM";

type CompanyRecord = {
  address: string | null;
  contactName: string | null;
  contactPhone: string | null;
  createdAt: Date;
  creditCode: string | null;
  id: string;
  name: string;
  shortName: string | null;
  status: string;
  updatedAt: Date;
};

type Where = Record<string, unknown>;

/** A stored operation-log row, as the platform log reads it (phase 4). */
type AuditRow = {
  action: string;
  actorUserId: string | null;
  companyId: string | null;
  createdAt: Date;
  entityId: string;
  entityType: string;
  id: string;
  metadata: unknown;
  projectId: string | null;
};

const PERMISSIONS: Readonly<Record<RoleCode, readonly string[]>> = {
  COMPANY_ADMIN: ["company.manage", "project.create"],
  PROJECT_ADMIN: ["project.manage"],
  SYSTEM_ADMIN: ["system.manage"],
  TEAM_LEADER: ["team.manage"],
  WORKER: ["attendance.submit"],
};

const text = (value: unknown): string => (typeof value === "string" ? value : "");

/** Matches the handful of company filters the service uses. */
const companyMatches = (company: CompanyRecord, where: Where): boolean => {
  const ids = (where.id as { in?: string[] } | undefined)?.in;
  if (ids !== undefined && !ids.includes(company.id)) return false;
  const not = (where.id as { not?: string } | undefined)?.not;
  if (not !== undefined && company.id === not) return false;
  const name = where.name as { equals?: string } | undefined;
  if (name?.equals !== undefined && company.name.toLowerCase() !== name.equals.toLowerCase()) return false;
  if (where.creditCode !== undefined && company.creditCode !== where.creditCode) return false;
  if (where.status !== undefined && company.status !== where.status) return false;
  return true;
};

class SystemPrismaDouble {
  readonly companies: CompanyRecord[] = [];
  readonly auditLogs: { action: string; companyId: string | null; metadata: unknown }[] = [];
  /** Rows the platform log reads; written by the tests, not by auditLog.create. */
  readonly auditRows: AuditRow[] = [];
  readonly sessions = new Map<string, { userId: string }>();
  readonly assignments: { roleCode: RoleCode; scopeId: string; scopeType: ScopeType; userId: string }[] = [];
  private sequence = 0;

  readonly userSession = {
    findUnique: async (args: { where: { id: string } }) => {
      const session = this.sessions.get(args.where.id);
      if (session === undefined) return null;
      return {
        expiresAt: new Date(Date.now() + 60_000),
        id: args.where.id,
        revokedAt: null,
        user: {
          avatarObjectKey: "test/avatar.png",
          encryptedRealName: "encrypted",
          id: session.userId,
          isBound: true,
          nickname: "Test",
          openid: session.userId,
          phone: "13800000000",
          sessionVersion: 1,
          status: "ACTIVE",
          workerProfile: null,
        },
        userId: session.userId,
      };
    },
  };

  readonly role = {
    findMany: async () =>
      (Object.keys(PERMISSIONS) as RoleCode[]).map((code) => ({
        code,
        permissions: PERMISSIONS[code].map((permission) => ({ permission: { code: permission } })),
      })),
  };

  readonly userRole = {
    findMany: async (args: { where: { userId: string } }) =>
      this.assignments
        .filter((row) => row.userId === args.where.userId)
        .map((row) => ({ role: { code: row.roleCode }, scopeId: row.scopeId, scopeType: row.scopeType })),
  };

  readonly company = {
    create: async (args: { data: Omit<CompanyRecord, "createdAt" | "id" | "updatedAt"> }): Promise<CompanyRecord> => {
      this.sequence += 1;
      const now = new Date(Date.UTC(2026, 10, 22, 1, 0, this.sequence));
      const company: CompanyRecord = { ...args.data, createdAt: now, id: `company-${this.sequence}`, updatedAt: now };
      this.companies.push(company);
      return company;
    },
    findFirst: async (args: { where: Where }): Promise<CompanyRecord | null> =>
      this.companies.find((company) => companyMatches(company, args.where)) ?? null,
    findMany: async (args: { where: Where }): Promise<CompanyRecord[]> =>
      this.companies
        .filter((company) => companyMatches(company, args.where))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    findUnique: async (args: { where: { id: string } }): Promise<CompanyRecord | null> =>
      this.companies.find((company) => company.id === args.where.id) ?? null,
    updateMany: async (args: { data: Partial<CompanyRecord>; where: { id: string; status?: string; updatedAt: Date } }) => {
      const company = this.companies.find(
        (row) =>
          row.id === args.where.id &&
          row.updatedAt.getTime() === args.where.updatedAt.getTime() &&
          (args.where.status === undefined || row.status === args.where.status),
      );
      if (company === undefined) return { count: 0 };
      Object.assign(company, args.data);
      return { count: 1 };
    },
  };

  readonly project = {
    findMany: async (args: { where: { id: { in: string[] } } }) =>
      args.where.id.in.map((id) => ({ id, name: `项目 ${id}` })),
    groupBy: async (args: { where: { companyId: { in: string[] } } }) =>
      args.where.companyId.in.includes("company-1")
        ? [
            { _count: { _all: 2 }, companyId: "company-1", status: "ACTIVE" },
            { _count: { _all: 1 }, companyId: "company-1", status: "PREPARING" },
          ]
        : [],
  };

  readonly companyManagerMember = {
    findMany: async (args: { where: { companyId: { in: string[] } } }) =>
      args.where.companyId.in.includes("company-1")
        ? [
            {
              appointedAt: new Date("2026-11-22T01:00:00.000Z"),
              companyId: "company-1",
              id: "member-1",
              invitation: null,
              invitationId: null,
              managerProfile: { id: "profile-1", name: "张三", phone: "13900000001", userId: "user-zhang" },
              managerProfileId: "profile-1",
              status: "ACTIVE",
            },
          ]
        : [],
  };

  /** Accounts: only enough for the refusals that come before any change, and actor names. */
  readonly user = {
    findMany: async (args: { where: { id: { in: string[] } } }) =>
      args.where.id.in.map((id) => ({ encryptedRealName: null, id, nickname: `昵称 ${id}` })),
    findUnique: async (args: { where: { id: string } }) => {
      const roles = this.assignments.filter((row) => row.userId === args.where.id);
      if (roles.length === 0) return null;
      return {
        createdAt: new Date("2026-11-01T00:00:00.000Z"),
        encryptedRealName: null,
        id: args.where.id,
        isBound: true,
        lastLoginAt: null,
        managerProfile: { id: `profile-${args.where.id}`, name: "某人", phone: "13900000009" },
        nickname: null,
        phone: "13900000009",
        roles: roles.map((row) => ({ createdAt: new Date(), role: { code: row.roleCode }, scopeId: row.scopeId, scopeType: row.scopeType })),
        status: "ACTIVE",
        workerProfile: null,
      };
    },
  };

  readonly auditLog = {
    findMany: async (args: { take: number; where: { action?: { in: string[] }; actorUserId?: string; companyId?: string } }) =>
      this.auditRows
        .filter(
          (row) =>
            (args.where.action === undefined || args.where.action.in.includes(row.action)) &&
            (args.where.actorUserId === undefined || row.actorUserId === args.where.actorUserId) &&
            (args.where.companyId === undefined || row.companyId === args.where.companyId),
        )
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, args.take),
    create: async (args: { data: { action: string; companyId?: string | null; metadata: unknown } }) => {
      this.auditLogs.push({ action: args.data.action, companyId: args.data.companyId ?? null, metadata: args.data.metadata });
      return args.data;
    },
  };

  // Nothing the platform-log rows below point at needs a name besides companies, projects and users.
  readonly safetyViolation = { findMany: async () => [] };
  readonly projectWorkerMember = { findMany: async () => [] };
  readonly projectManagerMember = { findMany: async () => [] };
  readonly workerProfile = { findMany: async () => [] };
  readonly managerProfile = { findMany: async () => [] };
  readonly team = { findMany: async () => [] };
  readonly teamWorkTask = { findMany: async () => [] };

  /** The single platform settings row (phase 5); missing until first read, like `db push`. */
  setting: { announcement: string; id: string; supportPhone: string; updatedAt: Date; updatedByUserId: string | null } | null = null;

  readonly platformSetting = {
    createMany: async () => {
      if (this.setting === null)
        this.setting = { announcement: "", id: "GLOBAL", supportPhone: "", updatedAt: new Date("2026-11-23T01:00:00.000Z"), updatedByUserId: null };
      return { count: 1 };
    },
    findUnique: async () => (this.setting === null ? null : { ...this.setting }),
    findUniqueOrThrow: async () => {
      if (this.setting === null) throw new Error("missing");
      return { ...this.setting };
    },
    updateMany: async (args: { data: { announcement: string; supportPhone: string; updatedAt: Date; updatedByUserId: string }; where: { updatedAt: Date } }) => {
      if (this.setting === null || this.setting.updatedAt.getTime() !== args.where.updatedAt.getTime()) return { count: 0 };
      Object.assign(this.setting, args.data);
      return { count: 1 };
    },
  };

  async $transaction<T>(callback: (transaction: SystemPrismaDouble) => Promise<T>): Promise<T> {
    return callback(this);
  }

  signIn(userId: string, roleCode: RoleCode, scopeType: ScopeType, scopeId: string): string {
    const sessionId = `session-${userId}`;
    this.sessions.set(sessionId, { userId });
    this.assignments.push({ roleCode, scopeId, scopeType, userId });
    return sessionId;
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

const VALID_CODE = "91310115MA1K3YJ12X";

describe("platform companies (/system)", (): void => {
  let app: INestApplication;
  let prisma: SystemPrismaDouble;
  const tokens = new Map<string, string>();

  const as = (user: string) => ({
    get: (path: string) => request(app.getHttpServer()).get(path).auth(tokens.get(user)!, { type: "bearer" }),
    post: (path: string, body: object = {}) =>
      request(app.getHttpServer()).post(path).auth(tokens.get(user)!, { type: "bearer" }).send(body),
    put: (path: string, body: object) =>
      request(app.getHttpServer()).put(path).auth(tokens.get(user)!, { type: "bearer" }).send(body),
  });

  beforeEach(async (): Promise<void> => {
    applyTestEnv();
    prisma = new SystemPrismaDouble();
    const sessions = {
      company: prisma.signIn("user-company", "COMPANY_ADMIN", "COMPANY", "company-1"),
      project: prisma.signIn("user-project", "PROJECT_ADMIN", "PROJECT", "project-1"),
      system: prisma.signIn("user-system", "SYSTEM_ADMIN", "GLOBAL", "GLOBAL"),
      worker: prisma.signIn("user-worker", "WORKER", "PROJECT", "project-1"),
    };
    // Another super administrator, never signed in here.
    prisma.assignments.push({ roleCode: "SYSTEM_ADMIN", scopeId: "GLOBAL", scopeType: "GLOBAL", userId: "user-other-system" });
    const moduleRef = await Test.createTestingModule({ imports: [SystemModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, "127.0.0.1");
    for (const [user, sessionId] of Object.entries(sessions))
      tokens.set(
        user,
        await app
          .get(JwtService)
          .signAsync({ sid: sessionId, sub: `user-${user}`, sv: 1 }, { expiresIn: 900, secret: process.env.JWT_ACCESS_TOKEN_SECRET! }),
      );
  });

  afterEach(async (): Promise<void> => {
    await app.close();
  });

  test("company and project administrators get 403 on every platform endpoint", async (): Promise<void> => {
    await as("system").post("/system/companies", { name: "瀚渤建设" }).expect(201);
    for (const user of ["company", "project"]) {
      await as(user).get("/system/companies").expect(403);
      await as(user).post("/system/companies", { name: "别的公司" }).expect(403);
      await as(user).get("/system/companies/company-1").expect(403);
      await as(user).put("/system/companies/company-1", { name: "改名" }).expect(403);
      await as(user).get("/system/companies/company-1/admin-candidates").expect(403);
      await as(user).post("/system/companies/company-1/admins", { managerProfileId: "profile-1" }).expect(403);
      await as(user).post("/system/companies/company-1/admins/member-1/revoke").expect(403);
      await as(user).post("/system/companies/company-1/admins/member-1/invitation").expect(403);
      await as(user).post("/system/companies/company-1/status", { status: "SUSPENDED" }).expect(403);
    }
    expect(prisma.companies).toHaveLength(1);
  });

  test("a new company: name required and unique, credit code 18 characters and unique", async (): Promise<void> => {
    const created = await as("system")
      .post("/system/companies", {
        address: " 上海市浦东新区 ",
        contactName: "王经理",
        contactPhone: "13800000009",
        creditCode: VALID_CODE.toLowerCase(),
        name: " 瀚渤建设 ",
        shortName: "",
      })
      .expect(201);
    expect(created.body).toMatchObject({
      activeProjectCount: 2,
      address: "上海市浦东新区",
      admins: [{ isBound: true, memberId: "member-1", name: "张三", phone: "13900000001", invitation: null }],
      creditCode: VALID_CODE,
      name: "瀚渤建设",
      projectCount: 3,
      shortName: null,
      status: "ACTIVE",
    });
    expect(prisma.auditLogs).toEqual([
      { action: "COMPANY_CREATED", companyId: "company-1", metadata: { companyId: "company-1", name: "瀚渤建设" } },
    ]);

    const fail = async (body: object, status: number, message: string): Promise<void> => {
      const response = await as("system").post("/system/companies", body).expect(status);
      expect(response.body.message).toBe(message);
    };
    await fail({ name: "瀚渤建设" }, 409, "COMPANY_NAME_EXISTS");
    await fail({ name: "另一家", creditCode: VALID_CODE }, 409, "COMPANY_CREDIT_CODE_EXISTS");
    await fail({ name: "另一家", creditCode: "91310115MA1K3YJ12" }, 400, "INVALID_CREDIT_CODE");
    await fail({ name: "另一家", creditCode: "91310115MA1K3YO12X" }, 400, "INVALID_CREDIT_CODE");
    await fail({ name: "  " }, 400, "INVALID_SYSTEM_COMPANY_REQUEST");
    // Status is not chosen on creation; suspending is a separate action.
    await fail({ name: "另一家", status: "SUSPENDED" }, 400, "INVALID_SYSTEM_COMPANY_REQUEST");
    await fail({ name: "另一家", contactPhone: "12345" }, 400, "INVALID_SYSTEM_COMPANY_REQUEST");

    const page = await as("system").get("/system/companies").expect(200);
    expect(page.body).toMatchObject({
      items: [{ activeProjectCount: 2, admins: [{ name: "张三" }], id: "company-1", projectCount: 3 }],
      nextCursor: null,
    });
    await as("system").get("/system/companies?status=CLOSED").expect(400);
  });

  test("editing every field, name and credit code included, against the version read", async (): Promise<void> => {
    await as("system").post("/system/companies", { name: "瀚渤建设" }).expect(201);
    const other = await as("system").post("/system/companies", { creditCode: VALID_CODE, name: "别的公司" }).expect(201);
    const read = await as("system").get("/system/companies/company-1").expect(200);
    const body = {
      address: null,
      contactName: null,
      contactPhone: null,
      creditCode: null,
      expectedUpdatedAt: read.body.updatedAt,
      name: "瀚渤建设集团",
      shortName: "瀚渤",
    };

    const clash = await as("system").put("/system/companies/company-1", { ...body, name: "别的公司" }).expect(409);
    expect(clash.body.message).toBe("COMPANY_NAME_EXISTS");
    const codeClash = await as("system").put("/system/companies/company-1", { ...body, creditCode: VALID_CODE }).expect(409);
    expect(codeClash.body.message).toBe("COMPANY_CREDIT_CODE_EXISTS");
    // Every field must be sent, so a missing one never clears it by accident.
    await as("system").put("/system/companies/company-1", { expectedUpdatedAt: read.body.updatedAt, name: "x" }).expect(400);

    const saved = await as("system").put("/system/companies/company-1", body).expect(200);
    expect(saved.body).toMatchObject({ name: "瀚渤建设集团", shortName: "瀚渤" });
    expect(prisma.auditLogs.at(-1)).toEqual({
      action: "COMPANY_UPDATED",
      companyId: "company-1",
      metadata: { changed: ["name", "shortName"], companyId: "company-1", name: "瀚渤建设集团" },
    });

    const stale = await as("system").put("/system/companies/company-1", { ...body, name: "又改了" }).expect(409);
    expect(stale.body.message).toBe("COMPANY_CHANGED_RELOAD_BEFORE_SAVING");
    // The other company keeps its own credit code when saved unchanged.
    await as("system")
      .put(`/system/companies/${text(other.body.id)}`, { ...body, creditCode: VALID_CODE, expectedUpdatedAt: other.body.updatedAt, name: "别的公司" })
      .expect(200);
    await as("system").get("/system/companies/missing").expect(404);
  });

  test("suspending and resuming: against the version and the status read, recorded both ways", async (): Promise<void> => {
    await as("system").post("/system/companies", { name: "瀚渤建设" }).expect(201);
    const read = await as("system").get("/system/companies/company-1").expect(200);
    for (const body of [{ status: "SUSPENDED" }, { expectedUpdatedAt: read.body.updatedAt, status: "CLOSED" }, { expectedUpdatedAt: read.body.updatedAt, name: "x", status: "SUSPENDED" }])
      expect((await as("system").post("/system/companies/company-1/status", body).expect(400)).body.message).toBe("INVALID_SYSTEM_COMPANY_STATUS_REQUEST");

    const suspended = await as("system")
      .post("/system/companies/company-1/status", { expectedUpdatedAt: read.body.updatedAt, status: "SUSPENDED" })
      .expect(201);
    expect(suspended.body).toMatchObject({ id: "company-1", status: "SUSPENDED" });
    expect(suspended.body.updatedAt).not.toBe(read.body.updatedAt);
    // A second tap with the old version, or asking for the state it is already in, changes nothing.
    for (const body of [
      { expectedUpdatedAt: read.body.updatedAt, status: "SUSPENDED" },
      { expectedUpdatedAt: suspended.body.updatedAt, status: "SUSPENDED" },
    ])
      expect((await as("system").post("/system/companies/company-1/status", body).expect(409)).body.message).toBe("COMPANY_CHANGED_RELOAD_BEFORE_SAVING");

    const resumed = await as("system")
      .post("/system/companies/company-1/status", { expectedUpdatedAt: suspended.body.updatedAt, status: "ACTIVE" })
      .expect(201);
    expect(resumed.body.status).toBe("ACTIVE");
    expect(prisma.auditLogs.slice(1)).toEqual([
      { action: "COMPANY_SUSPENDED", companyId: "company-1", metadata: { companyId: "company-1", name: "瀚渤建设" } },
      { action: "COMPANY_RESUMED", companyId: "company-1", metadata: { companyId: "company-1", name: "瀚渤建设" } },
    ]);
    await as("system").post("/system/companies/missing/status", { expectedUpdatedAt: read.body.updatedAt, status: "SUSPENDED" }).expect(404);
  });

  test("appointments must name a profile or a new person with a mobile number", async (): Promise<void> => {
    for (const body of [{}, { name: "李四" }, { name: "李四", phone: "0211234567" }, { managerProfileId: "p", name: "李四", phone: "13900000002" }]) {
      const response = await as("system").post("/system/companies/company-1/admins", body).expect(400);
      expect(response.body.message).toBe("INVALID_COMPANY_ADMIN_REQUEST");
    }
  });

  test("accounts: only SYSTEM_ADMIN; never oneself or another super administrator", async (): Promise<void> => {
    for (const user of ["company", "project"]) {
      await as(user).get("/system/accounts").expect(403);
      await as(user).get("/system/accounts/user-project").expect(403);
      await as(user).post("/system/accounts/user-project/disable").expect(403);
      await as(user).post("/system/accounts/user-project/enable").expect(403);
    }
    for (const query of ["status=SUSPENDED", "role=BOSS", `search=${"长".repeat(31)}`])
      expect((await as("system").get(`/system/accounts?${query}`).expect(400)).body.message).toBe("INVALID_SYSTEM_ACCOUNT_QUERY");

    const self = await as("system").post("/system/accounts/user-system/disable").expect(403);
    expect(self.body.message).toBe("CANNOT_DISABLE_SELF");
    for (const action of ["disable", "enable"]) {
      const other = await as("system").post(`/system/accounts/user-other-system/${action}`).expect(403);
      expect(other.body.message).toBe("SYSTEM_ADMIN_MANAGED_BY_SCRIPT");
    }
    expect((await as("system").post("/system/accounts/nobody/disable").expect(404)).body.message).toBe("ACCOUNT_NOT_FOUND");
    expect(prisma.auditLogs).toEqual([]);
  });

  test("platform log: only SYSTEM_ADMIN; every company and none, by company, type and actor", async (): Promise<void> => {
    await as("system").post("/system/companies", { name: "瀚渤建设" }).expect(201);
    const row = (id: string, minute: number, action: string, fields: Partial<AuditRow> = {}): AuditRow => ({
      action,
      actorUserId: "user-system",
      companyId: null,
      createdAt: new Date(Date.UTC(2026, 10, 23, 1, minute)),
      entityId: id,
      entityType: "test",
      id,
      metadata: {},
      projectId: null,
      ...fields,
    });
    prisma.auditRows.push(
      row("a1", 1, "COMPANY_CREATED", { companyId: "company-1", metadata: { name: "瀚渤建设" } }),
      row("a2", 2, "project.create", { actorUserId: "user-company", companyId: "company-1" }),
      row("a3", 3, "MAKEUP_APPROVED", { actorUserId: "user-company", companyId: "company-2", projectId: "project-2" }),
      row("a4", 4, "ACCOUNT_DISABLED"),
      row("a5", 5, "SAFETY_POLICY_PUBLISHED", { metadata: { startsOn: "2026-12-01", version: 2 } }),
    );

    for (const user of ["company", "project"]) await as(user).get("/system/audit-logs").expect(403);
    for (const query of ["type=BOSS", "cursor=not-a-cursor", `companyId=${"c".repeat(65)}`, "actorUserId="])
      expect((await as("system").get(`/system/audit-logs?${query}`).expect(400)).body.message).toBe("INVALID_AUDIT_LOG_QUERY");

    const all = await as("system").get("/system/audit-logs").expect(200);
    expect(all.headers["cache-control"]).toBe("no-store");
    expect(all.body.nextCursor).toBeNull();
    expect(all.body.items.map((item: { id: string }) => item.id)).toEqual(["a5", "a4", "a3", "a2", "a1"]);
    expect(all.body.items[0]).toMatchObject({
      action: "SAFETY_POLICY_PUBLISHED",
      actorName: "昵称 user-system",
      actorUserId: "user-system",
      category: "PLATFORM",
      companyId: null,
      companyName: null,
      sentence: "昵称 user-system 发布了第 2 版安全信用规则，2026年12月1日起执行",
    });
    expect(all.body.items[2]).toMatchObject({ category: "ATTENDANCE", companyId: "company-2", projectName: "项目 project-2" });
    // What the platform did to a company is 平台 here; the company's own actions stay 公司.
    expect(all.body.items[3]).toMatchObject({ category: "COMPANY", companyName: "瀚渤建设" });
    expect(all.body.items[4]).toMatchObject({ category: "PLATFORM", companyName: "瀚渤建设", sentence: "昵称 user-system 创建了公司“瀚渤建设”" });

    const ids = async (query: string): Promise<string[]> =>
      (await as("system").get(`/system/audit-logs?${query}`).expect(200)).body.items.map((item: { id: string }) => item.id);
    expect(await ids("type=PLATFORM")).toEqual(["a5", "a4", "a1"]);
    expect(await ids("type=COMPANY")).toEqual(["a2"]);
    expect(await ids("companyId=company-1")).toEqual(["a2", "a1"]);
    expect(await ids("actorUserId=user-company")).toEqual(["a3", "a2"]);
    expect(await ids("actorUserId=user-company&companyId=company-2&type=ATTENDANCE")).toEqual(["a3"]);
    expect(await ids("companyId=missing")).toEqual([]);
  });

  test("platform settings: everyone reads them, only SYSTEM_ADMIN saves, against the version read", async (): Promise<void> => {
    for (const user of ["company", "project", "worker"]) {
      await as(user).get("/system/settings").expect(403);
      await as(user).put("/system/settings", { announcement: "x", expectedUpdatedAt: "2026-11-23T01:00:00.000Z", supportPhone: "" }).expect(403);
    }
    // Everyone signed in reads the announcement and the phone; empty before anything is saved.
    const empty = await as("worker").get("/app/settings").expect(200);
    expect(empty.headers["cache-control"]).toBe("no-store");
    expect(empty.body).toEqual({ announcement: "", supportPhone: "" });
    await request(app.getHttpServer()).get("/app/settings").expect(401);

    const read = await as("system").get("/system/settings").expect(200);
    expect(read.body).toEqual({ announcement: "", supportPhone: "", updatedAt: "2026-11-23T01:00:00.000Z" });
    const valid = { announcement: " 进场请佩戴安全帽 ", expectedUpdatedAt: read.body.updatedAt, supportPhone: "400-000-0000" };
    for (const body of [
      { ...valid, announcement: "字".repeat(161) },
      { ...valid, supportPhone: "12345" },
      { ...valid, expectedUpdatedAt: "yesterday" },
      { ...valid, extra: true },
      { announcement: "只有公告" },
    ])
      expect((await as("system").put("/system/settings", body).expect(400)).body.message).toBe("INVALID_PLATFORM_SETTINGS_REQUEST");
    expect(prisma.auditLogs).toEqual([]);

    const saved = await as("system").put("/system/settings", { ...valid, announcement: "字".repeat(160) }).expect(200);
    expect(saved.body).toMatchObject({ announcement: "字".repeat(160), supportPhone: "400-000-0000" });
    expect(saved.body.updatedAt).not.toBe(read.body.updatedAt);
    expect(prisma.setting?.updatedByUserId).toBe("user-system");
    // Saving again with the old version: someone else saved in between.
    expect((await as("system").put("/system/settings", valid).expect(409)).body.message).toBe("PLATFORM_SETTINGS_CHANGED_RELOAD");
    await as("system").put("/system/settings", { ...valid, expectedUpdatedAt: saved.body.updatedAt }).expect(200);
    expect((await as("company").get("/app/settings").expect(200)).body).toEqual({ announcement: "进场请佩戴安全帽", supportPhone: "400-000-0000" });
    expect(prisma.auditLogs).toEqual([
      {
        action: "PLATFORM_SETTINGS_UPDATED",
        companyId: null,
        metadata: { announcement: "字".repeat(160), changed: ["announcement", "supportPhone"], supportPhone: "400-000-0000" },
      },
      {
        action: "PLATFORM_SETTINGS_UPDATED",
        companyId: null,
        metadata: { announcement: "进场请佩戴安全帽", changed: ["announcement"], supportPhone: "400-000-0000" },
      },
    ]);
  });
});
