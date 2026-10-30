import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { MyProjectDetail, ProjectContact } from "@construction/domain";

import { workerRole } from "../attendance/member-history.js";
import { API_ENV } from "../config/env.module.js";
import type { ApiEnv } from "../config/env.js";
import { PrismaService } from "../infrastructure/database/prisma.service.js";
import { decryptPersonnelName } from "../management/personnel-name.js";

const teamRelations = {
  leaderWorkerMember: {
    include: {
      worker: { select: { encryptedName: true, phone: true } },
      additionalRoles: true,
    },
  },
  leaderManagerMember: {
    include: {
      manager: { select: { name: true, phone: true } },
      additionalRoles: true,
    },
  },
} satisfies Prisma.TeamInclude;
type DetailTeam = Prisma.TeamGetPayload<{ include: typeof teamRelations }>;

const teamContact = (team: DetailTeam, key: string): ProjectContact | null => {
  if (team.status !== "ACTIVE") return null;
  const worker = team.leaderWorkerMember;
  const manager = team.leaderManagerMember;
  if (
    worker?.status === "ACTIVE" &&
    (worker.teamId === team.id ||
      worker.additionalRoles.some(
        (role) => role.roleCode === "TEAM_LEADER" && role.teamId === team.id,
      ))
  )
    return {
      name: decryptPersonnelName(worker.worker.encryptedName, key),
      phone: worker.worker.phone,
    };
  if (
    manager?.status === "ACTIVE" &&
    (manager.teamScopeId === team.id ||
      manager.additionalRoles.some(
        (role) => role.roleCode === "TEAM_LEADER" && role.teamId === team.id,
      ))
  )
    return { name: manager.manager.name, phone: manager.manager.phone };
  return null;
};

@Injectable()
export class MyProjectService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  async get(userId: string, projectId: string): Promise<MyProjectDetail> {
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        OR: [
          { workerMembers: { some: { status: "ACTIVE", worker: { userId } } } },
          {
            managerMembers: { some: { status: "ACTIVE", manager: { userId } } },
          },
        ],
      },
      include: {
        company: { select: { name: true } },
        workerMembers: {
          where: { status: "ACTIVE", worker: { userId } },
          include: {
            worker: { select: { workType: true } },
            team: { include: teamRelations },
            additionalRoles: { include: { team: { select: { name: true } } } },
          },
        },
        managerMembers: {
          where: { status: "ACTIVE", manager: { userId } },
          include: {
            manager: { select: { workType: true } },
            teamScope: { include: teamRelations },
            additionalRoles: { include: { team: { select: { name: true } } } },
          },
        },
      },
    });
    if (project === null)
      throw new ForbiddenException({
        message: "PROJECT_MEMBERSHIP_REQUIRED",
        projectId,
      });
    const worker = project.workerMembers[0];
    const manager = project.managerMembers[0];
    const member = worker ?? manager;
    if (member === undefined)
      throw new ForbiddenException({
        message: "PROJECT_MEMBERSHIP_REQUIRED",
        projectId,
      });
    const team: DetailTeam | null = worker ? worker.team : manager!.teamScope;
    const primaryRole = worker
      ? workerRole(worker.projectRoleLabel)
      : manager!.roleCode;
    const [managerContacts, workerContacts] = await Promise.all([
      this.prisma.projectManagerMember.findMany({
        where: {
          projectId,
          roleCode: "PROJECT_ADMIN",
          status: "ACTIVE",
          manager: { status: "ACTIVE" },
        },
        select: { manager: { select: { name: true, phone: true } } },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.projectWorkerMember.findMany({
        where: {
          projectId,
          projectRoleLabel: "PROJECT_ADMIN",
          status: "ACTIVE",
        },
        select: { worker: { select: { encryptedName: true, phone: true } } },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    return {
      projectId: project.id,
      projectName: project.name,
      companyName: project.company.name,
      status: project.status,
      address: project.address,
      centerLatitude: project.centerLatitude.toString(),
      centerLongitude: project.centerLongitude.toString(),
      geofenceRadiusM: project.geofenceRadiusM,
      locationAccuracyLimitM: project.locationAccuracyLimitM,
      contact:
        project.contactName || project.contactPhone
          ? { name: project.contactName, phone: project.contactPhone }
          : null,
      managers: [
        ...managerContacts.map(
          ({ manager: contact }): ProjectContact => ({
            name: contact.name,
            phone: contact.phone,
          }),
        ),
        ...workerContacts.map(
          ({ worker: contact }): ProjectContact => ({
            name: decryptPersonnelName(
              contact.encryptedName,
              this.env.PERSONNEL_ENCRYPTION_KEY,
            ),
            phone: contact.phone,
          }),
        ),
      ],
      team:
        team === null
          ? null
          : {
              name: team.name,
              leader: teamContact(team, this.env.PERSONNEL_ENCRYPTION_KEY),
            },
      workType: worker ? worker.worker.workType : manager!.manager.workType,
      roles: [
        {
          roleCode: primaryRole,
          teamName: primaryRole === "TEAM_LEADER" ? (team?.name ?? null) : null,
        },
        ...member.additionalRoles.map((role) => ({
          roleCode: role.roleCode,
          teamName: role.team?.name ?? null,
        })),
      ],
      enteredAt: member.enteredAt.toISOString(),
      requiresAttendance: member.requiresAttendance,
    };
  }
}
