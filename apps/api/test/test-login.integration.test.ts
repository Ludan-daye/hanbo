import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

import { AppModule } from "../src/app.module.js";
import { provisionTestAccounts } from "../src/auth/provision-test-accounts.js";
import { TEST_ACCOUNTS, TEST_ACCOUNT_CODES } from "../src/auth/test-accounts.js";
import { API_ENV } from "../src/config/env.module.js";
import type { ApiEnv } from "../src/config/env.js";
import { PrismaService } from "../src/infrastructure/database/prisma.service.js";

const passcode: string = "isolated-integration-passcode";

describe.skipIf(process.env.DATABASE_FOUNDATION_TEST_URL === undefined)("test login with real HTTP and database", () => {
  let app: INestApplication;
  let database: PrismaService;
  let uploads: string;

  beforeAll(async (): Promise<void> => {
    const url: string | undefined = process.env.DATABASE_FOUNDATION_TEST_URL;
    if (url === undefined || !new URL(url).searchParams.get("schema")?.startsWith("database_foundation_"))
      throw new Error("Run test:database against an isolated local schema.");
    uploads = await mkdtemp(join(tmpdir(), "hanbo-test-login-"));
    vi.stubEnv("DATABASE_URL", url);
    vi.stubEnv("UPLOADS_DIR", uploads);
    vi.stubEnv("DEPLOYMENT_ENV", "test");
    vi.stubEnv("TEST_LOGIN_SECRET_HASH", createHash("sha256").update(passcode).digest("hex"));
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
    database = app.get(PrismaService);
    for (const code of TEST_ACCOUNT_CODES) {
      const account = TEST_ACCOUNTS[code];
      const role = await database.role.findUniqueOrThrow({ where: { code: account.roleCode } });
      await database.user.create({ data: {
        openid: code, isBound: true,
        roles: { create: { roleId: role.id, scopeId: "database-test-project", scopeType: "PROJECT" } },
        ...(code === "dev-worker"
          ? { workerProfile: { create: { encryptedName: "legacy-placeholder", phone: account.phone,
              employmentStatus: "ACTIVE", realNameStatus: "PENDING", faceProfileStatus: "PENDING", workType: "木工" } } }
          : { managerProfile: { create: { name: account.name, phone: account.phone, status: "ACTIVE" } } }),
      } });
    }
    await provisionTestAccounts(database, app.get<ApiEnv>(API_ENV).PERSONNEL_ENCRYPTION_KEY, uploads);
  });

  afterAll(async (): Promise<void> => {
    if (app !== undefined) await app.close();
    if (uploads !== undefined) await rm(uploads, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  test("rejects unknown accounts, wrong credentials and incomplete profiles", async (): Promise<void> => {
    const server = app.getHttpServer();
    const sessionCount: number = await database.userSession.count();
    await request(server).post("/auth/test/login").send({ account: "real-wechat-account", passcode }).expect(400);
    await request(server).post("/auth/test/login").send({ account: "dev-worker", passcode: "wrong" }).expect(401);
    const user = await database.user.findUniqueOrThrow({ where: { openid: "dev-worker" } });
    await database.user.update({ where: { id: user.id }, data: { encryptedRealName: null } });
    await request(server).post("/auth/test/login").send({ account: "dev-worker", passcode }).expect(403);
    await database.user.update({ where: { id: user.id }, data: { encryptedRealName: user.encryptedRealName } });
    expect(await database.userSession.count()).toBe(sessionCount);
  });

  test.each(TEST_ACCOUNT_CODES)("%s logs in, saves its matching identity, refreshes and logs out", async (account): Promise<void> => {
    const server = app.getHttpServer();
    const login = await request(server).post("/auth/test/login").send({ account, passcode }).expect(201);
    expect(login.headers["cache-control"]).toBe("no-store");
    const token: string = login.body.accessToken;
    const me = await request(server).get("/auth/me").auth(token, { type: "bearer" }).expect(200);
    expect(me.body.roles.highestRoleCode).toBe(TEST_ACCOUNTS[account].roleCode);
    expect(me.headers["cache-control"]).toBe("no-store");
    await request(server).get("/auth/me").auth(token, { type: "bearer" }).expect(200);
    const profile = await request(server).get("/account/profile").auth(token, { type: "bearer" }).expect(200);
    expect(profile.body.realName).toBe(TEST_ACCOUNTS[account].name);
    expect(profile.body.avatarDataUrl).toMatch(/^data:image\/png;base64,/);
    const saved = await request(server).put("/account/profile").auth(token, { type: "bearer" })
      .send({ realName: profile.body.realName, nickname: profile.body.nickname, phone: profile.body.phone }).expect(200);
    expect(saved.body.realName).toBe(TEST_ACCOUNTS[account].name);
    if (account === "dev-worker") {
      const blocked = await request(server).get("/me/projects").auth(token, { type: "bearer" }).expect(403);
      expect(blocked.body.message).toBe("WORKER_REGISTRATION_REQUIRED");
      await request(server).put("/account/worker-registration").auth(token, { type: "bearer" }).send({
        idNumber: "110105194912310011", residentialAddress: "测试市测试街道 2 号",
        emergencyContactName: "测试联系人", emergencyContactPhone: "13800000884",
        hasLongTermMedication: false, medicationDetails: "", hasPersonalInsurance: false, insuranceDetails: "",
        payrollBankCard: "6222020000000000000",
      }).expect(200);
    }
    await request(server).get("/me/projects").auth(token, { type: "bearer" }).expect(200);
    const refreshed = await request(server).post("/auth/refresh").send({ refreshToken: login.body.refreshToken }).expect(201);
    await request(server).get("/auth/me").auth(refreshed.body.accessToken, { type: "bearer" }).expect(200);
    await request(server).post("/auth/logout").auth(token, { type: "bearer" }).expect(201);
    await request(server).post("/auth/refresh").send({ refreshToken: login.body.refreshToken }).expect(401);
    await request(server).get("/auth/me").auth(token, { type: "bearer" }).expect(401);
  });

  test("normal deployments have no working test-login entrance", async (): Promise<void> => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(API_ENV).useValue({ ...app.get<ApiEnv>(API_ENV), DEPLOYMENT_ENV: "production", TEST_LOGIN_SECRET_HASH: "" }).compile();
    const disabled: INestApplication = module.createNestApplication();
    try {
      await disabled.init();
      await request(disabled.getHttpServer()).post("/auth/test/login").send({ account: "dev-worker", passcode }).expect(404);
    } finally { await disabled.close(); }
  });
});
