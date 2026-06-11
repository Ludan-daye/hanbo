import { apiClient } from "./client";
import type { CompanyParticipant, CompanyProject, DailyReport, ProjectParticipant, RangeReport } from "./management.types";

export const fetchParticipants = async (projectId: string): Promise<ReadonlyArray<ProjectParticipant>> =>
  apiClient.request<ReadonlyArray<ProjectParticipant>>(`/management/projects/${projectId}/participants`, { method: "GET" });

export const fetchDailyReport = async (projectId: string, date: string): Promise<DailyReport> =>
  apiClient.request<DailyReport>(`/reports/projects/${projectId}/daily?date=${date}`, { method: "GET" });

export const fetchWeeklyReport = async (projectId: string, weekStartDate: string): Promise<RangeReport> =>
  apiClient.request<RangeReport>(`/reports/projects/${projectId}/weekly?weekStartDate=${weekStartDate}`, { method: "GET" });

export const fetchMonthlyReport = async (projectId: string, month: string): Promise<RangeReport> =>
  apiClient.request<RangeReport>(`/reports/projects/${projectId}/monthly?month=${month}`, { method: "GET" });

export const fetchTeamParticipants = async (teamId: string): Promise<ReadonlyArray<ProjectParticipant>> =>
  apiClient.request<ReadonlyArray<ProjectParticipant>>(`/management/teams/${teamId}/participants`, { method: "GET" });

export const fetchTeamDailyReport = async (teamId: string, date: string): Promise<DailyReport> =>
  apiClient.request<DailyReport>(`/reports/teams/${teamId}/daily?date=${date}`, { method: "GET" });

export const fetchTeamWeeklyReport = async (teamId: string, weekStartDate: string): Promise<RangeReport> =>
  apiClient.request<RangeReport>(`/reports/teams/${teamId}/weekly?weekStartDate=${weekStartDate}`, { method: "GET" });

export const fetchTeamMonthlyReport = async (teamId: string, month: string): Promise<RangeReport> =>
  apiClient.request<RangeReport>(`/reports/teams/${teamId}/monthly?month=${month}`, { method: "GET" });

export const fetchCompanyProjects = async (companyId: string): Promise<ReadonlyArray<CompanyProject>> =>
  apiClient.request<ReadonlyArray<CompanyProject>>(`/management/companies/${companyId}/projects`, { method: "GET" });

export const fetchCompanyParticipants = async (companyId: string): Promise<ReadonlyArray<CompanyParticipant>> =>
  apiClient.request<ReadonlyArray<CompanyParticipant>>(`/management/companies/${companyId}/participants`, { method: "GET" });
