import { workerClockLock } from "../attendance/task-attendance.js";
import { createHmac, randomBytes, randomInt } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, type TemporaryTaskInvitation } from "@prisma/client";
import type {
  NewTaskInvitation,
  TaskInvitation,
  TaskInvitationInput,
  TaskJoinResult,
} from "@construction/domain";

import {
  assertAccountProfileComplete,
  assertIdentityMatches,
} from "../auth/account-onboarding.js";
import { API_ENV } from "../config/env.module.js";
import type { ApiEnv } from "../config/env.js";
import { PrismaService } from "../infrastructure/database/prisma.service.js";
import {
  decryptPersonnelName,
  encryptPersonnelName,
  personnelNameSearchHashes,
} from "../management/personnel-name.js";
import { synchronizeMembershipGrants } from "../management/membership-roles.js";
import { requireActiveTeam } from "./team-work.service.js";

@Injectable()
export class TemporaryInvitationsService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  private codeHash(code: string): string {
    return createHmac("sha256", this.env.JWT_ACCESS_TOKEN_SECRET)
      .update(`temporary-task-invite\0${code}`)
      .digest("hex");
  }
  private view(row: TemporaryTaskInvitation): TaskInvitation {
    return {
      id: row.id,
      taskId: row.taskId,
      name: decryptPersonnelName(
        row.encryptedName,
        this.env.PERSONNEL_ENCRYPTION_KEY,
      ),
      phoneMasked: `${row.phone.slice(0, 3)}****${row.phone.slice(-4)}`,
      expiresAt: row.expiresAt.toISOString(),
      status:
        row.status === "PENDING" && row.expiresAt.getTime() <= Date.now()
          ? "EXPIRED"
          : row.status,
    };
  }

  async list(
    teamId: string,
    taskId: string,
  ): Promise<readonly TaskInvitation[]> {
    const rows = await this.db.temporaryTaskInvitation.findMany({
      where: { taskId, task: { teamId } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return rows.map((row) => this.view(row));
  }

  async create(
    teamId: string,
    taskId: string,
    actor: string,
    input: TaskInvitationInput,
  ): Promise<NewTaskInvitation> {
    for (let attempt: number = 0; attempt < 5; attempt += 1) {
      const code: string = randomInt(0, 1000000).toString().padStart(6, "0");
      try {
        const row = await this.db.$transaction(async (tx) => {
          await requireActiveTeam(tx, teamId);
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`team-task:${taskId}`}))`;
          const task = await tx.teamWorkTask.findFirst({
            where: {
              id: taskId,
              teamId,
              status: "OPEN",
              endsAt: { gt: new Date() },
            },
          });
          if (task === null)
            throw new BadRequestException({
              message: "任务不存在、已结束或已超过计划时间，请重新安排。",
            });
          const existing = await tx.temporaryTaskInvitation.findFirst({
            where: {
              taskId,
              phone: input.phone,
              status: "PENDING",
              expiresAt: { gt: new Date() },
            },
          });
          if (existing !== null)
            throw new ConflictException({
              message: "此人已有有效邀请，请先作废旧邀请码再重新生成。",
            });
          const profiles = await tx.workerProfile.findMany({
            where: { phone: input.phone },
            include: {
              projectMemberships: {
                where: {
                  projectId: (
                    await tx.team.findUniqueOrThrow({ where: { id: teamId } })
                  ).projectId,
                },
              },
            },
          });
          if (profiles.length > 1)
            throw new ConflictException({
              message: "同手机号存在多个工人档案，请项目管理员核实后邀请。",
            });
          const profile = profiles[0];
          if (profile) {
            assertIdentityMatches(input, {
              realName: decryptPersonnelName(
                profile.encryptedName,
                this.env.PERSONNEL_ENCRYPTION_KEY,
              ),
              phone: profile.phone,
            });
            const member = profile.projectMemberships[0];
            if (
              profile.employmentStatus !== "ACTIVE" ||
              (member &&
                (member.status !== "ACTIVE" || member.teamId !== teamId))
            )
              throw new ConflictException({
                message: "该人员状态或所在班组不符，请项目管理员先调整。",
              });
          }
          if (
            await tx.managerProfile.findFirst({ where: { phone: input.phone } })
          )
            throw new ConflictException({
              message: "此号码属于管理人员档案，请使用工人档案邀请。",
            });
          const created = await tx.temporaryTaskInvitation.create({
            data: {
              codeHash: this.codeHash(code),
              taskId,
              encryptedName: encryptPersonnelName(
                input.realName,
                this.env.PERSONNEL_ENCRYPTION_KEY,
                randomBytes(12),
              ),
              phone: input.phone,
              createdByUserId: actor,
              expiresAt: new Date(
                Math.min(Date.now() + 86400000, task.endsAt.getTime()),
              ),
            },
          });
          await tx.auditLog.create({
            data: {
              actorUserId: actor,
              action: "TEMPORARY_INVITATION_CREATED",
              entityType: "TemporaryTaskInvitation",
              entityId: created.id,
              metadata: { teamId, taskId },
            },
          });
          return created;
        });
        return { ...this.view(row), code };
      } catch (error: unknown) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== "P2002" ||
          !String(error.meta?.target).includes("codeHash") ||
          attempt === 4
        )
          throw error;
        console.warn(
          JSON.stringify({
            message: "Temporary invitation code collision; retrying",
            attempt: attempt + 1,
            taskId,
          }),
        );
      }
    }
    throw new ConflictException({ message: "邀请码生成冲突，请稍后重试。" });
  }

  async revoke(
    teamId: string,
    taskId: string,
    id: string,
    actor: string,
  ): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await requireActiveTeam(tx, teamId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`team-task:${taskId}`}))`;
      const updated = await tx.temporaryTaskInvitation.updateMany({
        where: { id, taskId, task: { teamId }, status: "PENDING" },
        data: { status: "REVOKED" },
      });
      if (updated.count !== 1)
        throw new ConflictException({
          message: "邀请码已使用或已作废，请刷新后查看。",
        });
      await tx.auditLog.create({
        data: {
          actorUserId: actor,
          action: "TEMPORARY_INVITATION_REVOKED",
          entityType: "TemporaryTaskInvitation",
          entityId: id,
          metadata: { teamId, taskId },
        },
      });
    });
  }

  private async limitAttempts(userId: string): Promise<void> {
    const rows = await this.db.$queryRaw<readonly { count: number }[]>`
      INSERT INTO temporary_invite_attempts ("userId", "windowStartedAt", count) VALUES (${userId}, now(), 1)
      ON CONFLICT ("userId") DO UPDATE SET
        count = CASE WHEN temporary_invite_attempts."windowStartedAt" < now() - interval '15 minutes' THEN 1 ELSE temporary_invite_attempts.count + 1 END,
        "windowStartedAt" = CASE WHEN temporary_invite_attempts."windowStartedAt" < now() - interval '15 minutes' THEN now() ELSE temporary_invite_attempts."windowStartedAt" END
      RETURNING count`;
    if (rows[0]!.count > 10)
      throw new HttpException(
        { message: "邀请码尝试次数过多，请 15 分钟后再试。" },
        429,
      );
  }

  async accept(userId: string, code: string): Promise<TaskJoinResult> {
    await this.limitAttempts(userId);
    return this.db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`temporary-user:${userId}`}))`;
        const user = await tx.user.findUniqueOrThrow({
          where: { id: userId },
          include: { managerProfile: true, workerProfile: true },
        });
        assertAccountProfileComplete(user);
        if (user.managerProfile !== null)
          throw new ConflictException({
            message: "当前账号已绑定管理档案，不能作为临时工重新绑定。",
          });
        const initial = await tx.temporaryTaskInvitation.findUnique({
          where: { codeHash: this.codeHash(code) },
        });
        if (initial === null)
          throw new NotFoundException({
            message: "邀请码无效或已过期，请联系班组长。",
          });
        await workerClockLock(tx, userId);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`team-task:${initial.taskId}`}))`;
        const invite = await tx.temporaryTaskInvitation.findUniqueOrThrow({
          where: { id: initial.id },
          include: { task: { include: { team: true } } },
        });
        assertIdentityMatches(
          {
            realName: decryptPersonnelName(
              user.encryptedRealName!,
              this.env.PERSONNEL_ENCRYPTION_KEY,
            ),
            phone: user.phone!,
          },
          {
            realName: decryptPersonnelName(
              invite.encryptedName,
              this.env.PERSONNEL_ENCRYPTION_KEY,
            ),
            phone: invite.phone,
          },
        );
        if (
          invite.status === "ACCEPTED" &&
          invite.acceptedByUserId === userId
        ) {
          const assignment = await tx.teamTaskAssignment.findFirst({
            where: { taskId: invite.taskId, member: { worker: { userId } } },
          });
          if (assignment === null)
            throw new ConflictException({
              message: "已接受的邀请与人员安排不一致，请联系管理员。",
            });
          return {
            taskId: invite.taskId,
            projectId: invite.task.team.projectId,
            memberId: assignment.memberId,
          };
        }
        if (
          invite.status !== "PENDING" ||
          invite.expiresAt.getTime() <= Date.now() ||
          invite.task.status !== "OPEN" ||
          invite.task.endsAt.getTime() <= Date.now()
        )
          throw new ConflictException({
            message: "邀请码已使用、过期或任务已结束，请联系班组长。",
          });
        const team = await requireActiveTeam(tx, invite.task.teamId);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`member-phone:${invite.phone}`}))`;
        const matches = await tx.workerProfile.findMany({
          where: { OR: [{ phone: invite.phone }, { userId }] },
        });
        if (matches.length > 1)
          throw new ConflictException({
            message: "存在冲突的人员档案，请项目管理员核实，不能自动合并。",
          });
        if (
          await tx.managerProfile.findFirst({ where: { phone: invite.phone } })
        )
          throw new ConflictException({
            message: "手机号已有管理档案，不能新建工人绑定。",
          });
        const existing = matches[0];
        if (existing) {
          assertIdentityMatches(
            {
              realName: decryptPersonnelName(
                invite.encryptedName,
                this.env.PERSONNEL_ENCRYPTION_KEY,
              ),
              phone: invite.phone,
            },
            {
              realName: decryptPersonnelName(
                existing.encryptedName,
                this.env.PERSONNEL_ENCRYPTION_KEY,
              ),
              phone: existing.phone,
            },
          );
          if (
            existing.employmentStatus !== "ACTIVE" ||
            (existing.userId !== null && existing.userId !== userId)
          )
            throw new ForbiddenException({
              message: "该人员档案已绑定其他微信或已停用，请联系管理员。",
            });
        }
        const worker =
          existing === undefined
            ? await tx.workerProfile.create({
                data: {
                  userId,
                  encryptedName: invite.encryptedName,
                  nameSearchHashes: [
                    ...personnelNameSearchHashes(
                      decryptPersonnelName(
                        invite.encryptedName,
                        this.env.PERSONNEL_ENCRYPTION_KEY,
                      ),
                      this.env.PERSONNEL_ENCRYPTION_KEY,
                    ),
                  ],
                  phone: invite.phone,
                  workType: invite.task.workType,
                  realNameStatus: "PENDING",
                  faceProfileStatus: "PENDING",
                  employmentStatus: "ACTIVE",
                },
              })
            : await tx.workerProfile.update({
                where: { id: existing.id },
                data: { userId },
              });
        const prior = await tx.projectWorkerMember.findUnique({
          where: {
            projectId_workerId: {
              projectId: team.projectId,
              workerId: worker.id,
            },
          },
        });
        if (
          prior &&
          (prior.status !== "ACTIVE" ||
            prior.teamId !== team.id ||
            prior.enteredAt.getTime() > Date.now() ||
            (prior.exitedAt !== null && prior.exitedAt.getTime() <= Date.now()))
        )
          throw new ConflictException({
            message:
              "该人员的入场状态或所属班组不同，请项目管理员调整后再加入。",
          });
        const member =
          prior ??
          (await tx.projectWorkerMember.create({
            data: {
              projectId: team.projectId,
              workerId: worker.id,
              teamId: team.id,
              enteredAt: new Date(),
              requiresAttendance: true,
              taskAttendanceOnly: true,
              projectRoleLabel: "WORKER",
              status: "ACTIVE",
            },
          }));
        await synchronizeMembershipGrants(
          tx,
          userId,
          [],
          [
            {
              roleCode: "WORKER",
              scopeType: "PROJECT",
              scopeId: team.projectId,
            },
          ],
        );
        await tx.teamTaskAssignment.upsert({
          where: {
            taskId_memberId: { taskId: invite.taskId, memberId: member.id },
          },
          create: {
            taskId: invite.taskId,
            memberId: member.id,
            source: "TEMPORARY_INVITE",
          },
          update: {},
        });
        await tx.temporaryTaskInvitation.update({
          where: { id: invite.id },
          data: {
            status: "ACCEPTED",
            acceptedByUserId: userId,
            acceptedAt: new Date(),
          },
        });
        await tx.user.update({
          where: { id: userId },
          data: { isBound: true },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: userId,
            action: "TEMPORARY_INVITATION_ACCEPTED",
            entityType: "TemporaryTaskInvitation",
            entityId: invite.id,
            metadata: {
              taskId: invite.taskId,
              projectId: team.projectId,
              teamId: team.id,
              memberId: member.id,
            },
          },
        });
        return {
          taskId: invite.taskId,
          projectId: team.projectId,
          memberId: member.id,
        };
      },
      { timeout: 15000 },
    );
  }
}
