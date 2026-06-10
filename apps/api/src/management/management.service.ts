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

import { PrismaService } from "../infrastructure/database/prisma.service.js";

import type {
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

const createWorkerParticipantResponse = (member: WorkerMemberWithProfileAndTeam): ProjectParticipantResponse => ({
  displayName: null,
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
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

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
    const team = await this.prisma.team.create({
      data: {
        name: request.name,
        projectId,
        status: request.status
      }
    });

    return createTeamResponse(team);
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
      ...workerMembers.map(createWorkerParticipantResponse),
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
      ...workerMembers.map(createWorkerParticipantResponse),
      ...managerMembers.map(createManagerParticipantResponse)
    ];
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
