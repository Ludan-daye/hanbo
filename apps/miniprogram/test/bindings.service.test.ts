import { afterEach, describe, expect, test } from "vitest";

import Taro, { __setRequestHandler } from "@tarojs/taro";

import { createInvitation } from "../src/services/bindings";

afterEach(() => {
  Taro.removeStorageSync("accessToken");
});

describe("bindings service", () => {
  test("createInvitation -> POST .../invitations with {profileId,targetType} returns server payload", async () => {
    Taro.setStorageSync("accessToken", "tok");
    let seenUrl = "";
    let seenBody: unknown = null;
    __setRequestHandler(async (o) => {
      seenUrl = o.url;
      seenBody = o.data;
      return {
        statusCode: 201,
        data: { code: "ABC-123", expiresAt: "2030-01-01T00:00:00.000Z", id: "inv-1", profileId: "w-1", projectId: "p-1", targetType: "WORKER" }
      };
    });
    const result = await createInvitation("p-1", { profileId: "w-1", targetType: "WORKER" });
    expect(seenUrl.endsWith("/bindings/projects/p-1/invitations")).toBe(true);
    expect(seenBody).toEqual({ profileId: "w-1", targetType: "WORKER" });
    expect(result.code).toBe("ABC-123");
  });
});
