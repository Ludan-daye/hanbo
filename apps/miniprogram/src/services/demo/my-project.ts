import type { MyProjectDetail, ProjectContact } from "@construction/domain";
import { ApiError } from "../apiClient";
import { memberRoleAssignments } from "../member-roles";
import { managedDemoTeam } from "./teams";
import { demoMe, type DemoState } from "./state";

export const demoMyProject = (
  state: DemoState,
  userId: string,
  projectId: string,
): MyProjectDetail => {
  const me = demoMe(state, userId);
  const person = state.people.find(
    (row) =>
      row.profileId === me.profile.id &&
      row.projectId === projectId &&
      row.status === "ACTIVE",
  );
  if (!person)
    throw new ApiError(403, "你已不在该项目中，请联系管理员核对。", {
      projectId,
    });
  const project = state.projects.find((row) => row.id === projectId);
  if (!project) throw new ApiError(404, "项目不存在。", { projectId });
  const company = state.companies.find((row) => row.id === project.companyId);
  if (!company) throw new ApiError(404, "项目所属公司不存在。", { projectId });
  const team = state.teams.find(
    (row) => row.id === person.teamId && row.projectId === projectId,
  );
  const leader =
    team?.status === "ACTIVE" ? managedDemoTeam(state, team).leader : null;
  return {
    projectId,
    projectName: project.name,
    companyName: company.name,
    status: project.status,
    address: project.address,
    centerLatitude: project.centerLatitude,
    centerLongitude: project.centerLongitude,
    geofenceRadiusM: project.geofenceRadiusM,
    locationAccuracyLimitM: null,
    contact:
      project.contactName || project.contactPhone
        ? {
            name: project.contactName ?? null,
            phone: project.contactPhone ?? null,
          }
        : null,
    managers: state.people
      .filter(
        (row) =>
          row.projectId === projectId &&
          row.status === "ACTIVE" &&
          memberRoleAssignments(row).some(
            (role) => role.roleCode === "PROJECT_ADMIN",
          ),
      )
      .map(
        (row): ProjectContact => ({ name: row.displayName, phone: row.phone }),
      ),
    team: team
      ? {
          name: team.name,
          leader: leader
            ? { name: leader.displayName, phone: leader.phone }
            : null,
        }
      : null,
    workType: person.workType,
    enteredAt: person.enteredAt,
    requiresAttendance: person.requiresAttendance,
    roles: memberRoleAssignments(person).map((role) => ({
      roleCode: role.roleCode,
      teamName:
        role.teamId === null
          ? null
          : (state.teams.find((row) => row.id === role.teamId)?.name ?? null),
    })),
  };
};
