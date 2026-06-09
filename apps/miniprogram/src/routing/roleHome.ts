import type { RoleCode } from "../services/auth.types.js";

export type PanelKey = "worker" | "teamLeader" | "projectAdmin" | "companyAdmin" | "systemAdmin" | "none";

const PANEL_BY_ROLE: Record<RoleCode, PanelKey> = {
  COMPANY_ADMIN: "companyAdmin",
  PROJECT_ADMIN: "projectAdmin",
  SYSTEM_ADMIN: "systemAdmin",
  TEAM_LEADER: "teamLeader",
  WORKER: "worker"
};

export const roleHomePanel = (highestRoleCode: RoleCode | null): PanelKey =>
  highestRoleCode === null ? "none" : PANEL_BY_ROLE[highestRoleCode];
