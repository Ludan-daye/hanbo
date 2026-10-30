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
export type Company = {
  readonly id: string;
  readonly name: string;
  readonly status: "ACTIVE" | "SUSPENDED";
};
export type Account = {
  readonly id: string;
  readonly name: string;
  readonly phone: string;
  readonly status: "ACTIVE" | "SUSPENDED";
  readonly roleCode: RoleCode;
  readonly scopeId: string;
};
export type SystemSettings = {
  readonly supportPhone: string;
  readonly announcement: string;
};
export type AuditEntry = {
  readonly id: string;
  readonly action: string;
  readonly actor: string;
  readonly createdAt: string;
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
/** Frontend-first contracts below are implemented by the local demo adapter until backend work resumes. */
export const fetchCompanies = (): Promise<readonly Company[]> =>
  apiClient.request("/system/companies", { method: "GET" });
export const saveCompany = (body: Company): Promise<Company> =>
  apiClient.request("/system/companies", { method: "POST", data: body });
export const fetchAccounts = (): Promise<readonly Account[]> =>
  apiClient.request("/system/accounts", { method: "GET" });
export const saveAccount = (body: Account): Promise<Account> =>
  apiClient.request(`/system/accounts/${body.id}`, {
    method: "PUT",
    data: body,
  });
export const fetchSystemSettings = (): Promise<SystemSettings> =>
  apiClient.request("/system/settings", { method: "GET" });
export const saveSystemSettings = (
  body: SystemSettings,
): Promise<SystemSettings> =>
  apiClient.request("/system/settings", { method: "PUT", data: body });
export const fetchAuditEntries = (): Promise<readonly AuditEntry[]> =>
  apiClient.request("/system/audit", { method: "GET" });
export const fetchProject = (projectId: string): Promise<ManagedProject> =>
  apiClient.request(`/management/projects/${projectId}`, { method: "GET" });
export const updateProject = (body: ManagedProject): Promise<ManagedProject> =>
  apiClient.request(`/management/projects/${body.id}`, {
    method: "PUT",
    data: { ...body, expectedUpdatedAt: body.updatedAt },
  });

export const fetchAppSettings = (): Promise<SystemSettings> =>
  apiClient.request("/app/settings", { method: "GET" });
