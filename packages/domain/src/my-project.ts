import type { RoleCode } from "./roles.js";

export type ProjectContact = {
  readonly name: string | null;
  readonly phone: string | null;
};

export type MyProjectDetail = {
  readonly projectId: string;
  readonly projectName: string;
  readonly companyName: string;
  readonly status: "PREPARING" | "ACTIVE" | "SUSPENDED" | "COMPLETED";
  readonly address: string;
  readonly centerLatitude: string;
  readonly centerLongitude: string;
  readonly geofenceRadiusM: number;
  readonly locationAccuracyLimitM: number | null;
  readonly contact: ProjectContact | null;
  readonly managers: readonly ProjectContact[];
  readonly team: {
    readonly name: string;
    readonly leader: ProjectContact | null;
  } | null;
  readonly workType: string | null;
  readonly roles: readonly {
    readonly roleCode: RoleCode;
    readonly teamName: string | null;
  }[];
  readonly enteredAt: string;
  readonly requiresAttendance: boolean;
};
