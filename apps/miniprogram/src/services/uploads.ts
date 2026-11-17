import Taro from "@tarojs/taro";

import { API_BASE_URL, FRONTEND_DEMO } from "../config/env";

import { ApiError } from "./apiClient";
import { apiClient } from "./client";
import { demoUploadImage } from "./demo/client";
import { messageForApiError } from "./error-messages";

export type UploadResult = {
  readonly contentType: string;
  readonly hash: string;
  readonly objectKey: string;
  readonly sizeBytes: number;
};

export const uploadImage = async (
  localFilePath: string,
): Promise<UploadResult> => {
  if (FRONTEND_DEMO) return demoUploadImage(localFilePath);
  // 先走一次普通请求，让过期的登录态在上传前完成刷新。
  await apiClient.request("/me");
  const accessToken = String(Taro.getStorageSync("accessToken") || "");
  const res = await Taro.uploadFile({
    filePath: localFilePath,
    header:
      accessToken.length > 0 ? { Authorization: `Bearer ${accessToken}` } : {},
    name: "file",
    url: `${API_BASE_URL}/uploads`,
    withCredentials: false,
  });

  if (res.statusCode < 200 || res.statusCode >= 300) {
    let serverMessage: string | null = null;
    try {
      const parsed = JSON.parse(res.data) as { message?: unknown };
      serverMessage =
        typeof parsed.message === "string" ? parsed.message : null;
    } catch {
      serverMessage = null;
    }
    throw new ApiError(
      res.statusCode,
      messageForApiError(res.statusCode, serverMessage ?? "", "照片上传未完成，请重试。"),
      res.data,
    );
  }

  const data = JSON.parse(res.data) as UploadResult;

  if (typeof data.objectKey !== "string" || typeof data.hash !== "string") {
    throw new ApiError(res.statusCode, messageForApiError(res.statusCode, "UPLOAD_RESPONSE_INVALID"), data);
  }

  return data;
};
