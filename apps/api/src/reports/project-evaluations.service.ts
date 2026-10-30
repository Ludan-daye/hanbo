import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { authorizePermission, ROLE_LEVEL } from "@construction/domain/roles.js";
import { authorizedPlanLevel } from "../attendance/attendance-plans.js";
import { workerRole } from "../attendance/member-history.js";
import { AuthorizationContextService } from "../authorization/authorization-context.service.js";
import { API_ENV } from "../config/env.module.js";
import type { ApiEnv } from "../config/env.js";
import { PrismaService } from "../infrastructure/database/prisma.service.js";
import { decryptPersonnelName } from "../management/personnel-name.js";
import type { ProjectEvaluation } from "./reports.types.js";

export type EvaluationRecord = Prisma.ProjectMemberEvaluationGetPayload<{
  include: { reviewer: { select: { encryptedRealName: true } } };
}>;
export const evaluationView = (
  record: EvaluationRecord | null,
  key: string,
): ProjectEvaluation | null =>
  record === null
    ? null
    : {
        id: record.id,
        score: record.score,
        comment: record.comment,
        reviewerName:
          record.reviewer.encryptedRealName === null
            ? "未填写实名"
            : decryptPersonnelName(record.reviewer.encryptedRealName, key),
        reviewedAt: record.reviewedAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
      };
export type EvaluationBody = {
  readonly score: number;
  readonly comment: string;
  readonly expectedUpdatedAt: string | null;
};

@Injectable()
export class ProjectEvaluationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthorizationContextService)
    private readonly authorization: AuthorizationContextService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  async canEvaluate(
    userId: string,
    projectId: string,
    memberId: string,
  ): Promise<boolean> {
    const [worker, manager, target, actor] = await Promise.all([
      this.prisma.projectWorkerMember.findFirst({
        where: { id: memberId, projectId },
        include: { worker: true },
      }),
      this.prisma.projectManagerMember.findFirst({
        where: { id: memberId, projectId },
        include: { manager: true },
      }),
      this.authorization.resolveTargetScope(
        { source: "projectParam", paramName: "id" },
        { params: { id: projectId } },
      ),
      this.authorization.loadAuthorizationData(userId),
    ]);
    if (worker === null && manager === null)
      throw new NotFoundException({
        message: "未找到该项目人员。",
        projectId,
        memberId,
      });
    const targetUserId =
      worker?.worker.userId ?? manager?.manager.userId ?? null;
    const targetRole = worker
      ? workerRole(worker.projectRoleLabel)
      : manager!.roleCode;
    const targetTeamId = worker?.teamId ?? manager?.teamScopeId ?? null;
    const memberScope =
      target.scopeType === "PROJECT" && targetTeamId !== null
        ? {
            ...target,
            scopeType: "TEAM" as const,
            scopeId: targetTeamId,
            teamId: targetTeamId,
          }
        : target;
    const targetLevel = Math.max(
      ROLE_LEVEL[targetRole],
      targetUserId === null
        ? 0
        : authorizedPlanLevel(
            await this.authorization.loadAuthorizationData(targetUserId),
            memberScope,
          ),
    );
    const level = authorizedPlanLevel(actor, target);
    return (
      userId !== targetUserId &&
      level >= ROLE_LEVEL.PROJECT_ADMIN &&
      level > targetLevel &&
      authorizePermission({
        ...actor,
        targetScope: target,
        requiredPermissionCode: "project.manage",
      }).isAuthorized
    );
  }

  async save(
    userId: string,
    projectId: string,
    memberId: string,
    body: EvaluationBody,
  ): Promise<ProjectEvaluation> {
    if (!Number.isInteger(body.score) || body.score < 0 || body.score > 100)
      throw new BadRequestException({ message: "评分须为 0–100 的整数。" });
    if (!(await this.canEvaluate(userId, projectId, memberId)))
      throw new ForbiddenException({
        message:
          "仅项目管理员及以上可评价授权项目内的下级，不能评价本人或同级。",
      });
    return this.prisma.$transaction(async (database) => {
      await database.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`evaluation:${projectId}:${memberId}`}, 0))`;
      const worker = await database.projectWorkerMember.findFirst({
        where: { id: memberId, projectId },
      });
      const where = {
        projectId,
        ...(worker === null
          ? { managerMemberId: memberId }
          : { workerMemberId: memberId }),
      };
      const existing = await database.projectMemberEvaluation.findFirst({
        where,
      });
      if (
        (existing?.updatedAt.toISOString() ?? null) !== body.expectedUpdatedAt
      )
        throw new ConflictException({
          message: "评分已被更新，请刷新人员明细后重试。",
        });
      const values = {
        score: body.score,
        comment: body.comment.trim() || null,
        reviewerUserId: userId,
        reviewedAt: new Date(),
        updatedAt: new Date(
          Math.max(Date.now(), (existing?.updatedAt.getTime() ?? 0) + 1),
        ),
      };
      const record =
        existing === null
          ? await database.projectMemberEvaluation.create({
              data: { ...where, ...values },
              include: { reviewer: { select: { encryptedRealName: true } } },
            })
          : await database.projectMemberEvaluation.update({
              where: { id: existing.id },
              data: values,
              include: { reviewer: { select: { encryptedRealName: true } } },
            });
      return evaluationView(record, this.env.PERSONNEL_ENCRYPTION_KEY)!;
    });
  }
}
