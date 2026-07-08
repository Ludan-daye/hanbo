import Taro from "@tarojs/taro";

import { API_BASE_URL } from "../config/env";

export type UploadResult = {
  readonly contentType: string;
  readonly hash: string;
  readonly objectKey: string;
  readonly sizeBytes: number;
};

export const uploadImage = async (localFilePath: string): Promise<UploadResult> => {
  const accessToken = String(Taro.getStorageSync("accessToken") || "");
  const res = await Taro.uploadFile({
    filePath: localFilePath,
    header: accessToken.length > 0 ? { Authorization: `Bearer ${accessToken}` } : {},
    name: "file",
    url: `${API_BASE_URL}/uploads`
  });

  if (res.statusCode < 200 || res.statusCode >= 300) {
    let serverMessage: string | null = null;
    try {
      const parsed = JSON.parse(res.data) as { message?: unknown };
      serverMessage = typeof parsed.message === "string" ? parsed.message : null;
    } catch {
      serverMessage = null;
    }
    throw new Error(serverMessage ?? `UPLOAD_FAILED_${res.statusCode}`);
  }

  const data = JSON.parse(res.data) as UploadResult;

  if (typeof data.objectKey !== "string" || typeof data.hash !== "string") {
    throw new Error("UPLOAD_RESPONSE_INVALID");
  }

  return data;
};
