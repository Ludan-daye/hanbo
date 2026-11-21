import { beforeEach, describe, expect, it } from "vitest";

import Taro, { __setRequestHandler } from "./taro-mock";
import { uploadImage } from "../src/services/uploads";

const requested: string[] = [];

beforeEach(() => {
  requested.length = 0;
  __setRequestHandler(async ({ url }) => {
    requested.push(url);
    return url.endsWith("/auth/me")
      ? { statusCode: 200, data: { user: { id: "u1" } } }
      : { statusCode: 404, data: {} };
  });
  (Taro as unknown as { uploadFile: unknown }).uploadFile = async () => ({
    statusCode: 201,
    data: JSON.stringify({
      contentType: "image/jpeg",
      hash: "h",
      objectKey: "k",
      sizeBytes: 1,
    }),
  });
});

describe("uploadImage", () => {
  // 上传前先刷新登录态：必须打到真实存在的 /auth/me，打错地址会让打卡时现场照片上传失败。
  it("refreshes the session through /auth/me before uploading", async () => {
    await expect(uploadImage("wxfile://site.jpg")).resolves.toMatchObject({
      objectKey: "k",
    });
    expect(requested.some((url) => url.endsWith("/auth/me"))).toBe(true);
    expect(requested.some((url) => /\/me$/.test(url) && !url.endsWith("/auth/me"))).toBe(false);
  });
});
