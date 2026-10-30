import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

import { AppModule } from "../src/app.module.js";
import { PrismaService } from "../src/infrastructure/database/prisma.service.js";
import { encryptPersonnelName } from "../src/management/personnel-name.js";

const key: string = "ab".repeat(32);
const phone: string = "13800000881";
const realName: string = "测试人员";
const image: Buffer = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQ0AAAAASUVORK5CYII=",
  "base64",
);

describe.skipIf(process.env.DATABASE_FOUNDATION_TEST_URL === undefined)(
  "account onboarding with real HTTP and database",
  (): void => {
    let app: INestApplication;
    let database: PrismaService;
    let uploads: string;

    beforeAll(async (): Promise<void> => {
      const url: string | undefined = process.env.DATABASE_FOUNDATION_TEST_URL;
      if (
        url === undefined ||
        !new URL(url).searchParams
          .get("schema")
          ?.startsWith("database_foundation_")
      )
        throw new Error("Run test:database against an isolated local schema.");
      uploads = await mkdtemp(join(tmpdir(), "hanbo-onboarding-"));
      vi.stubEnv("DATABASE_URL", url);
      vi.stubEnv("UPLOADS_DIR", uploads);
      vi.stubEnv("PERSONNEL_ENCRYPTION_KEY", key);
      const module = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = module.createNestApplication();
      await app.init();
      database = app.get(PrismaService);
    });

    afterAll(async (): Promise<void> => {
      if (app !== undefined) await app.close();
      if (uploads !== undefined)
        await rm(uploads, { recursive: true, force: true });
      vi.unstubAllEnvs();
    });

    for (const targetType of ["WORKER", "MANAGER"] as const) {
      test(`${targetType} cannot bypass profile completion or bind mismatched identity`, async (): Promise<void> => {
        const id: string = `onboarding-${targetType.toLowerCase()}`;
        await database.user.create({ data: { id, openid: id } });
        const session = await database.userSession.create({
          data: {
            userId: id,
            tokenHash: createHash("sha256").update(id).digest("hex"),
            expiresAt: new Date(Date.now() + 3600000),
          },
        });
        const secret: string | undefined = process.env.JWT_ACCESS_TOKEN_SECRET;
        if (secret === undefined)
          throw new Error("JWT secret is required for local HTTP checks.");
        const token: string = await app
          .get(JwtService)
          .signAsync(
            { sid: session.id, sub: id, sv: 1 },
            { secret, expiresIn: 3600 },
          );
        const profile =
          targetType === "WORKER"
            ? await database.workerProfile.create({
                data: {
                  encryptedName: encryptPersonnelName(
                    realName,
                    key,
                    randomBytes(12),
                  ),
                  phone,
                  workType: "木工",
                  realNameStatus: "PENDING",
                  faceProfileStatus: "PENDING",
                  employmentStatus: "ACTIVE",
                },
              })
            : await database.managerProfile.create({
                data: { name: realName, phone, status: "ACTIVE" },
              });
        const invitation = await database.bindingInvitation.create({
          data: {
            codeHash: createHash("sha256").update(id).digest("hex"),
            targetType,
            ...(targetType === "WORKER"
              ? { workerProfileId: profile.id }
              : { managerProfileId: profile.id }),
            createdByUserId: id,
            expiresAt: new Date(Date.now() + 3600000),
          },
        });
        const server = app.getHttpServer();
        await request(server)
          .get("/auth/me")
          .auth(token, { type: "bearer" })
          .expect(200);
        await request(server)
          .get("/account/profile")
          .auth(token, { type: "bearer" })
          .expect(200);
        const blocked = await request(server)
          .get("/me/projects")
          .auth(token, { type: "bearer" })
          .expect(403);
        expect(blocked.body.message).toBe("ACCOUNT_PROFILE_REQUIRED");
        await request(server)
          .post("/auth/bind")
          .auth(token, { type: "bearer" })
          .send({ invitationCode: id })
          .expect(403);
        for (const body of [
          { nickname: "测试" },
          { nickname: "测试", realName: "", phone },
          { nickname: "测试", realName, phone: "123" },
        ])
          await request(server)
            .put("/account/profile")
            .auth(token, { type: "bearer" })
            .send(body)
            .expect(400);
        await request(server)
          .post("/account/avatar")
          .auth(token, { type: "bearer" })
          .attach("file", image, {
            filename: "avatar.png",
            contentType: "image/png",
          })
          .expect(201);
        await request(server)
          .put("/account/profile")
          .auth(token, { type: "bearer" })
          .send({ nickname: "测试", realName: "其他人员", phone })
          .expect(200);
        const mismatched = await request(server)
          .post("/auth/bind")
          .auth(token, { type: "bearer" })
          .send({ invitationCode: id })
          .expect(403);
        expect(mismatched.body.message).toBe("ACCOUNT_IDENTITY_MISMATCH");
        expect(
          (
            await database.bindingInvitation.findUniqueOrThrow({
              where: { id: invitation.id },
            })
          ).status,
        ).toBe("PENDING");
        await request(server)
          .put("/account/profile")
          .auth(token, { type: "bearer" })
          .send({ nickname: "测试", realName, phone: "13800000882" })
          .expect(200);
        await request(server)
          .post("/auth/bind")
          .auth(token, { type: "bearer" })
          .send({ invitationCode: id })
          .expect(403);
        const saved = await request(server)
          .put("/account/profile")
          .auth(token, { type: "bearer" })
          .send({ nickname: "测试", realName, phone })
          .expect(200);
        expect(saved.body).toMatchObject({
          realName,
          phone,
          phoneMasked: "138****0881",
        });
        expect(
          (await database.user.findUniqueOrThrow({ where: { id } }))
            .encryptedRealName,
        ).not.toContain(realName);
        const unbound = await request(server)
          .get("/me/projects")
          .auth(token, { type: "bearer" })
          .expect(403);
        expect(unbound.body.message).toBe("ACCOUNT_BINDING_REQUIRED");
        await request(server)
          .post("/auth/bind")
          .auth(token, { type: "bearer" })
          .send({ invitationCode: id })
          .expect(201);
        if (targetType === "WORKER") {
          const registration = {
            idNumber: "11010519491231002X",
            residentialAddress: "测试市测试街道 1 号",
            emergencyContactName: "测试联系人",
            emergencyContactPhone: "13800000883",
            hasLongTermMedication: false,
            medicationDetails: "",
            hasPersonalInsurance: false,
            insuranceDetails: "",
            payrollBankCard: "6222020000000000000",
          };
          const blockedWorker = await request(server)
            .get("/me/projects")
            .auth(token, { type: "bearer" })
            .expect(403);
          expect(blockedWorker.body.message).toBe(
            "WORKER_REGISTRATION_REQUIRED",
          );
          const account = await request(server)
            .get("/account/profile")
            .auth(token, { type: "bearer" })
            .expect(200);
          expect(account.body.workerRegistration).toBe("REQUIRED");
          expect(JSON.stringify(account.body)).not.toContain("payrollBankCard");
          for (const partial of [
            {},
            { ...registration, idNumber: "110105194912310021" },
            { ...registration, residentialAddress: "" },
            { ...registration, hasLongTermMedication: null },
            { ...registration, hasLongTermMedication: true },
            { ...registration, hasPersonalInsurance: true },
            { ...registration, payrollBankCard: "123" },
          ])
            await request(server)
              .put("/account/worker-registration")
              .auth(token, { type: "bearer" })
              .send(partial)
              .expect(400);
          const submitted = await request(server)
            .put("/account/worker-registration")
            .auth(token, { type: "bearer" })
            .send(registration)
            .expect(200);
          expect(submitted.body.workerRegistration).toBe("COMPLETE");
          const readback = await request(server)
            .get("/account/worker-registration")
            .auth(token, { type: "bearer" })
            .expect(200);
          expect(readback.headers["cache-control"]).toBe("no-store");
          expect(readback.body).toEqual(registration);
          const stored = await database.workerProfile.findUniqueOrThrow({
            where: { id: profile.id },
          });
          expect(stored.registrationCompletedAt).not.toBeNull();
          expect(stored.encryptedIdNumber).not.toContain(registration.idNumber);
          expect(stored.encryptedResidentialAddress).not.toContain(
            registration.residentialAddress,
          );
          expect(stored.encryptedPayrollBankCard).not.toContain(
            registration.payrollBankCard,
          );
          expect(stored.hasLongTermMedication).toBe(false);
          const declared = {
            ...registration,
            hasLongTermMedication: true,
            medicationDetails: "测试健康申报",
            hasPersonalInsurance: true,
            insuranceDetails: "测试保险，2026 年至 2027 年",
          };
          await request(server)
            .put("/account/worker-registration")
            .auth(token, { type: "bearer" })
            .send(declared)
            .expect(200);
          const secured = await database.workerProfile.findUniqueOrThrow({
            where: { id: profile.id },
          });
          expect(secured.encryptedMedicationDetails).not.toContain(
            declared.medicationDetails,
          );
          expect(secured.encryptedInsuranceDetails).not.toContain(
            declared.insuranceDetails,
          );
        } else {
          await request(server)
            .get("/account/worker-registration")
            .auth(token, { type: "bearer" })
            .expect(403);
        }
        await request(server)
          .get("/me/projects")
          .auth(token, { type: "bearer" })
          .expect(200);
        await request(server)
          .put("/account/profile")
          .auth(token, { type: "bearer" })
          .send({ nickname: "测试", realName: "其他人员", phone })
          .expect(403);
        const restored = await request(server)
          .get("/account/profile")
          .auth(token, { type: "bearer" })
          .expect(200);
        expect(restored.body).toMatchObject({ realName, phone, isBound: true });
        await database.user.update({
          where: { id },
          data: { encryptedRealName: null },
        });
        await request(server)
          .get("/me/projects")
          .auth(token, { type: "bearer" })
          .expect(403);
        await request(server)
          .put("/account/profile")
          .auth(token, { type: "bearer" })
          .send({ nickname: "测试", realName, phone })
          .expect(200);
        await request(server)
          .get("/me/projects")
          .auth(token, { type: "bearer" })
          .expect(200);
      });
    }
  },
);
