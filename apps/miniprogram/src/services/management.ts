import { apiClient } from "./client";
import type {
  DefaultAttendanceConfiguration,
  CompanyParticipant,
  CompanyProject,
  CreateProjectBody,
  DailyReport,
  DefaultScheduleBody,
  DefaultShiftBody,
  ProjectInvitation,
  ProjectParticipant,
  ProjectManagerCandidate,
  ProjectTeam,
  WorkRoleScope,
  RangeReport,
} from "./management.types";

export const fetchMyRoleScopes = (): Promise<readonly WorkRoleScope[]> =>
  apiClient.request("/management/my-role-scopes", { method: "GET" });

export const fetchParticipants = async (
  projectId: string,
): Promise<ReadonlyArray<ProjectParticipant>> =>
  apiClient.request<ReadonlyArray<ProjectParticipant>>(
    `/management/projects/${projectId}/participants`,
    { method: "GET" },
  );

export const fetchDailyReport = async (
  projectId: string,
  date: string,
): Promise<DailyReport> =>
  apiClient.request<DailyReport>(
    `/reports/projects/${projectId}/daily?date=${date}`,
    { method: "GET" },
  );

export const fetchWeeklyReport = async (
  projectId: string,
  weekStartDate: string,
): Promise<RangeReport> =>
  apiClient.request<RangeReport>(
    `/reports/projects/${projectId}/weekly?weekStartDate=${weekStartDate}`,
    { method: "GET" },
  );

export const fetchMonthlyReport = async (
  projectId: string,
  month: string,
): Promise<RangeReport> =>
  apiClient.request<RangeReport>(
    `/reports/projects/${projectId}/monthly?month=${month}`,
    { method: "GET" },
  );

export const fetchTeamParticipants = async (
  teamId: string,
): Promise<ReadonlyArray<ProjectParticipant>> =>
  apiClient.request<ReadonlyArray<ProjectParticipant>>(
    `/management/teams/${teamId}/participants`,
    { method: "GET" },
  );

export const fetchTeamDailyReport = async (
  teamId: string,
  date: string,
): Promise<DailyReport> =>
  apiClient.request<DailyReport>(
    `/reports/teams/${teamId}/daily?date=${date}`,
    { method: "GET" },
  );

export const fetchTeamWeeklyReport = async (
  teamId: string,
  weekStartDate: string,
): Promise<RangeReport> =>
  apiClient.request<RangeReport>(
    `/reports/teams/${teamId}/weekly?weekStartDate=${weekStartDate}`,
    { method: "GET" },
  );

export const fetchTeamMonthlyReport = async (
  teamId: string,
  month: string,
): Promise<RangeReport> =>
  apiClient.request<RangeReport>(
    `/reports/teams/${teamId}/monthly?month=${month}`,
    { method: "GET" },
  );

export const fetchCompanyProjects = async (
  companyId: string,
): Promise<ReadonlyArray<CompanyProject>> =>
  apiClient.request<ReadonlyArray<CompanyProject>>(
    `/management/companies/${companyId}/projects`,
    { method: "GET" },
  );

export const fetchCompanyParticipants = async (
  companyId: string,
): Promise<ReadonlyArray<CompanyParticipant>> =>
  apiClient.request<ReadonlyArray<CompanyParticipant>>(
    `/management/companies/${companyId}/participants`,
    { method: "GET" },
  );

export const fetchProjectTeams = async (
  projectId: string,
): Promise<ReadonlyArray<ProjectTeam>> =>
  apiClient.request<ReadonlyArray<ProjectTeam>>(
    `/management/projects/${projectId}/teams`,
    { method: "GET" },
  );

export const fetchProjectInvitations = async (
  projectId: string,
): Promise<ReadonlyArray<ProjectInvitation>> =>
  apiClient.request<ReadonlyArray<ProjectInvitation>>(
    `/management/projects/${projectId}/invitations`,
    { method: "GET" },
  );

export const revokeProjectInvitation = async (
  projectId: string,
  invitationId: string,
): Promise<ProjectInvitation> =>
  apiClient.request<ProjectInvitation>(
    `/management/projects/${projectId}/invitations/${invitationId}/revoke`,
    { method: "POST" },
  );

export const configureDefaultShift = async (
  projectId: string,
  body: DefaultShiftBody,
): Promise<unknown> =>
  apiClient.request<unknown>(
    `/attendance/projects/${projectId}/default-shift`,
    { data: body, method: "PUT" },
  );

export const configureDefaultSchedule = async (
  projectId: string,
  body: DefaultScheduleBody,
): Promise<unknown> =>
  apiClient.request<unknown>(
    `/attendance/projects/${projectId}/default-schedule`,
    { data: body, method: "PUT" },
  );

export const createCompanyProject = async (
  companyId: string,
  body: CreateProjectBody,
): Promise<CompanyProject> =>
  apiClient.request<CompanyProject>(
    `/management/companies/${companyId}/projects`,
    { data: body, method: "POST" },
  );

export const fetchProjectManagerCandidates = async (
  companyId: string,
  search: string,
): Promise<readonly ProjectManagerCandidate[]> =>
  apiClient.request<readonly ProjectManagerCandidate[]>(
    `/management/companies/${companyId}/project-manager-candidates?search=${encodeURIComponent(search)}`,
    { method: "GET" },
  );

export const fetchCompanyDailyReport = async (
  companyId: string,
  date: string,
): Promise<DailyReport> =>
  apiClient.request<DailyReport>(
    `/reports/companies/${companyId}/daily?date=${date}`,
    { method: "GET" },
  );

export const fetchCompanyWeeklyReport = async (
  companyId: string,
  weekStartDate: string,
): Promise<RangeReport> =>
  apiClient.request<RangeReport>(
    `/reports/companies/${companyId}/weekly?weekStartDate=${weekStartDate}`,
    { method: "GET" },
  );

export const fetchCompanyMonthlyReport = async (
  companyId: string,
  month: string,
): Promise<RangeReport> =>
  apiClient.request<RangeReport>(
    `/reports/companies/${companyId}/monthly?month=${month}`,
    { method: "GET" },
  );

export const fetchDefaultAttendanceConfiguration = async (
  projectId: string,
): Promise<DefaultAttendanceConfiguration> =>
  apiClient.request<DefaultAttendanceConfiguration>(
    `/attendance/projects/${projectId}/default-configuration`,
    { method: "GET" },
  );
