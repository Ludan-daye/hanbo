import Taro from "@tarojs/taro";

import { ACCESS_TOKEN_KEY, API_BASE_URL, FRONTEND_DEMO } from "../config/env";
import { fetchMe } from "./auth";
import { apiClient } from "./client";
import { readDemoPhoto } from "./demo/photo";

export type AccountProfile = {
  readonly nickname: string | null;
  readonly avatarDataUrl: string | null;
  readonly isBound: boolean;
  readonly phoneMasked: string | null;
};

export const fetchAccountProfile = async (): Promise<AccountProfile> =>
  apiClient.request<AccountProfile>("/account/profile", { method: "GET" });

export const saveAccountNickname = async (
  nickname: string,
): Promise<AccountProfile> =>
  apiClient.request<AccountProfile>("/account/profile", {
    method: "PUT",
    data: { nickname },
  });

export const saveAccountAvatar = async (
  filePath: string,
): Promise<AccountProfile> => {
  if (FRONTEND_DEMO) {
    const avatarDataUrl = await readDemoPhoto(filePath);
    return apiClient.request<AccountProfile>("/account/avatar", {
      method: "POST",
      data: { avatarDataUrl },
    });
  }
  await fetchMe();
  const token: string = String(Taro.getStorageSync(ACCESS_TOKEN_KEY) || "");
  const response = await Taro.uploadFile({
    url: `${API_BASE_URL}/account/avatar`,
    name: "file",
    filePath,
    header: { Authorization: `Bearer ${token}` },
    withCredentials: false,
  });
  if (response.statusCode === 413)
    throw new Error("头像不能超过 2MB，请选择较小的图片。");
  if (response.statusCode === 400)
    throw new Error("头像无效，请选择不超过 2MB 的 JPG 或 PNG 图片。");
  if (response.statusCode === 401)
    throw new Error("登录已过期，请重新登录后设置头像。");
  if (response.statusCode < 200 || response.statusCode >= 300)
    throw new Error(`头像保存失败（${response.statusCode}），请稍后重试。`);
  return JSON.parse(response.data) as AccountProfile;
};
