import { ROLE_LEVEL } from "@construction/domain/roles.js";
import {
  participantPermissionRole,
  permissionLevel,
} from "../routing/permissionLevels";
import type {
  AdditionalMemberRole,
  MemberRoleAssignment,
  ProjectParticipant,
} from "./management.types";

type MemberRolesSource = Pick<
  ProjectParticipant,
  "participantType" | "projectRoleLabel" | "teamId" | "additionalRoles"
>;

export const memberRoleAssignments = (
  person: MemberRolesSource,
): readonly MemberRoleAssignment[] => {
  const primary = participantPermissionRole(person);
  return [
    {
      roleCode: primary,
      teamId: primary === "TEAM_LEADER" ? person.teamId : null,
    },
    ...(person.additionalRoles ?? []),
  ];
};

export const memberRoleLabels = (person: MemberRolesSource): string =>
  memberRoleAssignments(person)
    .map(
      (role) =>
        `${permissionLevel(role.roleCode).name}${role.teamName ? `（${role.teamName}）` : ""}`,
    )
    .join("、");

export const memberRoleFields = (
  roles: readonly MemberRoleAssignment[],
  workerJob: string,
  teamId: string | null,
): {
  readonly projectRoleLabel: string;
  readonly teamId: string | null;
  readonly additionalRoles: readonly AdditionalMemberRole[];
} => {
  if (roles.length === 0) throw new Error("请至少选择一个项目职级。");
  if (roles.some((role) => role.roleCode === "TEAM_LEADER" && !role.teamId))
    throw new Error("请为班组长选择管理班组。");
  if (
    new Set(roles.map((role) => `${role.roleCode}:${role.teamId}`)).size !==
    roles.length
  )
    throw new Error("同一班组的职级不能重复选择。");
  const ordered = [...roles].sort(
    (a, b) => ROLE_LEVEL[b.roleCode] - ROLE_LEVEL[a.roleCode],
  );
  const primary = ordered[0]!;
  const additionalRoles: readonly AdditionalMemberRole[] = ordered
    .slice(1)
    .map((role) => {
      if (role.roleCode === "PROJECT_ADMIN")
        throw new Error("项目管理员职级不能重复。");
      return { roleCode: role.roleCode, teamId: role.teamId };
    });
  return {
    projectRoleLabel:
      primary.roleCode === "WORKER" ? workerJob : primary.roleCode,
    teamId:
      primary.roleCode === "PROJECT_ADMIN"
        ? null
        : primary.roleCode === "TEAM_LEADER"
          ? primary.teamId
          : teamId,
    additionalRoles,
  };
};
