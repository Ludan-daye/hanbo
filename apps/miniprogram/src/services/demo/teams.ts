import { memberRoleAssignments } from "../member-roles";
import type { ManagedTeam } from "../management.types";
import type { DemoState, DemoTeam } from "./state";

export const managedDemoTeam = (
  state: DemoState,
  team: DemoTeam,
): ManagedTeam => {
  const leader = state.people.find(
    (person) =>
      person.projectId === team.projectId &&
      person.memberId === team.leader?.memberId &&
      person.participantType === team.leader.participantType &&
      (person.teamId === team.id || memberRoleAssignments(person).some((role) => role.roleCode === "TEAM_LEADER" && role.teamId === team.id)) &&
      person.status === "ACTIVE",
  );
  return {
    ...team,
    workType: team.workType ?? null,
    remark: team.remark ?? null,
    updatedAt: team.updatedAt ?? "1970-01-01T00:00:00.000Z",
    memberCount: state.people.filter(
      (person) =>
        person.projectId === team.projectId &&
        person.teamId === team.id &&
        person.status === "ACTIVE",
    ).length,
    leader: leader
      ? {
          memberId: leader.memberId,
          participantType: leader.participantType,
          displayName: leader.displayName,
          phone: leader.phone,
        }
      : null,
  };
};
