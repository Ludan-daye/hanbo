import { z } from "zod";

export const WECHAT_CODE_SESSION_ENDPOINT = "https://api.weixin.qq.com/sns/jscode2session";

export type FetchLike = (input: string | URL, init: RequestInit) => Promise<Response>;
export type SleepLike = (milliseconds: number) => Promise<void>;

export type WechatCodeSessionWarningLogger = {
  readonly warn: (fields: Record<string, unknown>) => void;
};

export type WechatCodeSessionConnectorConfig = {
  readonly appId: string;
  readonly appSecret: string;
  readonly devLoginEnabled: boolean;
  readonly endpoint: string;
  readonly fetchImplementation: FetchLike;
  readonly logger: WechatCodeSessionWarningLogger;
  readonly maxAttempts: number;
  readonly retryDelayMs: number;
  readonly sleep: SleepLike;
};

export type WechatCodeSession = {
  readonly openid: string;
  readonly sessionKey: string;
  readonly unionid?: string;
};

const wechatCodeSessionSuccessSchema = z.object({
  openid: z.string().min(1),
  session_key: z.string().min(1),
  unionid: z.string().min(1).optional()
});

const wechatErrorSchema = z.object({
  errcode: z.number(),
  errmsg: z.string()
});

const parseJsonResponse = (responseText: string, requestContext: WechatCodeSessionRequestContext): unknown => {
  try {
    return JSON.parse(responseText) as unknown;
  } catch (error: unknown) {
    throw new WechatCodeSessionConnectorError(
      JSON.stringify({
        errorName: error instanceof Error ? error.name : "UnknownError",
        message: "INVALID_WECHAT_CODE_SESSION_JSON",
        request: requestContext,
        responseBody: responseText
      }),
      true
    );
  }
};

type WechatCodeSessionRequestContext = {
  readonly appId: string;
  readonly endpoint: string;
  readonly grantType: "authorization_code";
  readonly jsCode: string;
};

class WechatCodeSessionConnectorError extends Error {
  readonly isRetryable: boolean;

  constructor(message: string, isRetryable: boolean) {
    super(message);
    this.name = "WechatCodeSessionConnectorError";
    this.isRetryable = isRetryable;
  }
}

const createRequestContext = (
  config: WechatCodeSessionConnectorConfig,
  jsCode: string
): WechatCodeSessionRequestContext => ({
  appId: config.appId,
  endpoint: config.endpoint,
  grantType: "authorization_code",
  jsCode
});

const createRequestUrl = (config: WechatCodeSessionConnectorConfig, jsCode: string): URL => {
  const url = new URL(config.endpoint);
  url.searchParams.set("appid", config.appId);
  url.searchParams.set("secret", config.appSecret);
  url.searchParams.set("js_code", jsCode);
  url.searchParams.set("grant_type", "authorization_code");
  return url;
};

const createWechatError = (
  message: string,
  requestContext: WechatCodeSessionRequestContext,
  response: Response,
  responseBody: unknown,
  isRetryable: boolean
): Error =>
  new WechatCodeSessionConnectorError(
    JSON.stringify({
      message,
      request: requestContext,
      responseBody,
      status: response.status
    }),
    isRetryable
  );

const createNetworkError = (
  error: unknown,
  requestContext: WechatCodeSessionRequestContext,
  message: "WECHAT_CODE_SESSION_BODY_READ_ERROR" | "WECHAT_CODE_SESSION_NETWORK_ERROR"
): WechatCodeSessionConnectorError =>
  new WechatCodeSessionConnectorError(
    JSON.stringify({
      cause: {
        message: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : "UnknownError"
      },
      message,
      request: requestContext,
      responseBody: null,
      status: null
    }),
    true
  );

const parseWechatCodeSession = (
  responseBody: unknown,
  requestContext: WechatCodeSessionRequestContext,
  response: Response
): WechatCodeSession => {
  const errorResult = wechatErrorSchema.safeParse(responseBody);

  if (errorResult.success && errorResult.data.errcode !== 0) {
    throw createWechatError("WECHAT_CODE_SESSION_FAILED", requestContext, response, responseBody, false);
  }

  const result = wechatCodeSessionSuccessSchema.safeParse(responseBody);

  if (!result.success) {
    throw createWechatError(
      "INVALID_WECHAT_CODE_SESSION_RESPONSE",
      requestContext,
      response,
      {
        issues: result.error.issues,
        responseBody
      },
      true
    );
  }

  return {
    openid: result.data.openid,
    sessionKey: result.data.session_key,
    ...(result.data.unionid === undefined ? {} : { unionid: result.data.unionid })
  };
};

export class WechatCodeSessionConnector {
  private readonly config: WechatCodeSessionConnectorConfig;

  constructor(config: WechatCodeSessionConnectorConfig) {
    if (!Number.isInteger(config.maxAttempts) || config.maxAttempts < 1) {
      throw new Error(
        JSON.stringify({
          maxAttempts: config.maxAttempts,
          message: "WECHAT_CODE_SESSION_MAX_ATTEMPTS_INVALID"
        })
      );
    }

    if (!Number.isInteger(config.retryDelayMs) || config.retryDelayMs < 0) {
      throw new Error(
        JSON.stringify({
          message: "WECHAT_CODE_SESSION_RETRY_DELAY_INVALID",
          retryDelayMs: config.retryDelayMs
        })
      );
    }

    this.config = config;
  }

  async exchangeCode(jsCode: string): Promise<WechatCodeSession> {
    if (this.config.devLoginEnabled) {
      return {
        openid: jsCode,
        sessionKey: `dev-session-${jsCode}`
      };
    }

    let lastError: Error | undefined = undefined;

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt += 1) {
      try {
        return await this.requestCodeSession(jsCode);
      } catch (error: unknown) {
        const normalizedError = error instanceof Error ? error : new Error(String(error));
        lastError = normalizedError;

        if (!this.shouldRetry(normalizedError) || attempt === this.config.maxAttempts) {
          throw normalizedError;
        }

        this.config.logger.warn({
          attempt,
          errorMessage: normalizedError.message,
          errorName: normalizedError.name,
          maxAttempts: this.config.maxAttempts,
          message: "WECHAT_CODE_SESSION_RETRY",
          retryDelayMs: this.config.retryDelayMs
        });
        await this.config.sleep(this.config.retryDelayMs);
      }
    }

    throw new Error(
      JSON.stringify({
        errorMessage: lastError?.message,
        message: "WECHAT_CODE_SESSION_RETRY_STATE_INVALID"
      })
    );
  }

  private async requestCodeSession(jsCode: string): Promise<WechatCodeSession> {
    const requestContext = createRequestContext(this.config, jsCode);
    const requestUrl = createRequestUrl(this.config, jsCode);
    const response = await this.fetchWechatResponse(requestUrl, requestContext);
    const responseText = await this.readResponseText(response, requestContext);
    const responseBody = parseJsonResponse(responseText, requestContext);

    if (!response.ok) {
      throw createWechatError("WECHAT_CODE_SESSION_HTTP_ERROR", requestContext, response, responseBody, true);
    }

    return parseWechatCodeSession(responseBody, requestContext, response);
  }

  private async fetchWechatResponse(requestUrl: URL, requestContext: WechatCodeSessionRequestContext): Promise<Response> {
    try {
      return await this.config.fetchImplementation(requestUrl, { method: "GET" });
    } catch (error: unknown) {
      throw createNetworkError(error, requestContext, "WECHAT_CODE_SESSION_NETWORK_ERROR");
    }
  }

  private async readResponseText(response: Response, requestContext: WechatCodeSessionRequestContext): Promise<string> {
    try {
      return await response.text();
    } catch (error: unknown) {
      throw createNetworkError(error, requestContext, "WECHAT_CODE_SESSION_BODY_READ_ERROR");
    }
  }

  private shouldRetry(error: Error): boolean {
    return error instanceof WechatCodeSessionConnectorError && error.isRetryable;
  }
}
