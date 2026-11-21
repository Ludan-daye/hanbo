import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { AuthorizationContextService } from "../authorization/authorization-context.service.js";
import { API_ENV } from "../config/env.module.js";
import type { ApiEnv } from "../config/env.js";
import { PrismaService } from "../infrastructure/database/prisma.service.js";

import type { Prisma } from "@prisma/client";

import type {
  CompanyPeoplePageQuery,
  CompanyPeoplePageResponse,
  CompanyPersonResponse,
  OffboardRequest,
  ProjectAdminsResponse,
} from "./company-people.types.js";
import type {
  MemberStatusValue,
  ParticipantTypeValue,
  ProjectStatusValue,
} from "./management.types.js";
import { ParticipantsService } from "./participants.service.js";
import type { ParticipantWriteRequest } from "./participants.types.js";
import { decryptPersonnelName, personnelSearchHash } from "./personnel-name.js";
import { recordTeamLeaderChange } from "./team-leader-history.js";

const ADMIN = "PROJECT_ADMIN";
const registrationOf = (value: string): "NEEDS_UPDATE" | "PENDING" | "VERIFIED" =>
  value === "VERIFIED" || value === "NEEDS_UPDATE" ? value : "PENDING";
const LEADER = "TEAM_LEADER";

/**
 * Company-level views of people (2026-11-21 phases 2-3): who administers each project,
 * one person's posts across the company's projects, and offboarding someone from all
 * of them in one transaction (Q3: revoke management posts by default, or exit all).
 */
@Injectable()
export class CompanyPeopleService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(ParticipantsService)
    private readonly participants: ParticipantsService,
    @Inject(AuthorizationContextService)
    private readonly authorization: AuthorizationContextService,
  ) {}

  private name(encrypted: string): string | null {
    return encrypted.startsWith("name-v1:")
      ? decryptPersonnelName(encrypted, this.env.PERSONNEL_ENCRYPTION_KEY)
      : null;
  }

  async projectAdmins(companyId: string): Promise<ProjectAdminsResponse> {
    await this.requireCompany(companyId);
    const [projects, workers, managers] = await Promise.all([
      this.prisma.project.findMany({
        where: { companyId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, name: true, status: true },
      }),
      this.prisma.projectWorkerMember.findMany({
        where: { project: { companyId }, projectRoleLabel: ADMIN, status: "ACTIVE" },
        include: { worker: { include: { user: { select: { isBound: true } } } } },
        orderBy: [{ enteredAt: "asc" }, { id: "asc" }],
      }),
      this.prisma.projectManagerMember.findMany({
        where: { project: { companyId }, roleCode: ADMIN, status: "ACTIVE" },
        include: { manager: { include: { user: { select: { isBound: true } } } } },
        orderBy: [{ enteredAt: "asc" }, { id: "asc" }],
      }),
    ]);
    return {
      projects: projects.map((project) => ({
        admins: [
          ...managers
            .filter((row) => row.projectId === project.id)
            .map((row) => ({
              displayName: row.manager.name,
              isBound: row.manager.user?.isBound === true,
              memberId: row.id,
              participantType: "MANAGER" as const,
              phone: row.manager.phone,
              profileId: row.managerId,
            })),
          ...workers
            .filter((row) => row.projectId === project.id)
            .map((row) => ({
              displayName: this.name(row.worker.encryptedName),
              isBound: row.worker.user?.isBound === true,
              memberId: row.id,
              participantType: "WORKER" as const,
              phone: row.worker.phone,
              profileId: row.workerId,
            })),
        ],
        name: project.name,
        projectId: project.id,
        status: project.status as ProjectStatusValue,
      })),
    };
  }

  /** This person's memberships in this company only; 404 when they have none here. */
  async person(
    companyId: string,
    participantType: ParticipantTypeValue,
    profileId: string,
  ): Promise<CompanyPersonResponse> {
    const memberInclude = {
      project: { select: { id: true, name: true, status: true } },
      additionalRoles: { include: { team: { select: { name: true } } } },
      evaluation: { select: { score: true } },
      history: {
        orderBy: [{ recordedAt: "desc" as const }, { version: "desc" as const }],
        include: { team: { select: { name: true } } },
        take: 20,
      },
    };
    if (participantType === "WORKER") {
      const profile = await this.prisma.workerProfile.findUnique({
        where: { id: profileId },
        include: {
          user: { select: { isBound: true } },
          projectMemberships: {
            where: { project: { companyId } },
            include: { ...memberInclude, team: { select: { name: true } } },
            orderBy: [{ enteredAt: "desc" }, { id: "asc" }],
          },
        },
      });
      if (profile === null || profile.projectMemberships.length === 0)
        throw new NotFoundException({ message: "COMPANY_PERSON_NOT_FOUND", profileId });
      return {
        displayName: this.name(profile.encryptedName),
        isBound: profile.user?.isBound === true,
        memberships: profile.projectMemberships.map((member) => ({
          enteredAt: member.enteredAt.toISOString(),
          evaluationScore: member.evaluation?.score ?? null,
          exitedAt: member.exitedAt?.toISOString() ?? null,
          history: member.history.map((row) => ({
            projectRoleLabel: row.projectRoleLabel ?? row.roleCode ?? "",
            recordedAt: row.recordedAt.toISOString(),
            status: row.status as MemberStatusValue,
            teamName: row.team?.name ?? null,
          })),
          memberId: member.id,
          projectId: member.projectId,
          projectName: member.project.name,
          projectRoleLabel: member.projectRoleLabel,
          projectStatus: member.project.status as ProjectStatusValue,
          roles: [
            {
              roleCode:
                member.projectRoleLabel === ADMIN
                  ? ("PROJECT_ADMIN" as const)
                  : member.projectRoleLabel === LEADER
                    ? ("TEAM_LEADER" as const)
                    : ("WORKER" as const),
              teamId: member.projectRoleLabel === LEADER ? member.teamId : null,
              teamName: member.projectRoleLabel === LEADER ? (member.team?.name ?? null) : null,
            },
            ...member.additionalRoles.map((role) => ({
              roleCode: role.roleCode as "TEAM_LEADER" | "WORKER",
              teamId: role.teamId,
              teamName: role.team?.name ?? null,
            })),
          ],
          status: member.status as MemberStatusValue,
          teamId: member.teamId,
          teamName: member.team?.name ?? null,
          updatedAt: member.updatedAt.toISOString(),
        })),
        participantType,
        phone: profile.phone,
        profileId,
      };
    }
    const profile = await this.prisma.managerProfile.findUnique({
      where: { id: profileId },
      include: {
        user: { select: { isBound: true } },
        projectMemberships: {
          where: { project: { companyId } },
          include: { ...memberInclude, teamScope: { select: { name: true } } },
          orderBy: [{ enteredAt: "desc" }, { id: "asc" }],
        },
      },
    });
    if (profile === null || profile.projectMemberships.length === 0)
      throw new NotFoundException({ message: "COMPANY_PERSON_NOT_FOUND", profileId });
    return {
      displayName: profile.name,
      isBound: profile.user?.isBound === true,
      memberships: profile.projectMemberships.map((member) => ({
        enteredAt: member.enteredAt.toISOString(),
        evaluationScore: member.evaluation?.score ?? null,
        exitedAt: member.exitedAt?.toISOString() ?? null,
        history: member.history.map((row) => ({
          projectRoleLabel: row.roleCode ?? row.projectRoleLabel ?? "",
          recordedAt: row.recordedAt.toISOString(),
          status: row.status as MemberStatusValue,
          teamName: row.team?.name ?? null,
        })),
        memberId: member.id,
        projectId: member.projectId,
        projectName: member.project.name,
        projectRoleLabel: member.roleCode,
        projectStatus: member.project.status as ProjectStatusValue,
        roles: [
          {
            roleCode: member.roleCode as "PROJECT_ADMIN" | "TEAM_LEADER" | "WORKER",
            teamId: member.roleCode === LEADER ? member.teamScopeId : null,
            teamName: member.roleCode === LEADER ? (member.teamScope?.name ?? null) : null,
          },
          ...member.additionalRoles.map((role) => ({
            roleCode: role.roleCode as "TEAM_LEADER" | "WORKER",
            teamId: role.teamId,
            teamName: role.team?.name ?? null,
          })),
        ],
        status: member.status as MemberStatusValue,
        teamId: member.teamScopeId,
        teamName: member.teamScope?.name ?? null,
        updatedAt: member.updatedAt.toISOString(),
      })),
      participantType,
      phone: profile.phone,
      profileId,
    };
  }

  /**
   * Q3 (2026-11-21): REVOKE_ADMIN turns every project-admin and team-leader post in this
   * company into a plain member post; EXIT_ALL exits every active membership. One
   * transaction, projects in id order, each change through the participants update
   * (grants revoked, led teams cleared with a leader-change row, one audit row per
   * project), plus one PERSONNEL_OFFBOARDED row. Attendance and makeup rows are untouched.
   */
  async offboard(
    companyId: string,
    participantType: ParticipantTypeValue,
    profileId: string,
    actorUserId: string,
    request: OffboardRequest,
  ): Promise<CompanyPersonResponse> {
    const person = await this.person(companyId, participantType, profileId);
    const profileUser =
      participantType === "WORKER"
        ? (await this.prisma.workerProfile.findUniqueOrThrow({ where: { id: profileId }, select: { userId: true } })).userId
        : (await this.prisma.managerProfile.findUniqueOrThrow({ where: { id: profileId }, select: { userId: true } })).userId;
    if (profileUser === actorUserId)
      throw new ConflictException({ message: "CANNOT_CHANGE_OWN_MANAGEMENT_ASSIGNMENT" });
    if (
      profileUser !== null &&
      (await this.prisma.userRole.count({
        where: {
          userId: profileUser,
          OR: [
            { scopeType: "COMPANY", scopeId: companyId, role: { code: "COMPANY_ADMIN" } },
            { scopeType: "GLOBAL", role: { code: "SYSTEM_ADMIN" } },
          ],
        },
      })) > 0
    )
      throw new ForbiddenException({ message: "MANAGEMENT_ASSIGNMENT_REQUIRES_HIGHER_ROLE" });
    const effectiveAt = `${request.effectiveDate}T00:00:00+08:00`;
    const changes: { readonly projectId: string; readonly memberId: string; readonly body: ParticipantWriteRequest }[] = [];
    for (const membership of [...person.memberships].sort((a, b) => a.projectId.localeCompare(b.projectId))) {
      if (membership.status === "EXITED") continue;
      const previous = await this.participants.get(membership.projectId, membership.memberId);
      // Identity fields are passed through unchanged (null stays null), so the update
      // never touches the shared profile; only the membership changes.
      const base: ParticipantWriteRequest = {
        additionalRoles: previous.additionalRoles.map(({ roleCode, teamId }) => ({ roleCode, teamId })),
        displayName: previous.displayName as string,
        enteredAt: previous.enteredAt,
        exitedAt: previous.exitedAt,
        expectedProfileUpdatedAt: previous.profileUpdatedAt,
        expectedUpdatedAt: previous.updatedAt,
        participantType: previous.participantType,
        phone: previous.phone,
        projectRoleLabel: previous.projectRoleLabel,
        requiresAttendance: previous.requiresAttendance,
        status: previous.status,
        teamId: previous.teamId,
        workType: previous.workType as string,
      };
      if (request.mode === "EXIT_ALL") {
        const exitedAt =
          new Date(effectiveAt) < new Date(previous.enteredAt) ? previous.enteredAt : effectiveAt;
        changes.push({ projectId: membership.projectId, memberId: membership.memberId, body: { ...base, exitedAt, status: "EXITED" } });
        continue;
      }
      const leads = previous.additionalRoles.some((role) => role.roleCode === "TEAM_LEADER");
      const manages = previous.projectRoleLabel === ADMIN || previous.projectRoleLabel === LEADER;
      const headsTeam =
        (await this.prisma.team.count({
          where: {
            projectId: membership.projectId,
            ...(participantType === "WORKER"
              ? { leaderWorkerMemberId: membership.memberId }
              : { leaderManagerMemberId: membership.memberId }),
          },
        })) > 0;
      if (!leads && !manages && !headsTeam) continue;
      changes.push({
        projectId: membership.projectId,
        memberId: membership.memberId,
        body: {
          ...base,
          additionalRoles: (base.additionalRoles ?? []).filter((role) => role.roleCode !== "TEAM_LEADER"),
          projectRoleLabel: manages
            ? participantType === "WORKER" && previous.workType
              ? previous.workType
              : "WORKER"
            : previous.projectRoleLabel,
          teamId: previous.projectRoleLabel === ADMIN ? null : previous.teamId,
        },
      });
    }
    if (changes.length === 0)
      throw new ConflictException({ message: "OFFBOARD_NOTHING_TO_CHANGE", mode: request.mode });
    const authorization = await this.authorization.loadAuthorizationData(actorUserId);
    await this.prisma.$transaction(async (transaction): Promise<void> => {
      for (const change of changes) {
        const previous = await this.participants.get(change.projectId, change.memberId);
        await this.participants.updateInTransaction(
          transaction,
          change.projectId,
          change.memberId,
          actorUserId,
          previous,
          change.body,
          authorization,
          "MEMBER_OFFBOARDED",
        );
        // Without management posts they no longer head a team either (Q3), even one they stay in.
        if (request.mode === "REVOKE_ADMIN") {
          const leader =
            participantType === "WORKER"
              ? { leaderWorkerMemberId: change.memberId }
              : { leaderManagerMemberId: change.memberId };
          const led = await transaction.team.findMany({
            where: { projectId: change.projectId, ...leader },
            select: { id: true, leaderManagerMemberId: true, leaderWorkerMemberId: true },
          });
          for (const team of led) {
            await transaction.$executeRaw`UPDATE "teams" SET "leaderWorkerMemberId" = NULL, "leaderManagerMemberId" = NULL, "updatedAt" = GREATEST(CURRENT_TIMESTAMP, "updatedAt" + interval '1 millisecond') WHERE "id" = ${team.id}`;
            await recordTeamLeaderChange(transaction, {
              changedByUserId: actorUserId,
              next: { leaderManagerMemberId: null, leaderWorkerMemberId: null },
              previous: team,
              projectId: change.projectId,
              reason: "MEMBER_OFFBOARDED",
              teamId: team.id,
            });
            await transaction.auditLog.create({
              data: {
                action: "team.leader.cleared",
                actorUserId,
                entityId: team.id,
                entityType: "team",
                metadata: { memberId: change.memberId, projectId: change.projectId, reason: "MEMBER_OFFBOARDED" },
                projectId: change.projectId,
              },
            });
          }
        }
      }
      await transaction.auditLog.create({
        data: {
          action: "PERSONNEL_OFFBOARDED",
          actorUserId,
          companyId,
          entityId: profileId,
          entityType: participantType === "WORKER" ? "worker_profile" : "manager_profile",
          metadata: {
            companyId,
            effectiveDate: request.effectiveDate,
            memberIds: changes.map((change) => change.memberId),
            mode: request.mode,
            participantType,
            projectIds: changes.map((change) => change.projectId),
          },
        },
      });
    });
    return this.person(companyId, participantType, profileId);
  }

  /**
   * Q8 (2026-11-21): one row per person (participantType + profileId), paginated. Step one
   * reads the matching memberships' profile ids (filters in SQL), step two narrows by
   * registration and photo state, sorts by phone and builds only the requested page.
   */
  async page(
    companyId: string,
    query: CompanyPeoplePageQuery,
  ): Promise<CompanyPeoplePageResponse> {
    await this.requireCompany(companyId);
    const projectFilter = query.projectId === null ? { project: { companyId } } : { project: { companyId }, projectId: query.projectId };
    const search = query.search;
    const hash = search.length === 0 ? null : personnelSearchHash(search, this.env.PERSONNEL_ENCRYPTION_KEY);
    const workerRole: Prisma.ProjectWorkerMemberWhereInput =
      query.permissionRole === null
        ? {}
        : query.permissionRole === "WORKER"
          ? { projectRoleLabel: { notIn: [ADMIN, LEADER] } }
          : query.permissionRole === LEADER
            ? { OR: [{ projectRoleLabel: LEADER }, { additionalRoles: { some: { roleCode: "TEAM_LEADER" } } }] }
            : { projectRoleLabel: ADMIN };
    const managerRole: Prisma.ProjectManagerMemberWhereInput =
      query.permissionRole === null
        ? {}
        : query.permissionRole === LEADER
          ? { OR: [{ roleCode: LEADER }, { additionalRoles: { some: { roleCode: "TEAM_LEADER" } } }] }
          : { roleCode: query.permissionRole };
    const wantWorkers = query.participantType !== "MANAGER";
    const wantManagers = query.participantType !== "WORKER" && query.registrationStatus === null;
    const [workerRows, managerRows] = await Promise.all([
      wantWorkers
        ? this.prisma.projectWorkerMember.findMany({
            where: {
              ...projectFilter,
              ...workerRole,
              ...(query.status === null ? {} : { status: query.status }),
              ...(hash === null ? {} : { worker: { OR: [{ phone: { contains: search } }, { nameSearchHashes: { has: hash } }] } }),
            },
            select: { workerId: true, worker: { select: { phone: true, realNameStatus: true } } },
          })
        : Promise.resolve([]),
      wantManagers
        ? this.prisma.projectManagerMember.findMany({
            where: {
              ...projectFilter,
              ...managerRole,
              ...(query.status === null ? {} : { status: query.status }),
              ...(search.length === 0 ? {} : { manager: { OR: [{ phone: { contains: search } }, { name: { contains: search, mode: "insensitive" } }] } }),
            },
            select: { managerId: true, manager: { select: { phone: true } } },
          })
        : Promise.resolve([]),
    ]);
    type Key = { readonly participantType: ParticipantTypeValue; readonly profileId: string; readonly phone: string; readonly registration: string | null };
    const keys = new Map<string, Key>();
    for (const row of workerRows)
      keys.set(`WORKER:${row.workerId}`, { participantType: "WORKER", profileId: row.workerId, phone: row.worker.phone, registration: registrationOf(row.worker.realNameStatus) });
    for (const row of managerRows)
      keys.set(`MANAGER:${row.managerId}`, { participantType: "MANAGER", profileId: row.managerId, phone: row.manager.phone, registration: null });
    let candidates = [...keys.values()];
    if (query.registrationStatus !== null)
      candidates = candidates.filter((key) => key.registration === query.registrationStatus);
    const faces = await this.latestFaces(candidates);
    if (query.faceStatus !== null)
      candidates = candidates.filter((key) => (faces.get(`${key.participantType}:${key.profileId}`) ?? "NONE") === query.faceStatus);
    candidates.sort((a, b) => a.phone.localeCompare(b.phone) || a.participantType.localeCompare(b.participantType) || a.profileId.localeCompare(b.profileId));
    const pageKeys = candidates.slice((query.page - 1) * query.pageSize, query.page * query.pageSize);
    const ids = (type: ParticipantTypeValue): string[] => pageKeys.filter((key) => key.participantType === type).map((key) => key.profileId);
    const [workers, managers] = await Promise.all([
      this.prisma.workerProfile.findMany({
        where: { id: { in: ids("WORKER") } },
        select: {
          encryptedName: true, id: true, phone: true,
          projectMemberships: { where: { project: { companyId } }, select: { id: true, projectId: true, projectRoleLabel: true, status: true, project: { select: { name: true } }, team: { select: { name: true } } }, orderBy: [{ enteredAt: "desc" }, { id: "asc" }] },
        },
      }),
      this.prisma.managerProfile.findMany({
        where: { id: { in: ids("MANAGER") } },
        select: {
          id: true, name: true, phone: true,
          projectMemberships: { where: { project: { companyId } }, select: { id: true, projectId: true, roleCode: true, status: true, project: { select: { name: true } }, teamScope: { select: { name: true } } }, orderBy: [{ enteredAt: "desc" }, { id: "asc" }] },
        },
      }),
    ]);
    return {
      items: pageKeys.map((key) => {
        const faceStatus = (faces.get(`${key.participantType}:${key.profileId}`) ?? "NONE") as CompanyPeoplePageResponse["items"][number]["faceStatus"];
        if (key.participantType === "WORKER") {
          const profile = workers.find((row) => row.id === key.profileId)!;
          return {
            displayName: this.name(profile.encryptedName),
            faceStatus,
            participantType: "WORKER" as const,
            phone: profile.phone,
            profileId: profile.id,
            projectCount: profile.projectMemberships.filter((row) => row.status !== "EXITED").length,
            projects: profile.projectMemberships.map((row) => ({
              memberId: row.id, projectId: row.projectId, projectName: row.project.name,
              roleLabel: row.projectRoleLabel, status: row.status as MemberStatusValue, teamName: row.team?.name ?? null,
            })),
            registrationStatus: key.registration as CompanyPeoplePageResponse["items"][number]["registrationStatus"],
          };
        }
        const profile = managers.find((row) => row.id === key.profileId)!;
        return {
          displayName: profile.name,
          faceStatus,
          participantType: "MANAGER" as const,
          phone: profile.phone,
          profileId: profile.id,
          projectCount: profile.projectMemberships.filter((row) => row.status !== "EXITED").length,
          projects: profile.projectMemberships.map((row) => ({
            memberId: row.id, projectId: row.projectId, projectName: row.project.name,
            roleLabel: row.roleCode, status: row.status as MemberStatusValue, teamName: row.teamScope?.name ?? null,
          })),
          registrationStatus: null,
        };
      }),
      page: query.page,
      pageSize: query.pageSize,
      total: candidates.length,
    };
  }

  /** Latest baseline photo status per person (highest version wins). */
  private async latestFaces(
    keys: readonly { readonly participantType: ParticipantTypeValue; readonly profileId: string }[],
  ): Promise<ReadonlyMap<string, string>> {
    const result = new Map<string, string>();
    if (keys.length === 0) return result;
    const rows = await this.prisma.faceProfile.findMany({
      where: {
        OR: [
          { ownerType: "WORKER", ownerId: { in: keys.filter((key) => key.participantType === "WORKER").map((key) => key.profileId) } },
          { ownerType: "MANAGER", ownerId: { in: keys.filter((key) => key.participantType === "MANAGER").map((key) => key.profileId) } },
        ],
      },
      orderBy: [{ version: "desc" }, { createdAt: "desc" }],
      select: { ownerId: true, ownerType: true, status: true },
    });
    for (const row of rows) {
      const key = `${row.ownerType}:${row.ownerId}`;
      if (!result.has(key))
        result.set(key, ["APPROVED", "PENDING", "REJECTED"].includes(row.status) ? row.status : "PENDING");
    }
    return result;
  }

  private async requireCompany(companyId: string): Promise<void> {
    if ((await this.prisma.company.count({ where: { id: companyId } })) === 0)
      throw new NotFoundException({ message: "COMPANY_NOT_FOUND", companyId });
  }
}
