import type { RoleCode } from "@construction/domain/roles.js";

export type ProjectStatusValue = "ACTIVE" | "COMPLETED" | "PREPARING" | "SUSPENDED";
export type MemberStatusValue = "ACTIVE" | "EXITED" | "SUSPENDED";
export type ParticipantTypeValue = "MANAGER" | "WORKER";

export type WorkRoleScope = {
  readonly roleCode: RoleCode;
  readonly scopeType: "GLOBAL" | "COMPANY" | "PROJECT" | "TEAM";
  readonly scopeId: string;
  readonly scopeName: string;
  readonly projectId: string | null;
};

export type ProjectWriteFields = {
  readonly address: string;
  readonly centerLatitude: string;
  readonly centerLongitude: string;
  readonly geofenceRadiusM: number;
  readonly name: string;
  readonly plannedEndDate: string | null;
  readonly plannedStartDate: string;
  readonly status: ProjectStatusValue;
};

export type CreateProjectRequest = ProjectWriteFields & {
  /** Defaults to true when omitted. */
  readonly applyCompanyDefaults?: boolean | undefined;
  readonly managerProfileIds: readonly string[];
  /** New manager profiles created with the project; they get access once they bind by invitation. */
  readonly newManagers?: readonly { readonly name: string; readonly phone: string }[] | undefined;
};

export type ProjectManagerCandidate = {
  readonly profileId: string;
  readonly name: string;
  readonly phone: string;
  readonly isBound: boolean;
};

export type ProjectResponse = {
  readonly address: string;
  readonly centerLatitude: string;
  readonly centerLongitude: string;
  readonly companyId: string;
  readonly geofenceRadiusM: number;
  readonly id: string;
  readonly name: string;
  readonly plannedEndDate: string | null;
  readonly plannedStartDate: string;
  readonly status: ProjectStatusValue;
  /** Company project list only: active members, and the names of the active project admins. */
  readonly activeMembers?: number;
  readonly adminNames?: readonly string[];
  /** Create only: the company defaults version copied into the project, or null. */
  readonly appliedDefaultsVersion?: number | null;
};

export type ManagedProjectResponse = ProjectResponse & {
  readonly code: string | null;
  readonly contactName: string | null;
  readonly contactPhone: string | null;
  readonly remark: string | null;
  readonly updatedAt: string;
};

export type UpdateProjectRequest = ProjectWriteFields & {
  readonly id: string;
  readonly companyId: string;
  readonly code: string | null;
  readonly contactName: string | null;
  readonly contactPhone: string | null;
  readonly remark: string | null;
  readonly expectedUpdatedAt: string;
};

export type CreateTeamRequest = {
  readonly name: string;
  readonly status: string;
};

export type TeamResponse = {
  readonly id: string;
  readonly name: string;
  readonly projectId: string;
  readonly status: string;
};

export type ProjectParticipantResponse = {
  readonly additionalRoles?: readonly { readonly roleCode: "WORKER" | "TEAM_LEADER"; readonly teamId: string | null; readonly teamName: string | null }[];
  readonly displayName: string | null;
  readonly memberId: string;
  readonly participantType: ParticipantTypeValue;
  readonly phone: string;
  readonly profileId: string;
  readonly projectId: string;
  readonly projectRoleLabel: string;
  readonly requiresAttendance: boolean;
  readonly status: MemberStatusValue;
  readonly teamId: string | null;
  readonly teamName: string | null;
};

export type CompanyParticipantResponse = ProjectParticipantResponse & {
  readonly projectName: string;
};
