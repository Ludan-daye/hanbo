import { apiClient } from "./client";
import type { ProjectEvaluation, ReportPersonDetail } from "./management.types";
export const fetchReportPerson = (
  projectId: string,
  memberId: string,
  teamId: string | null,
  from: string,
  to: string,
): Promise<ReportPersonDetail> =>
  apiClient.request<ReportPersonDetail>(
    `/reports/${teamId === null ? `projects/${encodeURIComponent(projectId)}` : `teams/${encodeURIComponent(teamId)}`}/members/${encodeURIComponent(memberId)}?from=${from}&to=${to}`,
    { method: "GET" },
  );
export const saveProjectEvaluation = (
  projectId: string,
  memberId: string,
  score: number,
  comment: string,
  expectedUpdatedAt: string | null,
): Promise<ProjectEvaluation> =>
  apiClient.request<ProjectEvaluation>(
    `/reports/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(memberId)}/evaluation`,
    { method: "POST", data: { score, comment, expectedUpdatedAt } },
  );
