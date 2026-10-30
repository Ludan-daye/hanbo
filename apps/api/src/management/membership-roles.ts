import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { Prisma, RoleCode, UserRoleScopeType, ProjectMemberRole, Team } from "@prisma/client";
import { ROLE_LEVEL } from "@construction/domain/roles.js";
import { workerRole } from "../attendance/member-history.js";
import type { AdditionalMemberRole } from "./participants.types.js";

export type MembershipGrant = {
  readonly roleCode: RoleCode;
  readonly scopeId: string;
  readonly scopeType: UserRoleScopeType;
};

export const readAdditionalRoles = (
  roles: readonly {
    readonly roleCode: RoleCode;
    readonly teamId: string | null;
  }[],
): readonly AdditionalMemberRole[] =>
  roles.map((role) => {
    if (role.roleCode !== "WORKER" && role.roleCode !== "TEAM_LEADER")
      throw new Error("Invalid stored additional member role.");
    return { roleCode: role.roleCode, teamId: role.teamId };
  });

export const membershipGrants = (
  projectId: string,
  label: string,
  teamId: string | null,
  additionalRoles: readonly AdditionalMemberRole[],
): readonly MembershipGrant[] => {
  const primaryRole = workerRole(label);
  return [
    {
      roleCode: primaryRole,
      teamId: primaryRole === "TEAM_LEADER" ? teamId : null,
    },
    ...additionalRoles,
  ].map(
    (role): MembershipGrant => ({
      roleCode: role.roleCode,
      scopeType: role.roleCode === "TEAM_LEADER" ? "TEAM" : "PROJECT",
      scopeId: role.roleCode === "TEAM_LEADER" ? role.teamId! : projectId,
    }),
  );
};

export const validateAdditionalRoles = async (
  transaction: Prisma.TransactionClient,
  projectId: string,
  label: string,
  teamId: string | null,
  roles: readonly AdditionalMemberRole[],
): Promise<void> => {
  const grants = membershipGrants(projectId, label, teamId, roles);
  if (
    roles.some(
      (role) => ROLE_LEVEL[role.roleCode] > ROLE_LEVEL[workerRole(label)],
    ) ||
    new Set(grants.map((role) => `${role.roleCode}:${role.scopeId}`)).size !==
      grants.length
  ) {
    throw new BadRequestException({
      message: "INVALID_ADDITIONAL_MEMBER_ROLES",
      projectId,
    });
  }
  const teamIds = roles
    .filter((role) => role.roleCode === "TEAM_LEADER")
    .map((role) => role.teamId!);
  if (
    teamIds.length > 0 &&
    (await transaction.team.count({
      where: { projectId, id: { in: teamIds } },
    })) !== teamIds.length
  ) {
    throw new BadRequestException({
      message: "TEAM_DOES_NOT_BELONG_TO_PROJECT",
      projectId,
    });
  }
};

export const synchronizeMembershipGrants = async (
  transaction: Prisma.TransactionClient,
  userId: string | null,
  previous: readonly MembershipGrant[],
  next: readonly MembershipGrant[],
): Promise<void> => {
  if (userId === null) return;
  for (const grant of previous) {
    if (
      !next.some(
        (role) =>
          role.roleCode === grant.roleCode &&
          role.scopeId === grant.scopeId &&
          role.scopeType === grant.scopeType,
      )
    ) {
      await transaction.userRole.deleteMany({
        where: {
          userId,
          scopeId: grant.scopeId,
          scopeType: grant.scopeType,
          role: { code: grant.roleCode },
        },
      });
    }
  }
  for (const grant of next) {
    const role = await transaction.role.findUnique({
      where: { code: grant.roleCode },
    });
    if (role === null)
      throw new NotFoundException({
        message: "MEMBERSHIP_ROLE_NOT_CONFIGURED",
        roleCode: grant.roleCode,
      });
    const assignment = {
      userId,
      roleId: role.id,
      scopeId: grant.scopeId,
      scopeType: grant.scopeType,
    };
    await transaction.userRole.upsert({
      where: { userId_roleId_scopeType_scopeId: assignment },
      create: assignment,
      update: {},
    });
  }
};

export const replaceAdditionalRoles = async (
  transaction: Prisma.TransactionClient,
  projectId: string,
  memberId: string,
  type: "WORKER" | "MANAGER",
  roles: readonly AdditionalMemberRole[],
): Promise<void> => {
  const owner =
    type === "WORKER"
      ? { workerMemberId: memberId }
      : { managerMemberId: memberId };
  await transaction.projectMemberRole.deleteMany({
    where: { projectId, ...owner },
  });
  if (roles.length > 0)
    await transaction.projectMemberRole.createMany({
      data: roles.map((role) => ({
        projectId,
        ...owner,
        roleCode: role.roleCode,
        teamId: role.teamId,
        scopeId: role.teamId ?? projectId,
      })),
    });
};

export const additionalRoleView = (
  role: ProjectMemberRole & { team: Team | null },
): AdditionalMemberRole & { teamName: string | null } => {
  if (role.roleCode !== "WORKER" && role.roleCode !== "TEAM_LEADER")
    throw new Error("Invalid stored additional member role.");
  return {
    roleCode: role.roleCode,
    teamId: role.teamId,
    teamName: role.team?.name ?? null,
  };
};
