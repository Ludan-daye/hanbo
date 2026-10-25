import Taro from "@tarojs/taro";

import { API_BASE_URL, FRONTEND_DEMO } from "../config/env";
import { readDemoPhoto } from "./demo/photo";
import { demoEnrollFace } from "./demo/client";
import { apiClient } from "./client";
import { fetchMe } from "./auth";
import type { AttendancePointCode } from "./me.types";
import { ApiError } from "./apiClient";

export type FaceProfile = {
  readonly id: string;
  readonly ownerType: "WORKER" | "MANAGER";
  readonly ownerId: string;
  readonly status: string;
  readonly version: number;
  readonly reviewReason: string | null;
  readonly createdAt: string;
  readonly reviewedAt: string | null;
};

export type MyFace = {
  readonly mode:
    | "DEVELOPMENT"
    | "WECHAT_NATIVE"
    | "VIDEO_ACTION"
    | "UNCONFIGURED";
  readonly consentText: string;
  readonly consentVersion: string;
  readonly profile: FaceProfile | null;
};

export type FaceSession = {
  readonly id: string;
  readonly bizToken: string;
  readonly expiresAt: string;
};
export type CompletedFaceSession = {
  readonly id: string;
  readonly status: string;
  readonly expiresAt: string;
};
export type VideoFaceSession = {
  readonly id: string;
  readonly actionSequence: readonly ("1" | "2")[];
  readonly expiresAt: string;
};
export type FaceLivenessTestResult = CompletedFaceSession & {
  readonly purpose: "LIVENESS_TEST";
  readonly score: number | null;
  readonly failureCode: string | null;
  readonly requestId: string | null;
};

export const createVideoFaceSession = async (
  projectId: string,
  pointCode: AttendancePointCode,
): Promise<VideoFaceSession> =>
  apiClient.request<VideoFaceSession>(
    `/attendance/projects/${projectId}/face-verifications/video`,
    {
      method: "POST",
      data: { pointCode },
    },
  );

export const fetchVideoFaceResult = async (
  projectId: string,
  pointCode: AttendancePointCode,
  sessionId: string,
): Promise<CompletedFaceSession> =>
  apiClient.request<CompletedFaceSession>(
    `/attendance/projects/${projectId}/face-verifications/${sessionId}/video-result?pointCode=${pointCode}`,
    { method: "GET" },
  );

export const uploadFaceVideo = async (
  projectId: string,
  pointCode: AttendancePointCode,
  sessionId: string,
  filePath: string,
): Promise<CompletedFaceSession> => {
  const body: unknown = await uploadFaceVideoFile(
    `/attendance/projects/${projectId}/face-verifications/${sessionId}/video`,
    filePath,
    { pointCode },
  );
  return parseFaceSessionResult(body);
};

const uploadFaceVideoFile = async (
  path: string,
  filePath: string,
  formData: { readonly pointCode?: AttendancePointCode },
): Promise<unknown> => {
  await fetchMe();
  const token: string = String(Taro.getStorageSync("accessToken") || "");
  const response = await Taro.uploadFile({
    url: `${API_BASE_URL}${path}`,
    filePath,
    name: "file",
    formData,
    header: { Authorization: `Bearer ${token}` },
    timeout: 120_000,
    withCredentials: false,
  });
  const body: unknown = JSON.parse(response.data);
  if (response.statusCode < 200 || response.statusCode >= 300) {
    const code: string =
      typeof body === "object" && body !== null && "message" in body
        ? String(body.message)
        : "UNKNOWN";
    const message: string =
      response.statusCode === 413 || code === "FACE_VIDEO_SIZE_INVALID"
        ? "录像超过 5MB，请重新录制。"
        : `录像核验未完成（${response.statusCode}，${code}），请确认本次结果后再试。`;
    throw new ApiError(response.statusCode, message, body);
  }
  return body;
};

const parseFaceSessionResult = (body: unknown): CompletedFaceSession => {
  if (
    typeof body !== "object" ||
    body === null ||
    !("id" in body) ||
    !("status" in body) ||
    !("expiresAt" in body) ||
    typeof body.id !== "string" ||
    typeof body.status !== "string" ||
    typeof body.expiresAt !== "string"
  )
    throw new Error("录像核验返回格式异常，请联系管理员。");
  return { id: body.id, status: body.status, expiresAt: body.expiresAt };
};

const parseLivenessTestResult = (body: unknown): FaceLivenessTestResult => {
  const session: CompletedFaceSession = parseFaceSessionResult(body);
  if (
    typeof body !== "object" ||
    body === null ||
    !("purpose" in body) ||
    body.purpose !== "LIVENESS_TEST" ||
    !("score" in body) ||
    (body.score !== null &&
      (typeof body.score !== "number" || !Number.isFinite(body.score))) ||
    !("failureCode" in body) ||
    (body.failureCode !== null && typeof body.failureCode !== "string") ||
    !("requestId" in body) ||
    (body.requestId !== null && typeof body.requestId !== "string")
  )
    throw new Error("活体测试返回格式异常，请联系管理员。");
  return {
    ...session,
    purpose: "LIVENESS_TEST",
    score: body.score,
    failureCode: body.failureCode,
    requestId: body.requestId,
  };
};

export const createLivenessTest = (): Promise<VideoFaceSession> =>
  apiClient.request("/face-profiles/me/liveness-tests", { method: "POST" });

export const fetchLivenessTestResult = async (
  sessionId: string,
): Promise<FaceLivenessTestResult> =>
  parseLivenessTestResult(
    await apiClient.request(`/face-profiles/me/liveness-tests/${sessionId}`, {
      method: "GET",
    }),
  );

export const uploadLivenessTestVideo = async (
  sessionId: string,
  filePath: string,
): Promise<FaceLivenessTestResult> =>
  parseLivenessTestResult(
    await uploadFaceVideoFile(
      `/face-profiles/me/liveness-tests/${sessionId}/video`,
      filePath,
      {},
    ),
  );

export const faceStatusLabel = (status: string): string =>
  ({
    PENDING: "待管理员审核",
    APPROVED: "已审核，可用于打卡",
    REJECTED: "审核未通过",
    REPLACED: "已重新录入",
  })[status] ?? status;

export const fetchMyFace = async (): Promise<MyFace> =>
  apiClient.request<MyFace>("/face-profiles/me", { method: "GET" });

export const enrollMyFace = async (
  filePath: string,
  consentVersion: string,
): Promise<FaceProfile> => {
  if (FRONTEND_DEMO) {
    return demoEnrollFace(await readDemoPhoto(filePath), consentVersion);
  }
  await fetchMe();
  const accessToken = String(Taro.getStorageSync("accessToken") || "");
  const response = await Taro.uploadFile({
    url: `${API_BASE_URL}/face-profiles/me`,
    filePath,
    name: "file",
    formData: { consentVersion },
    header: { Authorization: `Bearer ${accessToken}` },
    withCredentials: false,
  });
  if (response.statusCode < 200 || response.statusCode >= 300) {
    if (response.statusCode === 413)
      throw new Error("底照不能超过 2MB，请重新拍摄或压缩图片。");
    throw new Error(
      `人脸底照提交失败（${response.statusCode}），请检查图片和登录状态后重试。`,
    );
  }
  return JSON.parse(response.data) as FaceProfile;
};

export const fetchProjectFaces = async (
  projectId: string,
): Promise<readonly FaceProfile[]> =>
  apiClient.request<readonly FaceProfile[]>(
    `/face-profiles/projects/${projectId}`,
    { method: "GET" },
  );
export const fetchFacePhoto = async (
  projectId: string,
  profileId: string,
): Promise<{ readonly dataUrl: string }> =>
  apiClient.request<{ readonly dataUrl: string }>(
    `/face-profiles/projects/${projectId}/${profileId}/photo`,
    { method: "GET" },
  );
export const reviewFaceProfile = async (
  projectId: string,
  profileId: string,
  decision: "APPROVED" | "REJECTED",
  reason: string,
): Promise<FaceProfile> =>
  apiClient.request<FaceProfile>(
    `/face-profiles/projects/${projectId}/${profileId}/review`,
    { method: "POST", data: { decision, reason } },
  );
export const createFaceSession = async (
  projectId: string,
  pointCode: AttendancePointCode,
): Promise<FaceSession> =>
  apiClient.request<FaceSession>(
    `/attendance/projects/${projectId}/face-verifications`,
    { method: "POST", data: { pointCode } },
  );
export const completeFaceSession = async (
  projectId: string,
  pointCode: AttendancePointCode,
  sessionId: string,
): Promise<CompletedFaceSession> =>
  apiClient.request<CompletedFaceSession>(
    `/attendance/projects/${projectId}/face-verifications/${sessionId}/complete`,
    { method: "POST", data: { pointCode } },
  );
