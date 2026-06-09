import Taro from "@tarojs/taro";

export type RequestOptions = {
  readonly method?: "GET" | "POST" | "PUT" | "DELETE";
  readonly data?: unknown;
  readonly auth?: boolean;
};

export type ApiClient = {
  request<T>(path: string, options?: RequestOptions): Promise<T>;
};

export class ApiError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
  }
}

const getAccessToken = (): string => String(Taro.getStorageSync("accessToken") || "");
const getRefreshToken = (): string => String(Taro.getStorageSync("refreshToken") || "");

const clearTokens = (): void => {
  Taro.removeStorageSync("accessToken");
  Taro.removeStorageSync("refreshToken");
};

export const createApiClient = (baseUrl: string): ApiClient => {
  const send = async (path: string, options: RequestOptions, accessToken: string) =>
    Taro.request({
      url: `${baseUrl}${path}`,
      method: options.method ?? "GET",
      data: options.data,
      header: accessToken.length > 0 ? { Authorization: `Bearer ${accessToken}` } : {}
    });

  const refresh = async (): Promise<string | null> => {
    const refreshToken = getRefreshToken();
    if (refreshToken.length === 0) {
      return null;
    }
    const res = await Taro.request({
      url: `${baseUrl}/auth/refresh`,
      method: "POST",
      data: { refreshToken },
      header: {}
    });
    if (res.statusCode === 200 && res.data && typeof (res.data as { accessToken?: string }).accessToken === "string") {
      const next = (res.data as { accessToken: string }).accessToken;
      Taro.setStorageSync("accessToken", next);
      return next;
    }
    return null;
  };

  const request = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
    const useAuth = options.auth !== false;
    let res = await send(path, options, useAuth ? getAccessToken() : "");

    if (res.statusCode === 401 && useAuth) {
      const next = await refresh();
      if (next === null) {
        clearTokens();
        throw new ApiError(401, "SESSION_EXPIRED");
      }
      res = await send(path, options, next);
    }

    if (res.statusCode >= 200 && res.statusCode < 300) {
      return res.data as T;
    }
    throw new ApiError(res.statusCode, `REQUEST_FAILED_${res.statusCode}`);
  };

  return { request };
};
