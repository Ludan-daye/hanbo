import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  GLOBAL_SCOPE_ID,
  ROLE_LEVEL,
  type AuthorizationTargetScope,
  type PermissionCode,
  type PermissionsByRoleCode,
  type RoleCode,
  type ScopeType,
  type ScopedRoleAssignment
} from "@construction/domain/roles.js";

import { PrismaService } from "../infrastructure/database/prisma.service.js";

import type { AuthorizationData, PermissionTarget, RequestWithAuthorizationParams } from "./authorization.types.js";

type MutablePermissionsByRoleCode = {
  [roleCode in RoleCode]: PermissionCode[];
};

type RoleWithPermissions = {
  readonly code: string;
  readonly permissions: readonly {
    readonly permission: {
      readonly code: string;
    };
  }[];
};

type UserRoleWithRole = {
  readonly role: {
    readonly code: string;
  };
  readonly scopeId: string;
  readonly scopeType: string;
};

const roleCodes = Object.keys(ROLE_LEVEL) as RoleCode[];

const emptyPermissionsByRoleCode = (): MutablePermissionsByRoleCode => ({
  COMPANY_ADMIN: [],
  PROJECT_ADMIN: [],
  SYSTEM_ADMIN: [],
  TEAM_LEADER: [],
  WORKER: []
});

const toRoleCode = (roleCode: string): RoleCode => {
  if (roleCodes.includes(roleCode as RoleCode)) {
    return roleCode as RoleCode;
  }

  throw new Error(
    JSON.stringify({
      message: "Unknown role code from database",
      roleCode
    })
  );
};

const toScopeType = (scopeType: string): ScopeType => {
  if (scopeType === "GLOBAL" || scopeType === "COMPANY" || scopeType === "PROJECT" || scopeType === "TEAM") {
    return scopeType;
  }

  throw new Error(
    JSON.stringify({
      message: "Unknown scope type from database",
      scopeType
    })
  );
};

const getRequiredParam = (request: RequestWithAuthorizationParams, paramName: string): string => {
  const value = request.params[paramName];

  if (value === undefined || value.length === 0) {
    throw new BadRequestException({
      message: "MISSING_AUTHORIZATION_TARGET_PARAM",
      paramName
    });
  }

  return value;
};

const buildPermissionsByRoleCode = (roles: readonly RoleWithPermissions[]): PermissionsByRoleCode => {
  const permissionsByRoleCode = emptyPermissionsByRoleCode();

  for (const role of roles) {
    const roleCode = toRoleCode(role.code);
    permissionsByRoleCode[roleCode] = role.permissions.map(
      (rolePermission): PermissionCode => rolePermission.permission.code
    );
  }

  return permissionsByRoleCode;
};

const buildAssignments = (userRoles: readonly UserRoleWithRole[]): readonly ScopedRoleAssignment[] =>
  userRoles.map(
    (userRole): ScopedRoleAssignment => ({
      roleCode: toRoleCode(userRole.role.code),
      scope: {
        scopeId: userRole.scopeId,
        scopeType: toScopeType(userRole.scopeType)
      }
    })
  );

@Injectable()
export class AuthorizationContextService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async loadAuthorizationData(userId: string): Promise<AuthorizationData> {
    const [userRoles, roles] = await Promise.all([
      this.prisma.userRole.findMany({
        include: {
          role: true
        },
        where: {
          userId
        }
      }),
      this.prisma.role.findMany({
        include: {
          permissions: {
            include: {
              permission: true
            }
          }
        }
      })
    ]);

    return {
      assignments: buildAssignments(userRoles),
      permissionsByRoleCode: buildPermissionsByRoleCode(roles)
    };
  }

  async resolveTargetScope(
    target: PermissionTarget,
    request: RequestWithAuthorizationParams
  ): Promise<AuthorizationTargetScope> {
    if (target.source === "static") {
      return target.targetScope;
    }

    if (target.source === "companyParam") {
      const companyId = getRequiredParam(request, target.paramName);
      return {
        companyId,
        scopeId: companyId,
        scopeType: "COMPANY"
      };
    }

    if (target.source === "projectParam") {
      const projectId = getRequiredParam(request, target.paramName);
      const project = await this.prisma.project.findUnique({
        where: {
          id: projectId
        }
      });

      if (project === null) {
        throw new NotFoundException({
          message: "AUTHORIZATION_PROJECT_NOT_FOUND",
          projectId
        });
      }

      return {
        companyId: project.companyId,
        projectId: project.id,
        scopeId: project.id,
        scopeType: "PROJECT"
      };
    }

    const teamId = getRequiredParam(request, target.paramName);
    const team = await this.prisma.team.findUnique({
      include: {
        project: true
      },
      where: {
        id: teamId
      }
    });

    if (team === null) {
      throw new NotFoundException({
        message: "AUTHORIZATION_TEAM_NOT_FOUND",
        teamId
      });
    }

    return {
      companyId: team.project.companyId,
      projectId: team.projectId,
      scopeId: team.id,
      scopeType: "TEAM",
      teamId: team.id
    };
  }

  createGlobalTargetScope(): AuthorizationTargetScope {
    return {
      scopeId: GLOBAL_SCOPE_ID,
      scopeType: "GLOBAL"
    };
  }
}
