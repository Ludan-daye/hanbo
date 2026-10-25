import Taro from "@tarojs/taro";

import {
  ACCESS_TOKEN_KEY,
  FRONTEND_DEMO,
  REFRESH_TOKEN_KEY,
} from "../config/env";
import { apiClient as client } from "./client";
import type { LoginResponse, MeResponse } from "./auth.types";

const exchangeWechatCode = async (code: string): Promise<void> => {
  const res = await client.request<LoginResponse>("/auth/wechat/login", {
    auth: false,
    data: { code },
    method: "POST",
  });
  if (
    typeof res.accessToken !== "string" ||
    res.accessToken.length === 0 ||
    typeof res.refreshToken !== "string" ||
    res.refreshToken.length === 0
  ) {
    throw new Error("登录服务未返回有效凭据，请联系管理员后重试。");
  }
  Taro.setStorageSync(ACCESS_TOKEN_KEY, res.accessToken);
  Taro.setStorageSync(REFRESH_TOKEN_KEY, res.refreshToken);
};

export const devLogin = async (code: string): Promise<void> => {
  if (!FRONTEND_DEMO)
    throw new Error("正式环境不支持演示身份登录，请使用微信登录。");
  await exchangeWechatCode(code);
};

export const loginWithWechat = async (): Promise<void> => {
  if (FRONTEND_DEMO)
    throw new Error(
      "当前为前端演示环境，请体验绑定流程；真实微信登录需连接正式服务。",
    );
  if (process.env.TARO_ENV !== "weapp")
    throw new Error("请在微信小程序中登录。");
  const result = await Taro.login();
  if (typeof result.code !== "string" || result.code.length === 0)
    throw new Error("未取得微信登录凭据，请重试。");
  await exchangeWechatCode(result.code);
};

export const fetchMe = async (): Promise<MeResponse> =>
  client.request<MeResponse>("/auth/me", { method: "GET" });

export const bindByInvitation = async (
  invitationCode: string,
): Promise<void> => {
  await client.request("/auth/bind", {
    data: { invitationCode },
    method: "POST",
  });
};

export const logout = async (): Promise<void> => {
  try {
    await client.request("/auth/logout", { method: "POST" });
  } finally {
    Taro.removeStorageSync(ACCESS_TOKEN_KEY);
    Taro.removeStorageSync(REFRESH_TOKEN_KEY);
  }
};
