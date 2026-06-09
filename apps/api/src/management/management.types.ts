import type { RoleCode } from "@construction/domain/roles.js";

export type ProjectStatusValue = "ACTIVE" | "COMPLETED" | "PREPARING" | "SUSPENDED";
export type MemberStatusValue = "ACTIVE" | "EXITED" | "SUSPENDED";
export type ProjectManagerRoleCode = Extract<RoleCode, "PROJECT_ADMIN" | "TEAM_LEADER">;
export type ParticipantTypeValue = "MANAGER" | "WORKER";

export type CreateCompanyRequest = {
  readonly name: string;
  readonly status: string;
};

export type CompanyResponse = {
  readonly id: string;
  readonly name: string;
  readonly status: string;
};

export type CreateProjectRequest = {
  readonly address: string;
  readonly centerLatitude: string;
  readonly centerLongitude: string;
  readonly geofenceRadiusM: number;
  readonly name: string;
  readonly plannedEndDate: string | null;
  readonly plannedStartDate: string;
  readonly status: ProjectStatusValue;
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

export type CreateProjectWorkerRequest = {
  readonly employmentStatus: string;
  readonly encryptedIdNumber: string;
  readonly encryptedName: string;
  readonly enteredAt: string;
  readonly exitedAt: string | null;
  readonly faceProfileStatus: string;
  readonly idNumberHash: string;
  readonly memberStatus: MemberStatusValue;
  readonly phone: string;
  readonly projectRoleLabel: string;
  readonly realNameStatus: string;
  readonly requiresAttendance: boolean;
  readonly teamId: string | null;
  readonly workType: string;
};

export type ProjectWorkerMemberResponse = {
  readonly enteredAt: string;
  readonly exitedAt: string | null;
  readonly id: string;
  readonly participantType: "WORKER";
  readonly phone: string;
  readonly profileId: string;
  readonly projectId: string;
  readonly projectRoleLabel: string;
  readonly requiresAttendance: boolean;
  readonly status: MemberStatusValue;
  readonly teamId: string | null;
};

export type CreateProjectManagerRequest = {
  readonly memberStatus: MemberStatusValue;
  readonly name: string;
  readonly phone: string;
  readonly profileStatus: string;
  readonly requiresAttendance: boolean;
  readonly roleCode: ProjectManagerRoleCode;
  readonly teamScopeId: string | null;
};

export type ProjectManagerMemberResponse = {
  readonly id: string;
  readonly participantType: "MANAGER";
  readonly phone: string;
  readonly profileId: string;
  readonly projectId: string;
  readonly projectRoleLabel: ProjectManagerRoleCode;
  readonly requiresAttendance: boolean;
  readonly status: MemberStatusValue;
  readonly teamId: string | null;
};

export type ProjectParticipantResponse = {
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
