import Taro from "@tarojs/taro";

import { messageForApiError, withSupportPhone } from "./error-messages";
import { noteWrite } from "./read-cache";

export type RequestOptions = {
  readonly method?: "GET" | "POST" | "PUT" | "DELETE";
  readonly data?: unknown;
  readonly auth?: boolean;
};

export type ApiClient = {
  request<T>(path: string, options?: RequestOptions): Promise<T>;
};

type ApiResponse = { readonly statusCode: number; readonly data: unknown };
type RequestSession = {
  readonly accessToken: string;
  readonly refreshToken: string;
};
type PendingRefresh = {
  readonly refreshToken: string;
  readonly promise: Promise<string | null>;
};

export class ApiError extends Error {
  readonly statusCode: number;
  readonly responseBody: unknown;
  constructor(statusCode: number, message: string, responseBody: unknown) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}

const getAccessToken = (): string =>
  String(Taro.getStorageSync("accessToken") || "");
const getRefreshToken = (): string =>
  String(Taro.getStorageSync("refreshToken") || "");

const clearTokens = (): void => {
  Taro.removeStorageSync("accessToken");
  Taro.removeStorageSync("refreshToken");
};

export const createApiClient = (baseUrl: string): ApiClient => {
  let pendingRefresh: PendingRefresh | null = null;

  const send = async (
    path: string,
    options: RequestOptions,
    accessToken: string,
  ): Promise<ApiResponse> =>
    Taro.request({
      url: `${baseUrl}${path}`,
      method: options.method ?? "GET",
      data: options.data,
      header:
        accessToken.length > 0
          ? { Authorization: `Bearer ${accessToken}` }
          : {},
    }).catch((cause: unknown): never => {
      throw new ApiError(0, "网络连接未完成，请检查网络后重试。", cause);
    });

  const assertCurrentSession = (session: RequestSession): void => {
    if (getRefreshToken() !== session.refreshToken)
      throw new ApiError(401, "登录状态已变更，请重新打开当前页面。", {
        message: "REQUEST_SESSION_CHANGED",
      });
  };

  const refresh = async (session: RequestSession): Promise<string | null> => {
    const res = await send(
      "/auth/refresh",
      {
        method: "POST",
        data: { refreshToken: session.refreshToken },
      },
      "",
    );
    assertCurrentSession(session);
    if (res.statusCode === 401) return null;
    if (res.statusCode < 200 || res.statusCode >= 300)
      throw new ApiError(
        res.statusCode,
        "登录状态刷新失败，请稍后重试。",
        res.data,
      );
    if (
      typeof res.data !== "object" ||
      res.data === null ||
      !("accessToken" in res.data) ||
      typeof res.data.accessToken !== "string" ||
      res.data.accessToken.length === 0
    )
      throw new ApiError(502, "登录服务返回异常，请稍后重试。", res.data);
    const next: string = res.data.accessToken;
    Taro.setStorageSync("accessToken", next);
    return next;
  };

  const refreshedToken = async (
    session: RequestSession,
  ): Promise<string | null> => {
    assertCurrentSession(session);
    const currentToken: string = getAccessToken();
    if (currentToken !== session.accessToken && currentToken.length > 0)
      return currentToken;
    if (session.refreshToken.length === 0) return null;
    if (pendingRefresh?.refreshToken === session.refreshToken)
      return pendingRefresh.promise;
    const pending: PendingRefresh = {
      refreshToken: session.refreshToken,
      promise: refresh(session),
    };
    pendingRefresh = pending;
    try {
      return await pending.promise;
    } finally {
      if (pendingRefresh === pending) pendingRefresh = null;
    }
  };

  const expireSession = async (
    session: RequestSession,
    accessToken: string,
  ): Promise<void> => {
    if (
      getRefreshToken() === session.refreshToken &&
      getAccessToken() === accessToken
    ) {
      clearTokens();
      await Taro.reLaunch({ url: "/pages/login/index" });
    }
  };

  const request = async <T>(
    path: string,
    options: RequestOptions = {},
  ): Promise<T> => {
    const useAuth = options.auth !== false;
    const session: RequestSession = {
      accessToken: getAccessToken(),
      refreshToken: getRefreshToken(),
    };
    let accessToken: string = useAuth ? session.accessToken : "";
    let res = await send(path, options, accessToken);

    if (res.statusCode === 401 && useAuth) {
      const next = await refreshedToken(session);
      if (next === null) {
        await expireSession(session, accessToken);
        throw new ApiError(401, "登录已过期，请重新登录。", res.data);
      }
      accessToken = next;
      res = await send(path, options, accessToken);
    }

    if (res.statusCode >= 200 && res.statusCode < 300) {
      // 写操作成功：读取缓存作废，回到上一页时也会重读。
      if ((options.method ?? "GET") !== "GET") noteWrite();
      return res.data as T;
    }
    if (res.statusCode === 401 && useAuth) {
      await expireSession(session, accessToken);
    }
    const code =
      typeof res.data === "object" &&
      res.data !== null &&
      "message" in res.data &&
      typeof res.data.message === "string"
        ? res.data.message
        : "";
    throw new ApiError(
      res.statusCode,
      withSupportPhone(messageForApiError(res.statusCode, code), res.data),
      res.data,
    );
  };

  return { request };
};
