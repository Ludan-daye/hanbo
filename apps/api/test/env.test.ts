import { describe, expect, test } from "vitest";

import { loadEnv } from "../src/config/env.js";

const baseEnv = (): NodeJS.ProcessEnv => ({
  AUTH_REFRESH_TOKEN_TTL_SECONDS: "2592000",
  API_PORT: "3000",
  DATABASE_URL: "postgresql://construction:construction@localhost:5432/construction_personnel?schema=public",
  FACE_SERVICE_API_KEY: "face-service-key",
  FACE_SERVICE_BASE_URL: "http://localhost:8000",
  JWT_ACCESS_TOKEN_SECRET: "test-jwt-secret-with-at-least-32-characters",
  JWT_ACCESS_TOKEN_TTL_SECONDS: "900",
  NODE_ENV: "development",
  OBJECT_STORAGE_ACCESS_KEY: "object-storage-access-key",
  OBJECT_STORAGE_BUCKET: "construction-personnel",
  OBJECT_STORAGE_ENDPOINT: "http://localhost:9000",
  OBJECT_STORAGE_SECRET_KEY: "object-storage-secret-key",
  WECHAT_APP_ID: "wechat-app-id",
  WECHAT_APP_SECRET: "wechat-app-secret"
});

describe("loadEnv", () => {
  test("defaults WECHAT_DEV_LOGIN to false and CORS_ALLOWED_ORIGINS to empty", () => {
    const env = loadEnv(baseEnv());
    expect(env.WECHAT_DEV_LOGIN).toBe(false);
    expect(env.CORS_ALLOWED_ORIGINS).toBe("");
  });

  test("parses WECHAT_DEV_LOGIN=true in non-production", () => {
    const env = loadEnv({ ...baseEnv(), WECHAT_DEV_LOGIN: "true" });
    expect(env.WECHAT_DEV_LOGIN).toBe(true);
  });

  test("rejects WECHAT_DEV_LOGIN=true when NODE_ENV is production", () => {
    expect(() => loadEnv({ ...baseEnv(), NODE_ENV: "production", WECHAT_DEV_LOGIN: "true" })).toThrow();
  });
});
