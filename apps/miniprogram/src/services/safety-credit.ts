import Taro from "@tarojs/taro";
import type {
  MySafetyCredit,
  SafetyCreditBoard,
  SafetyCreditPolicyInput,
  SafetyCreditPolicyView,
  SafetyDecisionAction,
  SafetyViolationInput,
  SafetyViolationView,
} from "@construction/domain";
import { apiClient } from "./client";

export const fetchMySafetyCredit = (): Promise<MySafetyCredit> =>
  apiClient.request("/safety-credit/me", { method: "GET" });
export const fetchTeamSafetyCredit = (
  teamId: string,
): Promise<SafetyCreditBoard> =>
  apiClient.request(`/safety-credit/teams/${encodeURIComponent(teamId)}`, {
    method: "GET",
  });
export const fetchProjectSafetyCredit = (
  projectId: string,
): Promise<SafetyCreditBoard> =>
  apiClient.request(
    `/safety-credit/projects/${encodeURIComponent(projectId)}`,
    { method: "GET" },
  );
export const recordSafetyViolation = (
  teamId: string,
  data: SafetyViolationInput,
): Promise<SafetyViolationView> =>
  apiClient.request(
    `/safety-credit/teams/${encodeURIComponent(teamId)}/violations`,
    { method: "POST", data },
  );
export const reviewSafetyViolation = (
  projectId: string,
  id: string,
  action: SafetyDecisionAction,
  reason: string,
): Promise<void> =>
  apiClient.request(
    `/safety-credit/projects/${encodeURIComponent(projectId)}/violations/${encodeURIComponent(id)}/review`,
    { method: "POST", data: { action, reason } },
  );
export const appealSafetyViolation = (
  id: string,
  reason: string,
): Promise<void> =>
  apiClient.request(
    `/safety-credit/me/violations/${encodeURIComponent(id)}/appeals`,
    { method: "POST", data: { reason } },
  );
export const reviewSafetyAppeal = (
  projectId: string,
  id: string,
  appealId: string,
  accept: boolean,
  reason: string,
): Promise<void> =>
  apiClient.request(
    `/safety-credit/projects/${encodeURIComponent(projectId)}/violations/${encodeURIComponent(id)}/appeals/${encodeURIComponent(appealId)}/review`,
    { method: "POST", data: { accept, reason } },
  );
export const fetchSafetyPolicies = (): Promise<
  readonly SafetyCreditPolicyView[]
> => apiClient.request("/safety-credit/policies", { method: "GET" });
export const createSafetyPolicy = (
  data: SafetyCreditPolicyInput,
): Promise<SafetyCreditPolicyView> =>
  apiClient.request("/safety-credit/policies", { method: "POST", data });
export const previewSafetyEvidence = async (
  id: string,
  index: number,
): Promise<void> => {
  const file = await apiClient.request<{
    readonly contentType: string;
    readonly base64: string;
  }>(`/safety-credit/violations/${encodeURIComponent(id)}/evidence/${index}`, {
    method: "GET",
  });
  if (process.env.TARO_ENV === "weapp") {
    const path: string = `${Taro.env.USER_DATA_PATH}/safety-evidence-${Date.now()}.${file.contentType === "image/png" ? "png" : "jpg"}`;
    const fs = Taro.getFileSystemManager();
    fs.writeFileSync(path, file.base64, "base64");
    await Taro.previewImage({ urls: [path] });
    return;
  }
  await Taro.previewImage({
    urls: [`data:${file.contentType};base64,${file.base64}`],
  });
};
