import { apiClient } from "./client";
import type { DailyReport, ProjectParticipant, RangeReport } from "./management.types";

export const fetchParticipants = async (projectId: string): Promise<ReadonlyArray<ProjectParticipant>> =>
  apiClient.request<ReadonlyArray<ProjectParticipant>>(`/management/projects/${projectId}/participants`, { method: "GET" });

export const fetchDailyReport = async (projectId: string, date: string): Promise<DailyReport> =>
  apiClient.request<DailyReport>(`/reports/projects/${projectId}/daily?date=${date}`, { method: "GET" });

export const fetchWeeklyReport = async (projectId: string, weekStartDate: string): Promise<RangeReport> =>
  apiClient.request<RangeReport>(`/reports/projects/${projectId}/weekly?weekStartDate=${weekStartDate}`, { method: "GET" });

export const fetchMonthlyReport = async (projectId: string, month: string): Promise<RangeReport> =>
  apiClient.request<RangeReport>(`/reports/projects/${projectId}/monthly?month=${month}`, { method: "GET" });
