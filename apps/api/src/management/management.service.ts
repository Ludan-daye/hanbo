import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  Company,
  ManagerProfile,
  Project,
  ProjectManagerMember,
  ProjectWorkerMember,
  Team,
  WorkerProfile
} from "@prisma/client";

import { API_ENV } from "../config/env.module.js";
import type { ApiEnv } from "../config/env.js";
import { decryptPersonnelName } from "./personnel-name.js";
import { PrismaService } from "../infrastructure/database/prisma.service.js";
import type { BindingTargetTypeValue } from "../bindings/bindings.types.js";
import type { BindingInvitationListItem } from "./management-invitation.types.js";

import type {
  CompanyParticipantResponse,
  CompanyResponse,
  CreateCompanyRequest,
  CreateProjectManagerRequest,
  CreateProjectRequest,
  CreateProjectWorkerRequest,
  CreateTeamRequest,
  MemberStatusValue,
  ProjectManagerRoleCode,
  ProjectManagerMemberResponse,
  ProjectParticipantResponse,
  ProjectResponse,
  ProjectStatusValue,
  ProjectWorkerMemberResponse,
  ManagedProjectResponse,
  UpdateProjectRequest,
  TeamResponse
} from "./management.types.js";

type WorkerMemberWithProfileAndTeam = ProjectWorkerMember & {
  readonly team: Team | null;
  readonly worker: WorkerProfile;
};

type ManagerMemberWithProfileAndTeam = ProjectManagerMember & {
  readonly manager: ManagerProfile;
  readonly teamScope: Team | null;
};

const dateOnlyToDate = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

const toDateOnly = (value: Date): string => value.toISOString().slice(0, 10);

const toIsoStringOrNull = (value: Date | null): string | null => {
  if (value === null) {
    return null;
  }

  return value.toISOString();
};

const createCompanyResponse = (company: Company): CompanyResponse => ({
  id: company.id,
  name: company.name,
  status: company.status
});

const createProjectResponse = (project: Project): ProjectResponse => ({
  address: project.address,
  centerLatitude: String(project.centerLatitude),
  centerLongitude: String(project.centerLongitude),
  companyId: project.companyId,
  geofenceRadiusM: project.geofenceRadiusM,
  id: project.id,
  name: project.name,
  plannedEndDate: project.plannedEndDate === null ? null : toDateOnly(project.plannedEndDate),
  plannedStartDate: toDateOnly(project.plannedStartDate),
  status: project.status as ProjectStatusValue
});

const createTeamResponse = (team: Team): TeamResponse => ({
  id: team.id,
  name: team.name,
  projectId: team.projectId,
  status: team.status
});

const createInvitationListItem = (
  inv: {
    id: string;
    targetType: BindingTargetTypeValue;
    workerProfileId: string | null;
    managerProfileId: string | null;
    status: string;
    expiresAt: Date;
    createdAt: Date;
    acceptedByUserId: string | null;
  },
  projectId: string
): BindingInvitationListItem => ({
  acceptedByUserId: inv.acceptedByUserId,
  createdAt: inv.createdAt.toISOString(),
  expiresAt: inv.expiresAt.toISOString(),
  id: inv.id,
  profileId: (inv.workerProfileId ?? inv.managerProfileId) ?? "",
  projectId,
  status: inv.status as "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED",
  targetType: inv.targetType
});

const createWorkerMemberResponse = (
  member: ProjectWorkerMember,
  worker: WorkerProfile
): ProjectWorkerMemberResponse => ({
  enteredAt: member.enteredAt.toISOString(),
  exitedAt: toIsoStringOrNull(member.exitedAt),
  id: member.id,
  participantType: "WORKER",
  phone: worker.phone,
  profileId: worker.id,
  projectId: member.projectId,
  projectRoleLabel: member.projectRoleLabel,
  requiresAttendance: member.requiresAttendance,
  status: member.status as MemberStatusValue,
  teamId: member.teamId
});

const createManagerMemberResponse = (
  member: ProjectManagerMember,
  manager: ManagerProfile
): ProjectManagerMemberResponse => ({
  id: member.id,
  participantType: "MANAGER",
  phone: manager.phone,
  profileId: manager.id,
  projectId: member.projectId,
  projectRoleLabel: member.roleCode as ProjectManagerRoleCode,
  requiresAttendance: member.requiresAttendance,
  status: member.status as MemberStatusValue,
  teamId: member.teamScopeId
});

const createWorkerParticipantResponse = (member: WorkerMemberWithProfileAndTeam, keyHex: string): ProjectParticipantResponse => ({
  displayName: member.worker.encryptedName.startsWith("name-v1:") ? decryptPersonnelName(member.worker.encryptedName, keyHex) : null,
  memberId: member.id,
  participantType: "WORKER",
  phone: member.worker.phone,
  profileId: member.worker.id,
  projectId: member.projectId,
  projectRoleLabel: member.projectRoleLabel,
  requiresAttendance: member.requiresAttendance,
  status: member.status as MemberStatusValue,
  teamId: member.teamId,
  teamName: member.team?.name ?? null
});

const createManagerParticipantResponse = (member: ManagerMemberWithProfileAndTeam): ProjectParticipantResponse => ({
  displayName: member.manager.name,
  memberId: member.id,
  participantType: "MANAGER",
  phone: member.manager.phone,
  profileId: member.manager.id,
  projectId: member.projectId,
  projectRoleLabel: member.roleCode,
  requiresAttendance: member.requiresAttendance,
  status: member.status as MemberStatusValue,
  teamId: member.teamScopeId,
  teamName: member.teamScope?.name ?? null
});

const throwConflictForUniqueError = (
  error: unknown,
  message: string,
  context: Record<string, unknown>
): never => {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new ConflictException({
      ...context,
      message,
      target: error.meta?.target
    });
  }

  throw error;
};

@Injectable()
export class ManagementService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(API_ENV) private readonly env: ApiEnv) {}

  async getManagedProject(projectId: string): Promise<ManagedProjectResponse> {
    const project = await this.getProjectOrThrow(projectId);
    return { ...createProjectResponse(project), code: project.code, contactName: project.contactName, contactPhone: project.contactPhone, remark: project.remark, updatedAt: project.updatedAt.toISOString() };
  }

  async updateProject(projectId: string, actorUserId: string, body: UpdateProjectRequest): Promise<ManagedProjectResponse> {
    try {
      await this.prisma.$transaction(async (transaction): Promise<void> => {
        const previous = await transaction.project.findUnique({ where: { id: projectId } });
        if (previous === null) throw new NotFoundException({ message: "PROJECT_NOT_FOUND", projectId });
        if (body.id !== projectId || body.companyId !== previous.companyId) {
          throw new BadRequestException({ message: "PROJECT_COMPANY_CANNOT_CHANGE" });
        }
        const result = await transaction.project.updateMany({
          where: { id: projectId, updatedAt: new Date(body.expectedUpdatedAt) },
          data: {
            name: body.name.trim(),
            address: body.address.trim(),
            code: body.code,
            contactName: body.contactName,
            contactPhone: body.contactPhone,
            remark: body.remark,
            status: body.status,
            centerLatitude: body.centerLatitude,
            centerLongitude: body.centerLongitude,
            geofenceRadiusM: body.geofenceRadiusM,
            plannedStartDate: dateOnlyToDate(body.plannedStartDate),
            plannedEndDate: body.plannedEndDate === null ? null : dateOnlyToDate(body.plannedEndDate),
            updatedAt: new Date(Math.max(Date.now(), previous.updatedAt.getTime() + 1))
          }
        });
        if (result.count !== 1) throw new ConflictException({ message: "PROJECT_CHANGED_RELOAD_BEFORE_SAVING" });
        await transaction.auditLog.create({
          data: {
            actorUserId,
            action: "project.update",
            entityType: "project",
            entityId: projectId,
            metadata: {
              previousStatus: previous.status,
              status: body.status,
              previousRadiusM: previous.geofenceRadiusM,
              radiusM: body.geofenceRadiusM
            }
          }
        });
      });
    } catch (error: unknown) {
      throwConflictForUniqueError(error, "PROJECT_CODE_ALREADY_EXISTS", { projectId });
    }
    return this.getManagedProject(projectId);
  }

  async createCompany(request: CreateCompanyRequest): Promise<CompanyResponse> {
    const company = await this.prisma.company.create({
      data: {
        name: request.name,
        status: request.status
      }
    });

    return createCompanyResponse(company);
  }

  async createProject(
    companyId: string,
    actorUserId: string,
    request: CreateProjectRequest
  ): Promise<ProjectResponse> {
    const company = await this.prisma.company.findUnique({
      where: {
        id: companyId
      }
    });

    if (company === null) {
      throw new NotFoundException({
        companyId,
        message: "COMPANY_NOT_FOUND"
      });
    }

    return this.prisma.$transaction(async (transaction): Promise<ProjectResponse> => {
      const project = await transaction.project.create({
        data: {
          address: request.address,
          centerLatitude: request.centerLatitude,
          centerLongitude: request.centerLongitude,
          companyId,
          geofenceRadiusM: request.geofenceRadiusM,
          name: request.name,
          plannedEndDate: request.plannedEndDate === null ? null : dateOnlyToDate(request.plannedEndDate),
          plannedStartDate: dateOnlyToDate(request.plannedStartDate),
          status: request.status
        }
      });
      const projectAdminRole = await transaction.role.findUnique({
        where: {
          code: "PROJECT_ADMIN"
        }
      });

      if (projectAdminRole === null) {
        throw new NotFoundException({
          message: "PROJECT_ADMIN_ROLE_NOT_FOUND"
        });
      }

      await transaction.userRole.create({
        data: {
          roleId: projectAdminRole.id,
          scopeId: project.id,
          scopeType: "PROJECT",
          userId: actorUserId
        }
      });

      return createProjectResponse(project);
    });
  }

  async createTeam(projectId: string, request: CreateTeamRequest): Promise<TeamResponse> {
    await this.getProjectOrThrow(projectId);
    try {
      const team = await this.prisma.team.create({
        data: {
          name: request.name,
          projectId,
          status: request.status
        }
      });
      return createTeamResponse(team);
    } catch (error: unknown) {
      return throwConflictForUniqueError(error, "PROJECT_TEAM_NAME_ALREADY_EXISTS", { projectId });
    }
  }

  async createProjectWorker(
    projectId: string,
    request: CreateProjectWorkerRequest
  ): Promise<ProjectWorkerMemberResponse> {
    await this.getProjectOrThrow(projectId);
    await this.getProjectTeamOrThrow(projectId, request.teamId);

    try {
      return await this.prisma.$transaction(async (transaction): Promise<ProjectWorkerMemberResponse> => {
        const worker = await transaction.workerProfile.create({
          data: {
            employmentStatus: request.employmentStatus,
            encryptedIdNumber: request.encryptedIdNumber,
            encryptedName: request.encryptedName,
            faceProfileStatus: request.faceProfileStatus,
            idNumberHash: request.idNumberHash,
            phone: request.phone,
            realNameStatus: request.realNameStatus,
            workType: request.workType
          }
        });
        const member = await transaction.projectWorkerMember.create({
          data: {
            enteredAt: new Date(request.enteredAt),
            exitedAt: request.exitedAt === null ? null : new Date(request.exitedAt),
            projectId,
            projectRoleLabel: request.projectRoleLabel,
            requiresAttendance: request.requiresAttendance,
            status: request.memberStatus,
            teamId: request.teamId,
            workerId: worker.id
          }
        });

        return createWorkerMemberResponse(member, worker);
      });
    } catch (error: unknown) {
      return throwConflictForUniqueError(error, "PROJECT_WORKER_MEMBER_CONFLICT", {
        idNumberHash: request.idNumberHash,
        projectId,
        teamId: request.teamId
      });
    }
  }

  async createProjectManager(
    projectId: string,
    request: CreateProjectManagerRequest
  ): Promise<ProjectManagerMemberResponse> {
    this.assertManagerRoleScope(request);
    await this.getProjectOrThrow(projectId);
    await this.getProjectTeamOrThrow(projectId, request.teamScopeId);

    try {
      return await this.prisma.$transaction(async (transaction): Promise<ProjectManagerMemberResponse> => {
        const manager = await transaction.managerProfile.create({
          data: {
            name: request.name,
            phone: request.phone,
            status: request.profileStatus
          }
        });
        const member = await transaction.projectManagerMember.create({
          data: {
            managerId: manager.id,
            projectId,
            requiresAttendance: request.requiresAttendance,
            roleCode: request.roleCode,
            status: request.memberStatus,
            teamScopeId: request.teamScopeId
          }
        });

        return createManagerMemberResponse(member, manager);
      });
    } catch (error: unknown) {
      return throwConflictForUniqueError(error, "PROJECT_MANAGER_MEMBER_CONFLICT", {
        phone: request.phone,
        projectId,
        roleCode: request.roleCode,
        teamScopeId: request.teamScopeId
      });
    }
  }

  async listCompanyProjects(companyId: string): Promise<readonly ProjectResponse[]> {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (company === null) {
      throw new NotFoundException({ companyId, message: "COMPANY_NOT_FOUND" });
    }
    const projects = await this.prisma.project.findMany({
      orderBy: { createdAt: "asc" },
      where: { companyId }
    });
    return projects.map(createProjectResponse);
  }

  async listCompanyParticipants(companyId: string): Promise<readonly CompanyParticipantResponse[]> {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (company === null) {
      throw new NotFoundException({ companyId, message: "COMPANY_NOT_FOUND" });
    }
    const projects = await this.prisma.project.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
      where: { companyId }
    });
    if (projects.length === 0) {
      return [];
    }
    const projectIds = projects.map((p) => p.id);
    const projectNamesById = new Map(projects.map((p) => [p.id, p.name]));
    const [workerMembers, managerMembers] = await Promise.all([
      this.prisma.projectWorkerMember.findMany({
        include: { team: true, worker: true },
        orderBy: { createdAt: "asc" },
        where: { projectId: { in: projectIds } }
      }),
      this.prisma.projectManagerMember.findMany({
        include: { manager: true, teamScope: true },
        orderBy: { createdAt: "asc" },
        where: { projectId: { in: projectIds } }
      })
    ]);
    const workerRows: CompanyParticipantResponse[] = workerMembers.map((m) => ({
      ...createWorkerParticipantResponse(m, this.env.PERSONNEL_ENCRYPTION_KEY),
      projectName: projectNamesById.get(m.projectId) ?? ""
    }));
    const managerRows: CompanyParticipantResponse[] = managerMembers.map((m) => ({
      ...createManagerParticipantResponse(m),
      projectName: projectNamesById.get(m.projectId) ?? ""
    }));
    return [...workerRows, ...managerRows];
  }

  async listTeamParticipants(teamId: string): Promise<readonly ProjectParticipantResponse[]> {
    const team = await this.prisma.team.findUnique({ where: { id: teamId } });

    if (team === null) {
      throw new NotFoundException({ message: "TEAM_NOT_FOUND", teamId });
    }

    const [workerMembers, managerMembers] = await Promise.all([
      this.prisma.projectWorkerMember.findMany({
        include: { team: true, worker: true },
        orderBy: { createdAt: "asc" },
        where: { projectId: team.projectId, teamId }
      }),
      this.prisma.projectManagerMember.findMany({
        include: { manager: true, teamScope: true },
        orderBy: { createdAt: "asc" },
        where: { projectId: team.projectId, teamScopeId: teamId }
      })
    ]);

    return [
      ...workerMembers.map((member) => createWorkerParticipantResponse(member, this.env.PERSONNEL_ENCRYPTION_KEY)),
      ...managerMembers.map(createManagerParticipantResponse)
    ];
  }

  async listProjectParticipants(projectId: string): Promise<readonly ProjectParticipantResponse[]> {
    await this.getProjectOrThrow(projectId);
    const [workerMembers, managerMembers] = await Promise.all([
      this.prisma.projectWorkerMember.findMany({
        include: {
          team: true,
          worker: true
        },
        orderBy: {
          createdAt: "asc"
        },
        where: {
          projectId
        }
      }),
      this.prisma.projectManagerMember.findMany({
        include: {
          manager: true,
          teamScope: true
        },
        orderBy: {
          createdAt: "asc"
        },
        where: {
          projectId
        }
      })
    ]);

    return [
      ...workerMembers.map((member) => createWorkerParticipantResponse(member, this.env.PERSONNEL_ENCRYPTION_KEY)),
      ...managerMembers.map(createManagerParticipantResponse)
    ];
  }

  async listProjectTeams(projectId: string): Promise<readonly TeamResponse[]> {
    await this.getProjectOrThrow(projectId);
    const teams = await this.prisma.team.findMany({
      orderBy: { createdAt: "asc" },
      where: { projectId }
    });
    return teams.map(createTeamResponse);
  }

  async listProjectInvitations(projectId: string): Promise<readonly BindingInvitationListItem[]> {
    await this.getProjectOrThrow(projectId);
    const memberships = await Promise.all([
      this.prisma.projectWorkerMember.findMany({ select: { workerId: true }, where: { projectId } }),
      this.prisma.projectManagerMember.findMany({ select: { managerId: true }, where: { projectId } })
    ]);
    const workerIds = memberships[0].map((m) => m.workerId);
    const managerIds = memberships[1].map((m) => m.managerId);
    const orList: Array<{ workerProfileId?: { in: string[] }; managerProfileId?: { in: string[] } }> = [];
    if (workerIds.length > 0) {
      orList.push({ workerProfileId: { in: workerIds } });
    }
    if (managerIds.length > 0) {
      orList.push({ managerProfileId: { in: managerIds } });
    }
    if (orList.length === 0) {
      return [];
    }
    const invitations = await this.prisma.bindingInvitation.findMany({
      orderBy: { createdAt: "desc" },
      where: { OR: orList }
    });
    return invitations.map((inv) => createInvitationListItem(inv, projectId));
  }

  async revokeProjectInvitation(projectId: string, invitationId: string): Promise<BindingInvitationListItem> {
    await this.getProjectOrThrow(projectId);
    const inv = await this.prisma.bindingInvitation.findUnique({ where: { id: invitationId } });
    if (inv === null) {
      throw new NotFoundException({ invitationId, message: "INVITATION_NOT_FOUND" });
    }
    if (inv.status !== "PENDING") {
      throw new ConflictException({ invitationId, message: "INVITATION_NOT_PENDING", status: inv.status });
    }
    const updated = await this.prisma.bindingInvitation.update({
      data: { status: "REVOKED" },
      where: { id: invitationId }
    });
    return createInvitationListItem(updated, projectId);
  }

  private async getProjectOrThrow(projectId: string): Promise<Project> {
    const project = await this.prisma.project.findUnique({
      where: {
        id: projectId
      }
    });

    if (project === null) {
      throw new NotFoundException({
        message: "PROJECT_NOT_FOUND",
        projectId
      });
    }

    return project;
  }

  private async getProjectTeamOrThrow(projectId: string, teamId: string | null): Promise<Team | null> {
    if (teamId === null) {
      return null;
    }

    const team = await this.prisma.team.findUnique({
      where: {
        id: teamId
      }
    });

    if (team === null) {
      throw new BadRequestException({
        message: "TEAM_NOT_FOUND",
        projectId,
        teamId
      });
    }

    if (team.projectId !== projectId) {
      throw new BadRequestException({
        message: "TEAM_DOES_NOT_BELONG_TO_PROJECT",
        projectId,
        teamId,
        teamProjectId: team.projectId
      });
    }

    return team;
  }

  private assertManagerRoleScope(request: CreateProjectManagerRequest): void {
    if (request.roleCode === "TEAM_LEADER" && request.teamScopeId === null) {
      throw new BadRequestException({
        message: "TEAM_LEADER_MANAGER_REQUIRES_TEAM_SCOPE",
        roleCode: request.roleCode
      });
    }

    if (request.roleCode === "PROJECT_ADMIN" && request.teamScopeId !== null) {
      throw new BadRequestException({
        message: "PROJECT_ADMIN_MANAGER_REJECTS_TEAM_SCOPE",
        roleCode: request.roleCode,
        teamScopeId: request.teamScopeId
      });
    }
  }
}
