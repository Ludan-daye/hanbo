import Taro from "@tarojs/taro";
import { API_BASE_URL, ACCESS_TOKEN_KEY } from "../config/env";
import { apiClient } from "./client";
import { fetchMe } from "./auth";

export type ExportScope = "PROJECT" | "TEAM" | "COMPANY";
export type ExportInput = {
  readonly scope: ExportScope;
  readonly scopeId: string;
  readonly month: string;
};
export type ReportExport = {
  readonly id: string;
  readonly month: string;
  readonly version: number;
  readonly status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  readonly createdAt: string;
  readonly completedAt: string | null;
  readonly dataCutoffAt: string | null;
  readonly errorMessage: string | null;
  readonly fileName: string;
};
export const requestReportExport = (
  input: ExportInput,
): Promise<ReportExport> =>
  apiClient.request("/report-exports", { method: "POST", data: input });
export const fetchReportExports = (
  input: ExportInput,
): Promise<readonly ReportExport[]> =>
  apiClient.request(
    `/report-exports?scope=${input.scope}&scopeId=${encodeURIComponent(input.scopeId)}&month=${input.month}`,
    { method: "GET" },
  );
export const openReportExport = async (job: ReportExport): Promise<void> => {
  await fetchMe();
  const token = String(Taro.getStorageSync(ACCESS_TOKEN_KEY) || "");
  const url = `${API_BASE_URL}/report-exports/${encodeURIComponent(job.id)}/file`;
  if (process.env.TARO_ENV === "h5") {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok)
      throw new Error(
        `下载失败（HTTP ${response.status}）：${await response.text()}`,
      );
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = job.fileName;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    return;
  }
  const file = await Taro.downloadFile({
    url,
    header: { Authorization: `Bearer ${token}` },
  });
  if (file.statusCode !== 200)
    throw new Error(
      `下载失败（HTTP ${file.statusCode}），请确认账号权限并重试。`,
    );
  await Taro.openDocument({
    filePath: file.tempFilePath,
    fileType: "xlsx",
    showMenu: true,
  });
};
