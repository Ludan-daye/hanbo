import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { defaultWorktimeRule, overtimePointCode } from "@construction/domain";
import { AppModule } from "../src/app.module.js";
import { API_ENV } from "../src/config/env.module.js";
import { loadEnv } from "../src/config/env.js";
import { PrismaService } from "../src/infrastructure/database/prisma.service.js";
import { encryptPersonnelName } from "../src/management/personnel-name.js";
import { WorktimeService } from "../src/worktime/worktime.service.js";

const projectId = "hours-project";
const base = `/attendance/projects/${projectId}`;
const rulePath = `/worktime/projects/${projectId}`;
const position = { latitude: "31", longitude: "121", locationAccuracyM: "5" };

describe.skipIf(process.env.DATABASE_FOUNDATION_TEST_URL === undefined)("hour accounting over real HTTP and database", () => {
  let app: INestApplication;
  let db: PrismaService;
  let uploads: string;
  let photo: { objectKey: string; hash: string };
  const tokens = new Map<string, string>();
  const token = (id: string): string => { const value = tokens.get(id); if (!value) throw new Error(`Missing actor: ${id}`); return value; };
  const confirm = async (pointCode: string): Promise<string> => {
    const notice = await request(app.getHttpServer()).get(`${base}/safety`).auth(token("worker"), { type: "bearer" }).query({ pointCode }).expect(200);
    const receipt = await request(app.getHttpServer()).post(`${base}/safety-confirmations`).auth(token("worker"), { type: "bearer" }).send({ pointCode, baselineVersion: notice.body.baselineVersion, briefingIds: notice.body.briefings.map((row: { id: string }) => row.id) }).expect(201);
    return String(receipt.body.id);
  };
  const body = (date: string, code: string, confirmation: string | undefined) => ({
    ...position, attendanceDate: date, occurredAt: new Date().toISOString(), pointCode: code,
    safetyConfirmationId: confirmation, sitePhotoObjectKey: photo.objectKey, sitePhotoHash: photo.hash,
    selfieObjectKey: "test/selfie.png", selfieHash: "test-selfie",
  });
  const punch = (date: string, code: string, confirmation: string | undefined): request.Test => request(app.getHttpServer()).post(`${base}/records`).auth(token("worker"), { type: "bearer" }).send(body(date, code, confirmation));

  beforeAll(async () => {
    const url = process.env.DATABASE_FOUNDATION_TEST_URL;
    if (!url || !new URL(url).searchParams.get("schema")?.startsWith("database_foundation_")) throw new Error("Use isolated database integration schema.");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2030-01-07T08:00:00+08:00"));
    uploads = await mkdtemp(join(tmpdir(), "hanbo-hours-"));
    const env = loadEnv({ ...process.env, DATABASE_URL: url, NODE_ENV: "test", UPLOADS_DIR: uploads, FACE_DEV_STUB: "true", TENCENT_FACE_MODE: "WECHAT_NATIVE", TENCENT_FACE_RULE_ID: "", TENCENT_SECRET_ID: "", TENCENT_SECRET_KEY: "", PERSONNEL_ENCRYPTION_KEY: "ab".repeat(32) });
    app = (await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(API_ENV).useValue(env).compile()).createNestApplication();
    await app.listen(0, "127.0.0.1"); db = app.get(PrismaService);
    await db.company.create({ data: { id: "hours-company", name: "工时测试公司", status: "ACTIVE" } });
    await db.project.create({ data: { id: projectId, companyId: "hours-company", name: "工时测试工地", address: "测试工地", centerLatitude: 31, centerLongitude: 121, geofenceRadiusM: 300, status: "ACTIVE", plannedStartDate: new Date("2030-01-01") } });
    for (const actor of ["admin", "worker", "other"]) {
      const id = `hours-${actor}`;
      const encryptedName = encryptPersonnelName(actor, env.PERSONNEL_ENCRYPTION_KEY, randomBytes(12));
      await db.user.create({ data: { id, openid: id, isBound: true, encryptedRealName: encryptedName, phone: `1380000090${["admin", "worker", "other"].indexOf(actor)}`, nickname: actor, avatarObjectKey: "test/avatar.png" } });
      if (actor === "worker") await db.workerProfile.create({ data: { id, userId: id, encryptedName, phone: "13800000901", workType: "电工", employmentStatus: "ACTIVE", faceProfileStatus: "APPROVED", realNameStatus: "VERIFIED", registrationCompletedAt: new Date(), projectMemberships: { create: { id: "hours-member", projectId, status: "ACTIVE", enteredAt: new Date("2030-01-01"), projectRoleLabel: "电工" } } } });
      const role = await db.role.findUniqueOrThrow({ where: { code: actor === "worker" ? "WORKER" : "PROJECT_ADMIN" } });
      await db.userRole.create({ data: { userId: id, roleId: role.id, scopeType: "PROJECT", scopeId: actor === "other" ? "hours-other-project" : projectId } });
      const session = await db.userSession.create({ data: { userId: id, tokenHash: createHash("sha256").update(id).digest("hex"), expiresAt: new Date("2031-01-01") } });
      tokens.set(actor, await app.get(JwtService).signAsync({ sub: id, sid: session.id, sv: 1 }, { secret: env.JWT_ACCESS_TOKEN_SECRET, expiresIn: 86400 * 365 }));
    }
    const upload = await request(app.getHttpServer()).post("/uploads").auth(token("worker"), { type: "bearer" }).attach("file", Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jSAAAAABJRU5ErkJggg==", "base64"), { filename: "site.png", contentType: "image/png" }).expect(201);
    photo = upload.body as { objectKey: string; hash: string };
  });
  afterAll(async () => { vi.useRealTimers(); if (app) await app.close(); if (uploads) await rm(uploads, { recursive: true, force: true }); });

  test("scope checks and immutable future rules reject stale concurrent saves", async () => {
    const server = app.getHttpServer();
    await request(server).get(rulePath).auth(token("other"), { type: "bearer" }).expect(403);
    const baseline = await request(server).get(rulePath).auth(token("admin"), { type: "bearer" }).expect(200);
    expect(baseline.body.current.version).toBe(0);
    const input = { expectedVersion: 0, startsOn: "2030-01-08", config: { ...defaultWorktimeRule, lunchStart: "12:00", lunchEnd: "13:00" } };
    await request(server).put(rulePath).auth(token("worker"), { type: "bearer" }).send(input).expect(403);
    await request(server).put(rulePath).auth(token("admin"), { type: "bearer" }).send({ ...input, startsOn: "2030-01-07" }).expect(400);
    await request(server).put(rulePath).auth(token("admin"), { type: "bearer" }).send({ ...input, config: { ...input.config, lunchEnd: "11:00" } }).expect(400);
    const responses = await Promise.all([1, 2].map(() => request(server).put(rulePath).auth(token("admin"), { type: "bearer" }).send(input)));
    expect(responses.map((row) => row.status).sort()).toEqual([200, 409]);
    expect((await app.get(WorktimeService).get(projectId)).current.version).toBe(0);
  });

  test("normal punches deduct lunch consistently in live result and report", async () => {
    vi.setSystemTime(new Date("2030-01-08T08:00:00+08:00"));
    await punch("2030-01-08", "START", await confirm("START")).expect(201);
    vi.setSystemTime(new Date("2030-01-08T20:00:00+08:00"));
    const result = await punch("2030-01-08", "END", await confirm("END")).expect(201);
    expect(result.body.result.workedMinutes).toBe(660);
    const today = await request(app.getHttpServer()).get(`/me/projects/${projectId}/attendance-today`).auth(token("worker"), { type: "bearer" }).expect(200);
    expect(today.body.result.workedMinutes).toBe(660);
    const report = await request(app.getHttpServer()).get(`/reports/projects/${projectId}/daily`).query({ date: "2030-01-08" }).auth(token("admin"), { type: "bearer" }).expect(200);
    expect(report.body.totals).toMatchObject({ normalMinutes: 540, overtimeMinutes: 120, unclassifiedMinutes: 0, workedMinutes: 660 });
  });

  test("overtime requires safety and geofence and rejects duplicate start", async () => {
    vi.setSystemTime(new Date("2030-01-09T18:00:00+08:00"));
    const code = overtimePointCode("2030-01-09", "START");
    await punch("2030-01-09", code, undefined).expect(403);
    const confirmation = await confirm(code);
    await request(app.getHttpServer()).post(`${base}/records`).auth(token("worker"), { type: "bearer" }).send({ ...body("2030-01-09", code, confirmation), latitude: "32" }).expect(400);
    const result = await punch("2030-01-09", code, confirmation).expect(201);
    expect(result.body.result.workedMinutes).toBe(0);
    await punch("2030-01-09", code, confirmation).expect(409);
    vi.setSystemTime(new Date("2030-01-09T20:30:00+08:00"));
    const end = overtimePointCode("2030-01-09", "END");
    const finished = await punch("2030-01-09", end, await confirm(end)).expect(201);
    expect(finished.body.result.workedMinutes).toBe(150);
  });

  test("overnight makeup requires an actual start and recomputes both dates", async () => {
    vi.setSystemTime(new Date("2030-01-10T23:00:00+08:00"));
    const code = overtimePointCode("2030-01-10", "START");
    await punch("2030-01-10", code, await confirm(code)).expect(201);
    vi.setSystemTime(new Date("2030-01-11T03:00:00+08:00"));
    const body = { attendanceDate: "2030-01-11", requestedOccurredAt: "2030-01-11T02:00:00+08:00", reason: "退场时手机断电", pointCode: overtimePointCode("2030-01-10", "END") };
    await request(app.getHttpServer()).post(`/makeups/projects/${projectId}/requests`).auth(token("worker"), { type: "bearer" }).send({ ...body, pointCode: overtimePointCode("2030-01-11", "END") }).expect(400);
    const submitted = await request(app.getHttpServer()).post(`/makeups/projects/${projectId}/requests`).auth(token("worker"), { type: "bearer" }).send(body).expect(201);
    const reviewed = await request(app.getHttpServer()).post(`/makeups/requests/${submitted.body.id}/approve`).auth(token("admin"), { type: "bearer" }).send({ approvalReason: "现场记录核实" }).expect(201);
    expect(reviewed.body.result.workedMinutes).toBe(120);
    const rows = await db.attendanceResult.findMany({ where: { projectId, participantId: "hours-worker", attendanceDate: { in: [new Date("2030-01-10"), new Date("2030-01-11")] } }, orderBy: { attendanceDate: "asc" } });
    expect(rows.map((row) => row.workedMinutes)).toEqual([60, 120]);
    await request(app.getHttpServer()).post(`/makeups/requests/${submitted.body.id}/approve`).auth(token("admin"), { type: "bearer" }).send({ approvalReason: "重复核实" }).expect(409);
  });
});
