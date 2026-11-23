import { apiClient } from "./client";
import type { RoleCode } from "./auth.types";
import type {
  AdditionalMemberRole,
  MemberStatus,
  ParticipantType,
  ProjectTeam,
  ManagedParticipant,
  ManagedProject,
  ParticipantPage,
  ParticipantPageOptions,
  ManagedTeam,
  TeamForm,
  ReuseProject,
  ReusePersonForm,
} from "./management.types";

export type PersonForm = {
  readonly additionalRoles?: readonly AdditionalMemberRole[];
  readonly displayName: string;
  readonly phone: string;
  readonly participantType: ParticipantType;
  readonly projectRoleLabel: string;
  readonly workType: string;
  readonly teamId: string | null;
  readonly requiresAttendance: boolean;
  readonly status: MemberStatus;
  readonly enteredAt: string;
  readonly exitedAt: string | null;
  readonly expectedUpdatedAt: string | null;
  readonly expectedProfileUpdatedAt: string | null;
};
export type CompanyStatus = "ACTIVE" | "SUSPENDED";
/** 一家公司最基本的三项（演示数据、账号的管理范围用）。 */
export type Company = {
  readonly id: string;
  readonly name: string;
  readonly status: CompanyStatus;
};
/** 平台“公司”标签的一行：/system/companies。 */
export type CompanyAdminSummary = {
  readonly isBound: boolean;
  readonly memberId: string;
  readonly name: string;
  readonly phone: string;
};
export type PlatformCompany = {
  readonly activeProjectCount: number;
  readonly admins: readonly CompanyAdminSummary[];
  readonly createdAt: string;
  readonly creditCode: string | null;
  readonly id: string;
  readonly name: string;
  readonly projectCount: number;
  readonly shortName: string | null;
  readonly status: string;
};
export type PlatformCompanyPage = {
  readonly items: readonly PlatformCompany[];
  readonly nextCursor: string | null;
};
/** 还没绑定的公司管理员，最近一张邀请码的情况；过期是服务器算的。 */
export type CompanyAdminInvitation = {
  readonly expiresAt: string;
  readonly status: "PENDING" | "EXPIRED" | "ACCEPTED" | "REVOKED";
};
export type CompanyAdmin = CompanyAdminSummary & {
  readonly appointedAt: string;
  readonly invitation: CompanyAdminInvitation | null;
  readonly managerProfileId: string;
};
export type PlatformCompanyDetail = Omit<PlatformCompany, "admins"> & {
  readonly address: string | null;
  readonly admins: readonly CompanyAdmin[];
  readonly contactName: string | null;
  readonly contactPhone: string | null;
  readonly updatedAt: string;
};
/** 新增、修改公司时填的资料；名称以外都可以空着（null）。 */
export type CompanyForm = {
  readonly address: string | null;
  readonly contactName: string | null;
  readonly contactPhone: string | null;
  readonly creditCode: string | null;
  readonly name: string;
  readonly shortName: string | null;
};
export type CompanyAdminCandidate = {
  readonly managerProfileId: string;
  readonly name: string;
  readonly phone: string;
};
/** 选一个已有的管理账号，或录入新人（他用邀请码绑定）。 */
export type CompanyAdminAppointment =
  | { readonly managerProfileId: string }
  | { readonly name: string; readonly phone: string };
/** 邀请码只在生成的这一次返回。 */
export type IssuedInvitation = {
  readonly code: string;
  readonly expiresAt: string;
};
export type CompanyAdminAppointed = {
  readonly invitation: IssuedInvitation | null;
  readonly member: CompanyAdmin;
};
/** 演示数据里的账号：一个账号一个等级（真实账号的身份见 PlatformAccountDetail）。 */
export type Account = {
  readonly id: string;
  readonly name: string;
  readonly phone: string;
  readonly status: "ACTIVE" | "SUSPENDED";
  readonly roleCode: RoleCode;
  readonly scopeId: string;
};
/** 平台“账号”标签的一行：/system/accounts，只列绑定了的账号。 */
export type PlatformAccountStatus = "ACTIVE" | "DISABLED";
export type PlatformAccount = {
  readonly displayName: string;
  readonly highestRoleCode: RoleCode | null;
  readonly lastLoginAt: string | null;
  readonly phone: string | null;
  readonly profileType: "MANAGER" | "WORKER" | null;
  readonly roleCount: number;
  readonly status: PlatformAccountStatus;
  readonly userId: string;
};
export type PlatformAccountPage = {
  readonly items: readonly PlatformAccount[];
  readonly nextCursor: string | null;
};
/** 一条身份从哪来，也就是去哪改：平台（服务器命令）、公司任命、项目成员。 */
export type PlatformAccountRole = {
  readonly companyId: string | null;
  readonly memberId: string | null;
  readonly projectId: string | null;
  readonly roleCode: RoleCode;
  readonly scopeId: string;
  readonly scopeName: string;
  readonly scopeType: "GLOBAL" | "COMPANY" | "PROJECT" | "TEAM";
  readonly source: "PLATFORM" | "COMPANY_APPOINTMENT" | "PROJECT_MEMBERSHIP";
};
export type PlatformAccountDetail = PlatformAccount & {
  readonly activeSessionCount: number;
  readonly createdAt: string;
  readonly isSystemAdmin: boolean;
  readonly profileId: string | null;
  readonly roles: readonly PlatformAccountRole[];
};
export type SystemSettings = {
  readonly supportPhone: string;
  readonly announcement: string;
};

export const createPerson = (
  projectId: string,
  body: PersonForm,
): Promise<ManagedParticipant> =>
  apiClient.request(`/management/projects/${projectId}/participants`, {
    method: "POST",
    data: body,
  });
export const updatePerson = (
  projectId: string,
  memberId: string,
  body: PersonForm,
): Promise<ManagedParticipant> =>
  apiClient.request(
    `/management/projects/${projectId}/participants/${memberId}`,
    { method: "PUT", data: body },
  );
export const fetchPerson = (
  projectId: string,
  memberId: string,
): Promise<ManagedParticipant> =>
  apiClient.request(
    `/management/projects/${projectId}/participants/${memberId}`,
    { method: "GET" },
  );

export const fetchParticipantPage = (
  projectId: string,
  options: ParticipantPageOptions,
): Promise<ParticipantPage> => {
  const query: string[] = [
    `page=${options.page}`,
    `pageSize=${options.pageSize}`,
    `search=${encodeURIComponent(options.search)}`,
  ];
  if (options.permissionRole !== undefined && options.permissionRole !== null)
    query.push(`permissionRole=${options.permissionRole}`);
  if (options.participantType !== null)
    query.push(`participantType=${options.participantType}`);
  if (options.teamId !== null)
    query.push(`teamId=${encodeURIComponent(options.teamId)}`);
  if (options.status !== null) query.push(`status=${options.status}`);
  if (options.notInProjectId)
    query.push(`notInProjectId=${encodeURIComponent(options.notInProjectId)}`);
  return apiClient.request(
    `/management/projects/${projectId}/participant-page?${query.join("&")}`,
    { method: "GET" },
  );
};
export const createTeam = (
  projectId: string,
  name: string,
): Promise<ProjectTeam> =>
  apiClient.request(`/management/projects/${projectId}/teams`, {
    method: "POST",
    data: { name, status: "ACTIVE" },
  });
export const fetchManagedTeams = (
  projectId: string,
): Promise<readonly ManagedTeam[]> =>
  apiClient.request(`/management/projects/${projectId}/managed-teams`, {
    method: "GET",
  });
export const fetchManagedTeam = (
  projectId: string,
  teamId: string,
): Promise<ManagedTeam> =>
  apiClient.request(`/management/projects/${projectId}/teams/${teamId}`, {
    method: "GET",
  });
/** 班组负责人的一次变更（2026-11-20 起记录）。 */
export type TeamLeaderChange = {
  readonly id: string;
  readonly changedAt: string;
  readonly reason: "TEAM_UPDATED" | "MEMBER_INACTIVE" | "MEMBER_TRANSFERRED" | "MEMBER_OFFBOARDED";
  readonly previousLeaderName: string | null;
  readonly leaderName: string | null;
  readonly changedByName: string | null;
};
/** 最近的负责人变更，新的在前。 */
export const fetchTeamLeaderHistory = (
  projectId: string,
  teamId: string,
): Promise<readonly TeamLeaderChange[]> =>
  apiClient.request(
    `/management/projects/${projectId}/teams/${teamId}/leader-history`,
    { method: "GET" },
  );
export const updateTeam = (
  projectId: string,
  teamId: string,
  body: TeamForm,
): Promise<ManagedTeam> =>
  apiClient.request(`/management/projects/${projectId}/teams/${teamId}`, {
    method: "PUT",
    data: body,
  });
export const fetchReuseProjects = (
  projectId: string,
): Promise<readonly ReuseProject[]> =>
  apiClient.request(`/management/projects/${projectId}/reuse-projects`, {
    method: "GET",
  });
export const reusePerson = (
  projectId: string,
  body: ReusePersonForm,
): Promise<ManagedParticipant> =>
  apiClient.request(`/management/projects/${projectId}/reused-participants`, {
    method: "POST",
    data: body,
  });
/** 平台的公司列表，一页 30 家，新建的在前。 */
export const fetchCompanies = (options: {
  readonly search: string;
  readonly status: CompanyStatus | null;
  readonly cursor: string | null;
}): Promise<PlatformCompanyPage> => {
  const query: string[] = [];
  if (options.search.trim()) query.push(`search=${encodeURIComponent(options.search.trim())}`);
  if (options.status !== null) query.push(`status=${options.status}`);
  if (options.cursor !== null) query.push(`cursor=${encodeURIComponent(options.cursor)}`);
  return apiClient.request(
    `/system/companies${query.length > 0 ? `?${query.join("&")}` : ""}`,
    { method: "GET" },
  );
};
export const createCompany = (body: CompanyForm): Promise<PlatformCompanyDetail> =>
  apiClient.request("/system/companies", { method: "POST", data: body });
export const fetchCompany = (companyId: string): Promise<PlatformCompanyDetail> =>
  apiClient.request(`/system/companies/${encodeURIComponent(companyId)}`, { method: "GET" });
export const updateCompany = (
  companyId: string,
  body: CompanyForm & { readonly expectedUpdatedAt: string },
): Promise<PlatformCompanyDetail> =>
  apiClient.request(`/system/companies/${encodeURIComponent(companyId)}`, { method: "PUT", data: body });
/** 暂停（只读，Q5）或恢复一家公司；带上读到的 updatedAt，别人刚改过就是 409。 */
export const setCompanyStatus = (
  companyId: string,
  body: { readonly status: "ACTIVE" | "SUSPENDED"; readonly expectedUpdatedAt: string },
): Promise<PlatformCompanyDetail> =>
  apiClient.request(`/system/companies/${encodeURIComponent(companyId)}/status`, { method: "POST", data: body });
export const fetchCompanyAdminCandidates = (
  companyId: string,
  search: string,
): Promise<readonly CompanyAdminCandidate[]> =>
  apiClient.request(
    `/system/companies/${encodeURIComponent(companyId)}/admin-candidates?search=${encodeURIComponent(search.trim())}`,
    { method: "GET" },
  );
export const appointCompanyAdmin = (
  companyId: string,
  body: CompanyAdminAppointment,
): Promise<CompanyAdminAppointed> =>
  apiClient.request(`/system/companies/${encodeURIComponent(companyId)}/admins`, { method: "POST", data: body });
export const reissueCompanyAdminInvitation = (
  companyId: string,
  memberId: string,
): Promise<IssuedInvitation> =>
  apiClient.request(
    `/system/companies/${encodeURIComponent(companyId)}/admins/${encodeURIComponent(memberId)}/invitation`,
    { method: "POST" },
  );
export const revokeCompanyAdmin = (
  companyId: string,
  memberId: string,
): Promise<{ readonly remainingAdmins: number }> =>
  apiClient.request(
    `/system/companies/${encodeURIComponent(companyId)}/admins/${encodeURIComponent(memberId)}/revoke`,
    { method: "POST" },
  );
/** 平台的账号，一页 30 个，新的在前；按姓名、手机号在服务器上查，也可以只要有某种身份的。 */
export const fetchAccounts = (options: {
  readonly search: string;
  readonly status: PlatformAccountStatus | null;
  readonly cursor: string | null;
  readonly role?: RoleCode;
}): Promise<PlatformAccountPage> => {
  const query: string[] = [];
  if (options.role !== undefined) query.push(`role=${options.role}`);
  if (options.search.trim()) query.push(`search=${encodeURIComponent(options.search.trim())}`);
  if (options.status !== null) query.push(`status=${options.status}`);
  if (options.cursor !== null) query.push(`cursor=${encodeURIComponent(options.cursor)}`);
  return apiClient.request(
    `/system/accounts${query.length > 0 ? `?${query.join("&")}` : ""}`,
    { method: "GET" },
  );
};
export const fetchAccount = (userId: string): Promise<PlatformAccountDetail> =>
  apiClient.request(`/system/accounts/${encodeURIComponent(userId)}`, { method: "GET" });
/** 停用：他立刻退出登录，任职和记录都不动。 */
export const disableAccount = (userId: string): Promise<PlatformAccountDetail> =>
  apiClient.request(`/system/accounts/${encodeURIComponent(userId)}/disable`, { method: "POST" });
export const enableAccount = (userId: string): Promise<PlatformAccountDetail> =>
  apiClient.request(`/system/accounts/${encodeURIComponent(userId)}/enable`, { method: "POST" });
// 平台设置的接口服务器还没有（平台规划第五期），现在只有演示版。
export const fetchSystemSettings = (): Promise<SystemSettings> =>
  apiClient.request("/system/settings", { method: "GET" });
export const saveSystemSettings = (
  body: SystemSettings,
): Promise<SystemSettings> =>
  apiClient.request("/system/settings", { method: "PUT", data: body });
export const fetchProject = (projectId: string): Promise<ManagedProject> =>
  apiClient.request(`/management/projects/${projectId}`, { method: "GET" });
export const updateProject = (body: ManagedProject): Promise<ManagedProject> =>
  apiClient.request(`/management/projects/${body.id}`, {
    method: "PUT",
    data: { ...body, expectedUpdatedAt: body.updatedAt },
  });

export const fetchAppSettings = (): Promise<SystemSettings> =>
  apiClient.request("/app/settings", { method: "GET" });
