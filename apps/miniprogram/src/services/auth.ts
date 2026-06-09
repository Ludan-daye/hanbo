import Taro from "@tarojs/taro";

import { API_BASE_URL } from "../config/env.js";
import { createApiClient } from "./apiClient.js";
import type { LoginResponse, MeResponse } from "./auth.types.js";

const client = createApiClient(API_BASE_URL);

export const devLogin = async (code: string): Promise<void> => {
  const res = await client.request<LoginResponse>("/auth/wechat/login", { auth: false, data: { code }, method: "POST" });
  Taro.setStorageSync("accessToken", res.accessToken);
  Taro.setStorageSync("refreshToken", res.refreshToken);
};

export const fetchMe = async (): Promise<MeResponse> => client.request<MeResponse>("/auth/me", { method: "GET" });

export const bindByInvitation = async (invitationCode: string): Promise<void> => {
  await client.request("/auth/bind", { data: { invitationCode }, method: "POST" });
};

export const logout = async (): Promise<void> => {
  try {
    await client.request("/auth/logout", { method: "POST" });
  } finally {
    Taro.removeStorageSync("accessToken");
    Taro.removeStorageSync("refreshToken");
  }
};
