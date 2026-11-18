import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { describe, expect, test, vi } from "vitest";

import { parseAccountProfileRequest } from "../src/account/account-body.parsers.js";
import { AccountService } from "../src/account/account.service.js";
import type { ApiEnv } from "../src/config/env.js";
import { assertAccountProfileComplete } from "../src/auth/account-onboarding.js";
import type { PrismaService } from "../src/infrastructure/database/prisma.service.js";
import type { ReadableStoragePort } from "../src/infrastructure/storage/storage.types.js";
import type { UploadsService } from "../src/uploads/uploads.service.js";

const complete = {
  openid: "openid-1",
  nickname: null,
  avatarObjectKey: null,
  encryptedRealName: "encrypted-name",
  phone: "13800000001",
};

describe("account profile completeness", () => {
  test("does not require a nickname or avatar", () => {
    expect(() => assertAccountProfileComplete(complete)).not.toThrow();
  });

  test("still requires a real name", () => {
    expect(() =>
      assertAccountProfileComplete({ ...complete, encryptedRealName: null }),
    ).toThrow(ForbiddenException);
  });

  test("still requires a valid phone number", () => {
    expect(() =>
      assertAccountProfileComplete({ ...complete, phone: "123" }),
    ).toThrow(ForbiddenException);
  });
});

describe("account profile request", () => {
  const identity = { realName: "张建国", phone: "13800000001" };

  test("accepts a request without a nickname", () => {
    expect(parseAccountProfileRequest(identity)).toEqual(identity);
  });

  test("rejects a blank nickname when one is sent", () => {
    expect(() =>
      parseAccountProfileRequest({ ...identity, nickname: " " }),
    ).toThrow(BadRequestException);
  });

  test("reports the existing error constant", () => {
    try {
      parseAccountProfileRequest({ nickname: "测试" });
      throw new Error("Expected the request to be rejected");
    } catch (cause: unknown) {
      expect((cause as BadRequestException).getResponse()).toMatchObject({
        message: "ACCOUNT_PROFILE_INVALID",
      });
    }
  });
});

describe("saving an account profile", () => {
  test("keeps the stored nickname when the request omits it", async () => {
    const update = vi.fn(async () => ({}));
    const stored = {
      avatarContentType: null,
      avatarObjectKey: null,
      encryptedRealName: null,
      isBound: false,
      managerProfile: null,
      nickname: "张师傅",
      phone: "13800000001",
      workerProfile: null,
    };
    const transaction = {
      $queryRaw: async (): Promise<readonly unknown[]> => [],
      user: { findUnique: async () => stored, update },
    };
    const prisma = {
      $transaction: async (run: (tx: typeof transaction) => Promise<void>) =>
        run(transaction),
      user: { findUnique: async () => stored },
    } as unknown as PrismaService;
    const service = new AccountService(
      prisma,
      { PERSONNEL_ENCRYPTION_KEY: "ab".repeat(32) } as ApiEnv,
      {} as UploadsService,
      {} as ReadableStoragePort,
    );

    await service.setProfile("user-1", {
      realName: "张建国",
      phone: "13800000001",
    });

    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]).toEqual([
      expect.objectContaining({
        data: expect.not.objectContaining({ nickname: expect.anything() }),
      }),
    ]);
  });
});
