import { workerRole } from "./member-history.js";
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import type { AttendancePlan, Prisma } from "@prisma/client";
import { defaultAttendancePoints } from "@construction/domain/attendance.js";
import { AccessTokenGuard } from "../auth/access-token.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { AuthorizationContextService } from "../authorization/authorization-context.service.js";
import { PrismaService } from "../infrastructure/database/prisma.service.js";
import { API_ENV } from "../config/env.module.js";
import type { ApiEnv } from "../config/env.js";
import { decryptPersonnelName } from "../management/personnel-name.js";
import {
  assertPlanAuthority,
  assertPlanVersion,
  authorizedPlanLevel,
  parsePlanBody,
  parseStoredPoints,
  roleLevelForMember,
  tomorrowChina,
  type PlanScopeType,
} from "./attendance-plans.js";

type PlanScope = {
  readonly projectId: string;
  readonly scopeType: PlanScopeType;
  readonly scopeId: string;
  readonly label: string;
};
type PlanResponse = {
  readonly id: string | null;
  readonly name: string;
  readonly inherit: boolean;
  readonly points: typeof defaultAttendancePoints;
  readonly startsOn: string;
  readonly endsOn: string | null;
  readonly workdays: readonly number[];
};
const response = (plan: AttendancePlan | null): PlanResponse => ({
  id: plan?.id ?? null,
  name: plan?.name ?? "每日两次",
  inherit: plan?.inherit ?? false,
  points:
    plan === null ? defaultAttendancePoints : parseStoredPoints(plan.points),
  startsOn: plan?.startsOn.toISOString().slice(0, 10) ?? tomorrowChina(),
  endsOn: plan?.endsOn?.toISOString().slice(0, 10) ?? null,
  workdays: [1, 2, 3, 4, 5, 6, 7].filter(
    (day) => ((plan?.workdayMask ?? 127) & (1 << (day - 1))) !== 0,
  ),
});

@Controller("attendance/planning")
@UseGuards(AccessTokenGuard)
export class AttendancePlansController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthorizationContextService)
    private readonly authorization: AuthorizationContextService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  @Get("scopes")
  async scopes(
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<readonly PlanScope[]> {
    const authorization = await this.authorization.loadAuthorizationData(
      actor.userId,
    );
    const assignments = authorization.assignments.filter(
      (assignment) => roleLevelForMember(assignment.roleCode) >= 2,
    );
    const projectFilters: Prisma.ProjectWhereInput[] = assignments.map(
      ({ scope }): Prisma.ProjectWhereInput => {
        if (scope.scopeType === "GLOBAL") return { id: { not: "" } };
        if (scope.scopeType === "COMPANY") return { companyId: scope.scopeId };
        if (scope.scopeType === "PROJECT") return { id: scope.scopeId };
        return { teams: { some: { id: scope.scopeId } } };
      },
    );
    if (projectFilters.length === 0) return [];
    const projects = await this.prisma.project.findMany({
      where: { status: "ACTIVE", OR: projectFilters },
      include: {
        teams: true,
        workerMembers: { include: { worker: true } },
        managerMembers: { include: { manager: true } },
      },
    });
    return projects.flatMap((project): PlanScope[] => {
      const projectTarget = {
        scopeType: "PROJECT" as const,
        scopeId: project.id,
        projectId: project.id,
        companyId: project.companyId,
      };
      const level = authorizedPlanLevel(authorization, projectTarget);
      const base = { projectId: project.id };
      const teams: PlanScope[] = project.teams
        .filter(
          (team) =>
            team.status === "ACTIVE" &&
            authorizedPlanLevel(authorization, {
              ...projectTarget,
              scopeType: "TEAM",
              scopeId: team.id,
              teamId: team.id,
            }) >= 2,
        )
        .map((team) => ({
          ...base,
          scopeType: "TEAM",
          scopeId: team.id,
          label: `${project.name} · ${team.name}`,
        }));
      const members: PlanScope[] = [
        ...project.workerMembers
          .filter((member) => member.status === "ACTIVE")
          .map((member) => ({
            id: member.id,
            teamId: member.teamId,
            userId: member.worker.userId,
            level: roleLevelForMember(workerRole(member.projectRoleLabel)),
            encryptedName: member.worker.encryptedName,
            label: null,
          })),
        ...project.managerMembers
          .filter((member) => member.status === "ACTIVE")
          .map((member) => ({
            id: member.id,
            teamId: member.teamScopeId,
            userId: member.manager.userId,
            level: roleLevelForMember(member.roleCode),
            encryptedName: null,
            label: member.manager.name,
          })),
      ]
        .filter(
          (member) =>
            member.userId !== actor.userId &&
            authorizedPlanLevel(
              authorization,
              member.teamId === null
                ? projectTarget
                : {
                    ...projectTarget,
                    scopeType: "TEAM",
                    scopeId: member.teamId,
                    teamId: member.teamId,
                  },
            ) > member.level,
        )
        .map((member) => ({
          ...base,
          scopeType: "MEMBER",
          scopeId: member.id,
          label: `${project.name} · ${member.encryptedName === null ? member.label : decryptPersonnelName(member.encryptedName, this.env.PERSONNEL_ENCRYPTION_KEY)}`,
        }));
      return [
        ...(level >= 3
          ? [
              {
                ...base,
                scopeType: "PROJECT" as const,
                scopeId: project.id,
                label: `${project.name} · 项目默认`,
              },
            ]
          : []),
        ...teams,
        ...members,
      ];
    });
  }

  private async target(
    actor: AuthenticatedUser,
    projectId: string,
    scopeType: string,
    scopeId: string,
  ): Promise<{ readonly scopeType: PlanScopeType; readonly level: number }> {
    if (
      scopeType !== "PROJECT" &&
      scopeType !== "TEAM" &&
      scopeType !== "MEMBER"
    )
      throw new BadRequestException({ message: "INVALID_SCHEDULE_SCOPE" });
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (project === null || project.status !== "ACTIVE")
      throw new NotFoundException({ message: "PROJECT_NOT_FOUND" });
    let teamId: string | null = null;
    let targetLevel: number = 0;
    let targetUserId: string | null = null;
    if (scopeType === "PROJECT" && scopeId !== projectId)
      throw new BadRequestException({ message: "INVALID_SCHEDULE_PROJECT" });
    if (scopeType === "TEAM") {
      const team = await this.prisma.team.findFirst({
        where: { id: scopeId, projectId, status: "ACTIVE" },
      });
      if (team === null)
        throw new NotFoundException({ message: "TEAM_NOT_FOUND" });
      teamId = team.id;
    }
    if (scopeType === "MEMBER") {
      const [worker, manager] = await Promise.all([
        this.prisma.projectWorkerMember.findFirst({
          where: { id: scopeId, projectId, status: "ACTIVE" },
          include: { worker: true },
        }),
        this.prisma.projectManagerMember.findFirst({
          where: { id: scopeId, projectId, status: "ACTIVE" },
          include: { manager: true },
        }),
      ]);
      if (worker === null && manager === null)
        throw new NotFoundException({ message: "MEMBER_NOT_FOUND" });
      teamId = worker?.teamId ?? manager?.teamScopeId ?? null;
      targetLevel =
        manager === null
          ? roleLevelForMember(workerRole(worker!.projectRoleLabel))
          : roleLevelForMember(manager.roleCode);
      targetUserId = worker?.worker.userId ?? manager?.manager.userId ?? null;
    }
    const target =
      teamId === null
        ? {
            scopeType: "PROJECT" as const,
            scopeId: projectId,
            projectId,
            companyId: project.companyId,
          }
        : {
            scopeType: "TEAM" as const,
            scopeId: teamId,
            teamId,
            projectId,
            companyId: project.companyId,
          };
    const level = authorizedPlanLevel(
      await this.authorization.loadAuthorizationData(actor.userId),
      target,
    );
    assertPlanAuthority(
      level,
      scopeType,
      targetLevel,
      actor.userId,
      targetUserId,
    );
    return { scopeType, level };
  }

  @Get(":projectId/:scopeType/:scopeId")
  async get(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("projectId") projectId: string,
    @Param("scopeType") scopeType: string,
    @Param("scopeId") scopeId: string,
  ): Promise<PlanResponse> {
    await this.target(actor, projectId, scopeType, scopeId);
    return response(
      await this.prisma.attendancePlan.findFirst({
        where: { projectId, scopeType, scopeId },
        orderBy: [{ startsOn: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      }),
    );
  }

  @Post(":projectId/:scopeType/:scopeId")
  async save(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("projectId") projectId: string,
    @Param("scopeType") scopeType: string,
    @Param("scopeId") scopeId: string,
    @Body() body: unknown,
  ): Promise<PlanResponse> {
    const target = await this.target(actor, projectId, scopeType, scopeId);
    const input = parsePlanBody(body);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`plan:${projectId}:${scopeType}:${scopeId}`}, 0))`;
      const latest = await tx.attendancePlan.findFirst({
        where: { projectId, scopeType, scopeId },
        orderBy: [{ startsOn: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      });
      assertPlanVersion(latest, input.expectedId);
      if (
        latest !== null &&
        input.startsOn < latest.startsOn.toISOString().slice(0, 10)
      )
        throw new BadRequestException({
          message: "生效日期不能早于已保存的最新排班。",
        });
      const saved = await tx.attendancePlan.create({
        data: {
          createdAt: new Date(
            Math.max(Date.now(), (latest?.createdAt.getTime() ?? 0) + 1),
          ),
          projectId,
          scopeType: target.scopeType,
          scopeId,
          authorUserId: actor.userId,
          authorRoleLevel: target.level,
          name: input.name,
          startsOn: new Date(input.startsOn),
          endsOn: input.endsOn === null ? null : new Date(input.endsOn),
          points: input.points,
          workdayMask: input.workdays.reduce(
            (mask, day) => mask | (1 << (day - 1)),
            0,
          ),
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "attendance.plan.save",
          entityType: "attendance_plan",
          entityId: saved.id,
          metadata: {
            projectId,
            scopeType,
            scopeId,
            startsOn: input.startsOn,
            pointCount: input.points.length,
          },
        },
      });
      return response(saved);
    });
  }

  @Post(":projectId/:scopeType/:scopeId/inherit")
  async inherit(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("projectId") projectId: string,
    @Param("scopeType") scopeType: string,
    @Param("scopeId") scopeId: string,
    @Body() body: unknown,
  ): Promise<PlanResponse> {
    const target = await this.target(actor, projectId, scopeType, scopeId);
    if (scopeType === "PROJECT")
      throw new BadRequestException({ message: "项目默认排班不能移除。" });
    const input = parsePlanBody(body);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`plan:${projectId}:${scopeType}:${scopeId}`}, 0))`;
      const latest = await tx.attendancePlan.findFirst({
        where: { projectId, scopeType, scopeId },
        orderBy: [{ startsOn: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      });
      assertPlanVersion(latest, input.expectedId);
      if (
        latest !== null &&
        input.startsOn < latest.startsOn.toISOString().slice(0, 10)
      )
        throw new BadRequestException({
          message: "生效日期不能早于最新排班。",
        });
      const saved = await tx.attendancePlan.create({
        data: {
          createdAt: new Date(
            Math.max(Date.now(), (latest?.createdAt.getTime() ?? 0) + 1),
          ),
          projectId,
          scopeType,
          scopeId,
          authorUserId: actor.userId,
          authorRoleLevel: target.level,
          inherit: true,
          name: "继承上级排班",
          startsOn: new Date(input.startsOn),
          points: [...defaultAttendancePoints] as Prisma.InputJsonValue,
          workdayMask: 127,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "attendance.plan.inherit",
          entityType: "attendance_plan",
          entityId: saved.id,
          metadata: { projectId, scopeType, scopeId, startsOn: input.startsOn },
        },
      });
      return response(saved);
    });
  }
}
