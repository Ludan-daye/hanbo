import { describe, expect, test } from "vitest";

import {
  WechatCodeSessionConnector,
  type FetchLike
} from "../src/infrastructure/wechat/wechat-code-session.connector.js";

const createJsonResponse = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json"
    },
    status
  });

const createConnector = (fetchImplementation: FetchLike): WechatCodeSessionConnector =>
  new WechatCodeSessionConnector({
    appId: "app-id",
    appSecret: "app-secret",
    endpoint: "https://wechat.example.test/sns/jscode2session",
    fetchImplementation,
    logger: {
      warn(_fields: Record<string, unknown>): void {}
    },
    maxAttempts: 2,
    retryDelayMs: 0,
    sleep: async (_milliseconds: number): Promise<void> => {}
  });

describe("WechatCodeSessionConnector", (): void => {
  test("exchanges code for WeChat identity data", async (): Promise<void> => {
    const connector = createConnector(async (): Promise<Response> =>
      createJsonResponse(
        {
          openid: "openid-1",
          session_key: "session-key-1",
          unionid: "unionid-1"
        },
        200
      )
    );

    await expect(connector.exchangeCode("login-code-1")).resolves.toEqual({
      openid: "openid-1",
      sessionKey: "session-key-1",
      unionid: "unionid-1"
    });
  });

  test("raises explicit error for WeChat error responses without leaking secret", async (): Promise<void> => {
    const connector = createConnector(async (): Promise<Response> =>
      createJsonResponse(
        {
          errcode: 40029,
          errmsg: "invalid code"
        },
        200
      )
    );

    await expect(connector.exchangeCode("bad-code")).rejects.toThrow(/WECHAT_CODE_SESSION_FAILED/);
    await expect(connector.exchangeCode("bad-code")).rejects.toThrow(/bad-code/);
    await expect(connector.exchangeCode("bad-code")).rejects.not.toThrow(/app-secret/);
  });

  test("raises explicit error for malformed success responses", async (): Promise<void> => {
    const connector = createConnector(async (): Promise<Response> =>
      createJsonResponse(
        {
          openid: "openid-1"
        },
        200
      )
    );

    await expect(connector.exchangeCode("login-code-1")).rejects.toThrow(/INVALID_WECHAT_CODE_SESSION_RESPONSE/);
  });

  test("retries transient network failures with structured warning", async (): Promise<void> => {
    const warnings: Record<string, unknown>[] = [];
    let callCount = 0;
    const connector = new WechatCodeSessionConnector({
      appId: "app-id",
      appSecret: "app-secret",
      endpoint: "https://wechat.example.test/sns/jscode2session",
      fetchImplementation: async (): Promise<Response> => {
        callCount += 1;

        if (callCount === 1) {
          throw new Error("temporary network failure");
        }

        return createJsonResponse(
          {
            openid: "openid-1",
            session_key: "session-key-1"
          },
          200
        );
      },
      logger: {
        warn(fields: Record<string, unknown>): void {
          warnings.push(fields);
        }
      },
      maxAttempts: 2,
      retryDelayMs: 0,
      sleep: async (_milliseconds: number): Promise<void> => {}
    });

    await expect(connector.exchangeCode("login-code-1")).resolves.toEqual({
      openid: "openid-1",
      sessionKey: "session-key-1"
    });
    expect(callCount).toBe(2);
    expect(warnings).toHaveLength(1);
    expect(JSON.stringify(warnings[0])).toContain("WECHAT_CODE_SESSION_RETRY");
    expect(JSON.stringify(warnings[0])).not.toContain("app-secret");
  });

  test("raises contextual error after retryable failures are exhausted", async (): Promise<void> => {
    let callCount = 0;
    const connector = new WechatCodeSessionConnector({
      appId: "app-id",
      appSecret: "app-secret",
      endpoint: "https://wechat.example.test/sns/jscode2session",
      fetchImplementation: async (): Promise<Response> => {
        callCount += 1;
        throw new Error("network unavailable");
      },
      logger: {
        warn(_fields: Record<string, unknown>): void {}
      },
      maxAttempts: 2,
      retryDelayMs: 0,
      sleep: async (_milliseconds: number): Promise<void> => {}
    });

    await expect(connector.exchangeCode("login-code-1")).rejects.toThrow(/WECHAT_CODE_SESSION_NETWORK_ERROR/);
    await expect(connector.exchangeCode("login-code-1")).rejects.toThrow(/login-code-1/);
    await expect(connector.exchangeCode("login-code-1")).rejects.not.toThrow(/app-secret/);
    expect(callCount).toBe(6);
  });

  test("retries response body read failures with request context", async (): Promise<void> => {
    let callCount = 0;
    const connector = new WechatCodeSessionConnector({
      appId: "app-id",
      appSecret: "app-secret",
      endpoint: "https://wechat.example.test/sns/jscode2session",
      fetchImplementation: async (): Promise<Response> => {
        callCount += 1;

        if (callCount === 1) {
          return {
            ok: true,
            status: 200,
            text: async (): Promise<string> => {
              throw new Error("body stream interrupted");
            }
          } as Response;
        }

        return createJsonResponse(
          {
            openid: "openid-1",
            session_key: "session-key-1"
          },
          200
        );
      },
      logger: {
        warn(_fields: Record<string, unknown>): void {}
      },
      maxAttempts: 2,
      retryDelayMs: 0,
      sleep: async (_milliseconds: number): Promise<void> => {}
    });

    await expect(connector.exchangeCode("login-code-1")).resolves.toEqual({
      openid: "openid-1",
      sessionKey: "session-key-1"
    });
    expect(callCount).toBe(2);
  });
});
