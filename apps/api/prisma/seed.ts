import { PrismaClient, type Prisma } from "@prisma/client";

import { ROLE_LEVEL, type PermissionCode, type RoleCode } from "../../../packages/domain/src/roles.ts";

const prisma = new PrismaClient();

type RoleSeed = {
  readonly code: RoleCode;
  readonly level: number;
  readonly name: string;
};

type PermissionSeed = {
  readonly code: PermissionCode;
  readonly name: string;
};

type RolePermissionSeed = {
  readonly permissionCode: PermissionCode;
  readonly roleCode: RoleCode;
};

type RolePermissionIdPair = {
  readonly permissionId: string;
  readonly roleId: string;
};

const roleSeeds: readonly RoleSeed[] = [
  { code: "SYSTEM_ADMIN", level: ROLE_LEVEL.SYSTEM_ADMIN, name: "System administrator" },
  { code: "COMPANY_ADMIN", level: ROLE_LEVEL.COMPANY_ADMIN, name: "Company administrator" },
  { code: "PROJECT_ADMIN", level: ROLE_LEVEL.PROJECT_ADMIN, name: "Project administrator" },
  { code: "TEAM_LEADER", level: ROLE_LEVEL.TEAM_LEADER, name: "Team leader" },
  { code: "WORKER", level: ROLE_LEVEL.WORKER, name: "Worker" }
];

const permissionSeeds: readonly PermissionSeed[] = [
  { code: "attendance.submit", name: "Submit attendance records" },
  { code: "attendance.view", name: "View attendance records" },
  { code: "binding.invitation.create", name: "Create binding invitations" },
  { code: "company.manage", name: "Manage company data" },
  { code: "makeup.approve", name: "Approve makeup attendance requests" },
  { code: "makeup.request", name: "Request makeup attendance" },
  { code: "project.create", name: "Create projects" },
  { code: "project.manage", name: "Manage projects" },
  { code: "system.manage", name: "Manage system configuration" },
  { code: "team.manage", name: "Manage teams" },
  { code: "worker.manage", name: "Manage worker profiles" }
];

const rolePermissionSeeds: readonly RolePermissionSeed[] = [
  { permissionCode: "system.manage", roleCode: "SYSTEM_ADMIN" },
  { permissionCode: "company.manage", roleCode: "COMPANY_ADMIN" },
  { permissionCode: "project.create", roleCode: "COMPANY_ADMIN" },
  { permissionCode: "attendance.view", roleCode: "PROJECT_ADMIN" },
  { permissionCode: "binding.invitation.create", roleCode: "PROJECT_ADMIN" },
  { permissionCode: "project.manage", roleCode: "PROJECT_ADMIN" },
  { permissionCode: "team.manage", roleCode: "PROJECT_ADMIN" },
  { permissionCode: "worker.manage", roleCode: "PROJECT_ADMIN" },
  { permissionCode: "attendance.view", roleCode: "TEAM_LEADER" },
  { permissionCode: "makeup.approve", roleCode: "TEAM_LEADER" },
  { permissionCode: "attendance.submit", roleCode: "WORKER" },
  { permissionCode: "makeup.request", roleCode: "WORKER" }
];

const seedRoles = async (): Promise<void> => {
  for (const role of roleSeeds) {
    await prisma.role.upsert({
      create: role,
      update: {
        level: role.level,
        name: role.name
      },
      where: {
        code: role.code
      }
    });
  }
};

const seedPermissions = async (): Promise<void> => {
  for (const permission of permissionSeeds) {
    await prisma.permission.upsert({
      create: permission,
      update: {
        name: permission.name
      },
      where: {
        code: permission.code
      }
    });
  }
};

const seedRolePermissions = async (): Promise<void> => {
  const roles = await prisma.role.findMany();
  const permissions = await prisma.permission.findMany();
  const roleIdByCode = new Map<RoleCode, string>(roles.map((role) => [role.code, role.id]));
  const permissionIdByCode = new Map<PermissionCode, string>(
    permissions.map((permission) => [permission.code, permission.id])
  );
  const desiredRolePermissionPairs: RolePermissionIdPair[] = [];

  for (const rolePermission of rolePermissionSeeds) {
    const roleId = roleIdByCode.get(rolePermission.roleCode);
    const permissionId = permissionIdByCode.get(rolePermission.permissionCode);

    if (roleId === undefined || permissionId === undefined) {
      throw new Error(
        JSON.stringify({
          message: "Cannot seed role permission without role and permission ids",
          rolePermission
        })
      );
    }

    desiredRolePermissionPairs.push({
      permissionId,
      roleId
    });
  }

  const seededRoleIds = roleSeeds.map((role: RoleSeed): string => {
    const roleId = roleIdByCode.get(role.code);

    if (roleId === undefined) {
      throw new Error(
        JSON.stringify({
          message: "Cannot converge role permissions without seeded role id",
          roleCode: role.code
        })
      );
    }

    return roleId;
  });
  const desiredRolePermissionWhere = desiredRolePermissionPairs.map(
    (pair: RolePermissionIdPair): Prisma.RolePermissionWhereInput => ({
      permissionId: pair.permissionId,
      roleId: pair.roleId
    })
  );

  await prisma.rolePermission.deleteMany({
    where: {
      roleId: {
        in: seededRoleIds
      },
      NOT: {
        OR: desiredRolePermissionWhere
      }
    }
  });

  for (const pair of desiredRolePermissionPairs) {
    await prisma.rolePermission.upsert({
      create: {
        permissionId: pair.permissionId,
        roleId: pair.roleId
      },
      update: {},
      where: {
        roleId_permissionId: {
          permissionId: pair.permissionId,
          roleId: pair.roleId
        }
      }
    });
  }
};

const main = async (): Promise<void> => {
  await seedRoles();
  await seedPermissions();
  await seedRolePermissions();
};

try {
  await main();
} finally {
  await prisma.$disconnect();
}
