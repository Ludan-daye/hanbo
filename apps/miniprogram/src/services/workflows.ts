import { apiClient } from "./client";
import type { RoleCode } from "./auth.types";
import type {
  CompanyProject,
  MemberStatus,
  ParticipantType,
  ProjectParticipant,
  ProjectTeam,
} from "./management.types";

export type PersonForm = {
  readonly displayName: string;
  readonly phone: string;
  readonly participantType: ParticipantType;
  readonly projectRoleLabel: string;
  readonly teamId: string | null;
  readonly requiresAttendance: boolean;
  readonly status: MemberStatus;
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

/** Frontend-first contract: personnel encryption and authorization belong to the future server implementation. */
export const createPerson = (
  projectId: string,
  body: PersonForm,
): Promise<ProjectParticipant> =>
  apiClient.request(`/management/projects/${projectId}/participants`, {
    method: "POST",
    data: body,
  });
/** Frontend-first contract for member updates; the existing server does not implement this endpoint yet. */
export const updatePerson = (
  projectId: string,
  memberId: string,
  body: PersonForm,
): Promise<ProjectParticipant> =>
  apiClient.request(
    `/management/projects/${projectId}/participants/${memberId}`,
    { method: "PUT", data: body },
  );
export const createTeam = (
  projectId: string,
  name: string,
): Promise<ProjectTeam> =>
  apiClient.request(`/management/projects/${projectId}/teams`, {
    method: "POST",
    data: { name, status: "ACTIVE" },
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
export const fetchProject = (projectId: string): Promise<CompanyProject> =>
  apiClient.request(`/management/projects/${projectId}`, { method: "GET" });
export const updateProject = (body: CompanyProject): Promise<CompanyProject> =>
  apiClient.request(`/management/projects/${body.id}`, {
    method: "PUT",
    data: body,
  });

export const fetchAppSettings = (): Promise<SystemSettings> =>
  apiClient.request("/app/settings", { method: "GET" });
