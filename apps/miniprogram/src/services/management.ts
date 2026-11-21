import { apiClient } from "./client";
import type {
  DefaultAttendanceConfiguration,
  CompanyOverview,
  CompanyParticipant,
  CompanyPeoplePage,
  CompanyPeopleQuery,
  CompanyPerson,
  OffboardMode,
  ProjectAdmins,
  CompanyProject,
  CreateProjectBody,
  DailyReport,
  DefaultScheduleBody,
  DefaultShiftBody,
  ProjectInvitation,
  ProjectParticipant,
  ProjectManagerCandidate,
  ProjectOverview,
  ProjectTeam,
  WorkRoleScope,
  RangeReport,
  ReportTeamOption,
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

/** 项目管理员首页的概览：只有合计和待办条数。 */
export const fetchProjectOverview = async (
  projectId: string,
  date: string,
): Promise<ProjectOverview> =>
  apiClient.request<ProjectOverview>(
    `/management/projects/${encodeURIComponent(projectId)}/overview?date=${date}`,
    { method: "GET" },
  );

/** 公司管理员首页的概览：每个项目一行合计，加公司待办条数。 */
export const fetchCompanyOverview = async (
  companyId: string,
  date: string,
): Promise<CompanyOverview> =>
  apiClient.request<CompanyOverview>(
    `/management/companies/${encodeURIComponent(companyId)}/overview?date=${date}`,
    { method: "GET" },
  );

/** 报表按班组或按组长筛选（只能二选一）；都为 null 是全部。 */
export type ReportTeamFilter = {
  readonly teamId: string | null;
  readonly leaderMemberId: string | null;
};
export const NO_REPORT_TEAM_FILTER: ReportTeamFilter = {
  teamId: null,
  leaderMemberId: null,
};
const teamFilterQuery = (filter: ReportTeamFilter): string =>
  filter.teamId !== null
    ? `&teamId=${encodeURIComponent(filter.teamId)}`
    : filter.leaderMemberId !== null
      ? `&leaderMemberId=${encodeURIComponent(filter.leaderMemberId)}`
      : "";

/** 报表可选的班组和各班组现在的组长。 */
export const fetchReportTeamOptions = async (
  scope: "PROJECT" | "COMPANY",
  scopeId: string,
): Promise<readonly ReportTeamOption[]> =>
  apiClient.request<readonly ReportTeamOption[]>(
    `/reports/${scope === "PROJECT" ? "projects" : "companies"}/${encodeURIComponent(scopeId)}/team-options`,
    { method: "GET" },
  );

export const fetchDailyReport = async (
  projectId: string,
  date: string,
  filter: ReportTeamFilter = NO_REPORT_TEAM_FILTER,
): Promise<DailyReport> =>
  apiClient.request<DailyReport>(
    `/reports/projects/${projectId}/daily?date=${date}${teamFilterQuery(filter)}`,
    { method: "GET" },
  );

export const fetchWeeklyReport = async (
  projectId: string,
  weekStartDate: string,
  filter: ReportTeamFilter = NO_REPORT_TEAM_FILTER,
): Promise<RangeReport> =>
  apiClient.request<RangeReport>(
    `/reports/projects/${projectId}/weekly?weekStartDate=${weekStartDate}${teamFilterQuery(filter)}`,
    { method: "GET" },
  );

export const fetchMonthlyReport = async (
  projectId: string,
  month: string,
  filter: ReportTeamFilter = NO_REPORT_TEAM_FILTER,
): Promise<RangeReport> =>
  apiClient.request<RangeReport>(
    `/reports/projects/${projectId}/monthly?month=${month}${teamFilterQuery(filter)}`,
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
  filter: ReportTeamFilter = NO_REPORT_TEAM_FILTER,
): Promise<DailyReport> =>
  apiClient.request<DailyReport>(
    `/reports/companies/${companyId}/daily?date=${date}${teamFilterQuery(filter)}`,
    { method: "GET" },
  );

export const fetchCompanyWeeklyReport = async (
  companyId: string,
  weekStartDate: string,
  filter: ReportTeamFilter = NO_REPORT_TEAM_FILTER,
): Promise<RangeReport> =>
  apiClient.request<RangeReport>(
    `/reports/companies/${companyId}/weekly?weekStartDate=${weekStartDate}${teamFilterQuery(filter)}`,
    { method: "GET" },
  );

export const fetchCompanyMonthlyReport = async (
  companyId: string,
  month: string,
  filter: ReportTeamFilter = NO_REPORT_TEAM_FILTER,
): Promise<RangeReport> =>
  apiClient.request<RangeReport>(
    `/reports/companies/${companyId}/monthly?month=${month}${teamFilterQuery(filter)}`,
    { method: "GET" },
  );

export const fetchDefaultAttendanceConfiguration = async (
  projectId: string,
): Promise<DefaultAttendanceConfiguration> =>
  apiClient.request<DefaultAttendanceConfiguration>(
    `/attendance/projects/${projectId}/default-configuration`,
    { method: "GET" },
  );

const companyBase = (companyId: string): string =>
  `/management/companies/${encodeURIComponent(companyId)}`;

/** 项目负责人：公司每个项目现在的项目管理员。 */
export const fetchProjectAdmins = (companyId: string): Promise<ProjectAdmins> =>
  apiClient.request(`${companyBase(companyId)}/project-admins`, { method: "GET" });

/** 一个人在本公司各项目的任职、进退场和评分。 */
export const fetchCompanyPerson = (
  companyId: string,
  participantType: "WORKER" | "MANAGER",
  profileId: string,
): Promise<CompanyPerson> =>
  apiClient.request(
    `${companyBase(companyId)}/people/${participantType}/${encodeURIComponent(profileId)}`,
    { method: "GET" },
  );

/** 离岗：一次收回他在本公司的所有管理职务，或在所有项目办退场。 */
export const offboardCompanyPerson = (
  companyId: string,
  participantType: "WORKER" | "MANAGER",
  profileId: string,
  body: { readonly mode: OffboardMode; readonly effectiveDate: string },
): Promise<CompanyPerson> =>
  apiClient.request(
    `${companyBase(companyId)}/people/${participantType}/${encodeURIComponent(profileId)}/offboard`,
    { method: "POST", data: body },
  );

/** 公司人员分页：一人一行，筛选都在服务端做。 */
export const fetchCompanyPeoplePage = (
  companyId: string,
  query: CompanyPeopleQuery,
): Promise<CompanyPeoplePage> => {
  const pairs = Object.entries(query)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`);
  return apiClient.request(`${companyBase(companyId)}/people-page?${pairs.join("&")}`, {
    method: "GET",
  });
};
