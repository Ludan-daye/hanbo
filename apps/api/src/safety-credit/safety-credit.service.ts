import { createHash } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Prisma, type SafetyCreditPolicy } from "@prisma/client";
import {
  calculateSafetyCredit,
  safetyCreditDay,
  safetyStatusAt,
  type MySafetyCredit,
  type SafetyCreditBoard,
  type SafetyCreditPolicyInput,
  type SafetyCreditPolicyView,
  type SafetyCreditSummary,
  type SafetyDecisionAction,
  type SafetySeverity,
  type SafetyViolationInput,
  type SafetyViolationView,
} from "@construction/domain";
import {
  authorizePermission,
  ROLE_LEVEL,
  scopeIncludesTarget,
  type AuthorizationTargetScope,
} from "@construction/domain/roles.js";
import { AuthorizationContextService } from "../authorization/authorization-context.service.js";
import { API_ENV } from "../config/env.module.js";
import type { ApiEnv } from "../config/env.js";
import { PrismaService } from "../infrastructure/database/prisma.service.js";
import {
  STORAGE_PORT,
  type ReadableStoragePort,
} from "../infrastructure/storage/storage.types.js";
import { decryptPersonnelName } from "../management/personnel-name.js";
import { UploadsService } from "../uploads/uploads.service.js";
import { safetyWorkedDatesIn } from "./safety-workdays.js";

type ViolationRow = Prisma.SafetyViolationGetPayload<{
  include: { decisions: true; appeals: true };
}>;
const details = {
  decisions: {
    orderBy: [{ createdAt: "asc" as const }, { action: "asc" as const }],
  },
  appeals: { orderBy: { createdAt: "asc" as const } },
};
const policyView = (row: SafetyCreditPolicy): SafetyCreditPolicyView => ({
  version: row.version,
  startsOn: row.startsOn.toISOString().slice(0, 10),
  generalPoints: row.generalPoints,
  seriousPoints: row.seriousPoints,
  majorPoints: row.majorPoints,
  recoveryWorkdays: row.recoveryWorkdays,
  recoveryPoints: row.recoveryPoints,
  createdAt: row.createdAt.toISOString(),
});
const violationView = (row: ViolationRow, asOf: Date): SafetyViolationView => {
  const decisions = row.decisions
    .filter((decision) => decision.createdAt <= asOf)
    .map((decision) => ({
      action: decision.action as SafetyDecisionAction,
      reason: decision.reason,
      createdAt: decision.createdAt.toISOString(),
    }));
  const last = decisions.at(-1);
  return {
    id: row.id,
    workerId: row.workerId,
    projectId: row.projectId,
    teamId: row.teamId,
    memberId: row.memberId,
    category: row.category,
    severity: row.severity as SafetySeverity,
    occurredAt: row.occurredAt.toISOString(),
    description: row.description,
    evidenceObjectKeys: row.evidenceObjectKeys,
    points: row.points,
    policyVersion: row.policyVersion,
    status: safetyStatusAt(decisions, asOf),
    createdAt: row.createdAt.toISOString(),
    reviewedAt: last?.createdAt ?? null,
    reviewReason: last?.reason ?? null,
    decisions,
    appeals: row.appeals
      .filter((appeal) => appeal.createdAt <= asOf)
      .map((appeal) => ({
        id: appeal.id,
        reason: appeal.reason,
        status:
          appeal.reviewedAt !== null && appeal.reviewedAt <= asOf
            ? (appeal.status as "ACCEPTED" | "REJECTED")
            : "PENDING",
        createdAt: appeal.createdAt.toISOString(),
        reviewedAt:
          appeal.reviewedAt !== null && appeal.reviewedAt <= asOf
            ? appeal.reviewedAt.toISOString()
            : null,
        reviewReason:
          appeal.reviewedAt !== null && appeal.reviewedAt <= asOf
            ? appeal.reviewReason
            : null,
      })),
  };
};
const pointsFor = (
  policy: SafetyCreditPolicy,
  severity: SafetySeverity,
): number =>
  severity === "GENERAL"
    ? policy.generalPoints
    : severity === "SERIOUS"
      ? policy.seriousPoints
      : policy.majorPoints;

@Injectable()
export class SafetyCreditService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuthorizationContextService)
    private readonly authorization: AuthorizationContextService,
    @Inject(UploadsService) private readonly uploads: UploadsService,
    @Inject(STORAGE_PORT) private readonly storage: ReadableStoragePort,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  async policiesIn(
    database: Prisma.TransactionClient,
  ): Promise<readonly SafetyCreditPolicyView[]> {
    const rows = await database.safetyCreditPolicy.findMany({
      orderBy: { version: "asc" },
    });
    if (rows.length === 0)
      throw new ServiceUnavailableException({
        message: "SAFETY_POLICY_NOT_INITIALIZED",
      });
    return rows.map(policyView);
  }
  policies(): Promise<readonly SafetyCreditPolicyView[]> {
    return this.policiesIn(this.db);
  }

  summaries(
    workerIds: readonly string[],
    asOf: Date,
  ): Promise<ReadonlyMap<string, SafetyCreditSummary>> {
    return this.db.$transaction(
      (database) => this.summariesIn(database, workerIds, asOf, new Date()),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  async summariesIn(
    database: Prisma.TransactionClient,
    workerIds: readonly string[],
    asOf: Date,
    snapshotAt: Date,
  ): Promise<ReadonlyMap<string, SafetyCreditSummary>> {
    if (workerIds.length === 0) return new Map();
    const ids = [...new Set(workerIds)];
    const [policies, rows] = await Promise.all([
      this.policiesIn(database),
      database.safetyViolation.findMany({
        where: {
          workerId: { in: ids },
          createdAt: { lte: snapshotAt },
          occurredAt: { lte: asOf },
        },
        include: details,
      }),
    ]);
    const views = rows.map((row) => violationView(row, snapshotAt));
    const affected = ids.filter((id) =>
      views.some((row) => row.workerId === id && row.status === "CONFIRMED"),
    );
    const workdays =
      affected.length === 0
        ? new Map<string, readonly string[]>()
        : await safetyWorkedDatesIn(database, affected, asOf, snapshotAt);
    return new Map(
      ids.map((id) => [
        id,
        calculateSafetyCredit(
          id,
          views,
          workdays.get(id) ?? [],
          policies,
          asOf,
          snapshotAt,
        ),
      ]),
    );
  }
  reportEvents(
    projectIds: readonly string[],
    workerIds: readonly string[],
    fromDate: string,
    toDate: string,
    asOf: Date,
  ): Promise<readonly SafetyViolationView[]> {
    return this.reportEventsIn(
      this.db,
      projectIds,
      workerIds,
      fromDate,
      toDate,
      asOf,
      new Date(),
    );
  }
  async reportEventsIn(
    database: Prisma.TransactionClient,
    projectIds: readonly string[],
    workerIds: readonly string[],
    fromDate: string,
    toDate: string,
    asOf: Date,
    snapshotAt: Date,
  ): Promise<readonly SafetyViolationView[]> {
    const end = new Date(
      Math.min(Date.parse(`${toDate}T23:59:59.999+08:00`), asOf.getTime()),
    );
    const rows = await database.safetyViolation.findMany({
      where: {
        projectId: { in: [...projectIds] },
        workerId: { in: [...workerIds] },
        occurredAt: { gte: new Date(`${fromDate}T00:00:00+08:00`), lte: end },
        createdAt: { lte: snapshotAt },
      },
      include: details,
      orderBy: [{ occurredAt: "desc" }, { id: "asc" }],
    });
    return rows.map((row) => violationView(row, snapshotAt));
  }
  private async target(
    userId: string,
    id: string,
    source: "teamParam" | "projectParam",
    permission: string,
  ): Promise<AuthorizationTargetScope> {
    const target = await this.authorization.resolveTargetScope(
      { source, paramName: "id" },
      { params: { id } },
    );
    const auth = await this.authorization.loadAuthorizationData(userId);
    if (
      !authorizePermission({
        ...auth,
        requiredPermissionCode: permission,
        targetScope: target,
      }).isAuthorized
    )
      throw new ForbiddenException({ message: "SAFETY_SCOPE_FORBIDDEN" });
    return target;
  }
  private async level(
    userId: string,
    target: AuthorizationTargetScope,
  ): Promise<number> {
    const auth = await this.authorization.loadAuthorizationData(userId);
    return Math.max(
      0,
      ...auth.assignments
        .filter((row) => scopeIncludesTarget(row.scope, target))
        .map((row) => ROLE_LEVEL[row.roleCode]),
    );
  }
  private async workerId(userId: string): Promise<string> {
    const worker = await this.db.workerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (worker === null)
      throw new NotFoundException({ message: "SAFETY_WORKER_PROFILE_NOT_LINKED" });
    return worker.id;
  }
  async teamBoard(userId: string, teamId: string): Promise<SafetyCreditBoard> {
    await this.target(userId, teamId, "teamParam", "team.safety.manage");
    return this.board({ teamId, status: "ACTIVE" }, { teamId });
  }
  async projectBoard(
    userId: string,
    projectId: string,
  ): Promise<SafetyCreditBoard> {
    await this.target(userId, projectId, "projectParam", "project.manage");
    return this.board({ projectId, status: "ACTIVE" }, { projectId });
  }
  private board(
    memberWhere: Prisma.ProjectWorkerMemberWhereInput,
    violationWhere: Prisma.SafetyViolationWhereInput,
  ): Promise<SafetyCreditBoard> {
    return this.db.$transaction(
      async (database) => {
        const now = new Date();
        const [members, rows, policies] = await Promise.all([
          database.projectWorkerMember.findMany({
            where: memberWhere,
            include: { worker: { select: { encryptedName: true } } },
          }),
          database.safetyViolation.findMany({
            where: violationWhere,
            include: details,
            orderBy: [{ occurredAt: "desc" }, { id: "asc" }],
            take: 500,
          }),
          this.policiesIn(database),
        ]);
        const summaries = await this.summariesIn(
          database,
          members.map((row) => row.workerId),
          now,
          now,
        );
        const ranked = members
          .map((row) => ({
            ...summaries.get(row.workerId)!,
            memberId: row.id,
            name: decryptPersonnelName(
              row.worker.encryptedName,
              this.env.PERSONNEL_ENCRYPTION_KEY,
            ),
          }))
          .sort(
            (a, b) =>
              b.confirmedViolationCount - a.confirmedViolationCount ||
              a.score - b.score ||
              a.workerId.localeCompare(b.workerId),
          );
        return {
          workers: ranked.map((row, index) => ({ ...row, rank: index + 1 })),
          violations: rows.map((row) => violationView(row, now)),
          policies,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  async mine(userId: string): Promise<MySafetyCredit> {
    const workerId = await this.workerId(userId);
    return this.db.$transaction(
      async (database) => {
        const now = new Date();
        const [summaries, rows, policies] = await Promise.all([
          this.summariesIn(database, [workerId], now, now),
          database.safetyViolation.findMany({
            where: { workerId },
            include: details,
            orderBy: [{ occurredAt: "desc" }, { id: "asc" }],
          }),
          this.policiesIn(database),
        ]);
        return {
          summary: summaries.get(workerId)!,
          violations: rows.map((row) => violationView(row, now)),
          policies,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  async record(
    userId: string,
    teamId: string,
    input: SafetyViolationInput,
  ): Promise<SafetyViolationView> {
    await this.target(userId, teamId, "teamParam", "team.safety.manage");
    const now = new Date();
    const occurredAt = new Date(input.occurredAt);
    if (occurredAt > now)
      throw new BadRequestException({ message: "VIOLATION_OCCURRED_IN_FUTURE" });
    const member = await this.db.projectWorkerMember.findFirst({
      where: { id: input.memberId, teamId, status: "ACTIVE" },
    });
    if (member === null)
      throw new NotFoundException({ message: "VIOLATION_MEMBER_NOT_ON_TEAM" });
    if (
      occurredAt < member.enteredAt ||
      (member.exitedAt !== null && occurredAt > member.exitedAt)
    )
      throw new BadRequestException({ message: "VIOLATION_OUTSIDE_MEMBERSHIP" });
    const policy = await this.db.safetyCreditPolicy.findFirst({
      where: { startsOn: { lte: new Date(safetyCreditDay(occurredAt)) } },
      orderBy: [{ startsOn: "desc" }, { version: "desc" }],
    });
    if (policy === null)
      throw new BadRequestException({
        message: "SAFETY_POLICY_NOT_EFFECTIVE",
      });
    if (
      new Set(input.evidence.map((row) => row.objectKey)).size !==
      input.evidence.length
    )
      throw new BadRequestException({ message: "VIOLATION_EVIDENCE_DUPLICATED" });
    await Promise.all(
      input.evidence.map((row) =>
        this.uploads.requireOwnedImage(userId, row.objectKey, row.hash),
      ),
    );
    const eventKey = createHash("sha256")
      .update(
        JSON.stringify([
          member.workerId,
          member.projectId,
          input.category.normalize("NFKC").trim(),
          Math.floor(occurredAt.getTime() / 60000),
        ]),
      )
      .digest("hex");
    try {
      const row = await this.db.safetyViolation.create({
        data: {
          workerId: member.workerId,
          projectId: member.projectId,
          teamId,
          memberId: member.id,
          eventKey,
          category: input.category,
          severity: input.severity,
          occurredAt,
          description: input.description,
          evidenceObjectKeys: input.evidence.map((item) => item.objectKey),
          points: pointsFor(policy, input.severity),
          policyVersion: policy.version,
          createdByUserId: userId,
        },
        include: details,
      });
      return violationView(row, new Date());
    } catch (cause: unknown) {
      if (
        cause instanceof Prisma.PrismaClientKnownRequestError &&
        cause.code === "P2002"
      )
        throw new ConflictException({
          message: "VIOLATION_ALREADY_RECORDED",
        });
      throw cause;
    }
  }
  private async reviewable(
    userId: string,
    projectId: string,
    id: string,
  ): Promise<void> {
    const target = await this.target(
      userId,
      projectId,
      "projectParam",
      "project.manage",
    );
    const row = await this.db.safetyViolation.findFirst({
      where: { id, projectId },
      include: { worker: { select: { userId: true } } },
    });
    if (row === null)
      throw new NotFoundException({ message: "VIOLATION_NOT_FOUND" });
    const teamTarget = await this.authorization.resolveTargetScope(
      { source: "teamParam", paramName: "id" },
      { params: { id: row.teamId } },
    );
    const [actorLevel, authorLevel] = await Promise.all([
      this.level(userId, target),
      this.level(row.createdByUserId, teamTarget),
    ]);
    if (
      userId === row.createdByUserId ||
      userId === row.worker.userId ||
      actorLevel < 3 ||
      actorLevel <= authorLevel
    )
      throw new ForbiddenException({
        message: "VIOLATION_REVIEW_REQUIRES_HIGHER_ROLE",
      });
  }
  async review(
    userId: string,
    projectId: string,
    id: string,
    action: SafetyDecisionAction,
    reason: string,
  ): Promise<void> {
    await this.reviewable(userId, projectId, id);
    const expected: string = action === "REVOKE" ? "CONFIRMED" : "PENDING";
    const status: string =
      action === "CONFIRM"
        ? "CONFIRMED"
        : action === "REJECT"
          ? "REJECTED"
          : "REVOKED";
    await this.db.$transaction(async (database) => {
      await database.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`safety-appeal:${id}`}, 0))`;
      const now = new Date();
      const result = await database.safetyViolation.updateMany({
        where: { id, projectId, status: expected },
        data: {
          status,
          reviewedByUserId: userId,
          reviewedAt: now,
          reviewReason: reason,
        },
      });
      if (result.count !== 1)
        throw new ConflictException({
          message: "VIOLATION_CHANGED_RELOAD",
        });
      await database.safetyCreditDecision.create({
        data: {
          violationId: id,
          action,
          reason,
          actorUserId: userId,
          createdAt: now,
        },
      });
      if (action === "REVOKE")
        await database.safetyCreditAppeal.updateMany({
          where: { violationId: id, status: "PENDING" },
          data: {
            status: "ACCEPTED",
            reviewedAt: now,
            reviewedByUserId: userId,
            reviewReason: reason,
          },
        });
      await database.auditLog.create({
        data: {
          action: "SAFETY_VIOLATION_REVIEWED",
          actorUserId: userId,
          entityId: id,
          entityType: "safety_violation",
          metadata: { action, status },
          projectId,
        },
      });
    });
  }
  async appeal(
    userId: string,
    violationId: string,
    reason: string,
  ): Promise<void> {
    const workerId = await this.workerId(userId);
    await this.db.$transaction(async (database) => {
      await database.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`safety-appeal:${violationId}`}, 0))`;
      const row = await database.safetyViolation.findFirst({
        where: { id: violationId, workerId, status: "CONFIRMED" },
      });
      if (row === null)
        throw new NotFoundException({ message: "APPEAL_NOT_ALLOWED" });
      const pending = await database.safetyCreditAppeal.findFirst({
        where: { violationId, status: "PENDING" },
      });
      if (pending !== null)
        throw new ConflictException({ message: "APPEAL_ALREADY_PENDING" });
      await database.safetyCreditAppeal.create({
        data: { violationId, workerId, reason },
      });
    });
  }
  async reviewAppeal(
    userId: string,
    projectId: string,
    violationId: string,
    appealId: string,
    accept: boolean,
    reason: string,
  ): Promise<void> {
    await this.reviewable(userId, projectId, violationId);
    await this.db.$transaction(async (database) => {
      await database.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`safety-appeal:${violationId}`}, 0))`;
      const now = new Date();
      const changed = await database.safetyCreditAppeal.updateMany({
        where: { id: appealId, violationId, status: "PENDING" },
        data: {
          status: accept ? "ACCEPTED" : "REJECTED",
          reviewedByUserId: userId,
          reviewedAt: now,
          reviewReason: reason,
        },
      });
      if (changed.count !== 1)
        throw new ConflictException({ message: "APPEAL_ALREADY_DECIDED" });
      if (accept) {
        const changedViolation = await database.safetyViolation.updateMany({
          where: { id: violationId, projectId, status: "CONFIRMED" },
          data: {
            status: "REVOKED",
            reviewedByUserId: userId,
            reviewedAt: now,
            reviewReason: reason,
          },
        });
        if (changedViolation.count !== 1)
          throw new ConflictException({ message: "VIOLATION_STATE_CHANGED" });
        await database.safetyCreditDecision.create({
          data: {
            violationId,
            action: "REVOKE",
            reason,
            actorUserId: userId,
            createdAt: now,
          },
        });
      }
      await database.auditLog.create({
        data: {
          action: "SAFETY_APPEAL_REVIEWED",
          actorUserId: userId,
          entityId: appealId,
          entityType: "safety_credit_appeal",
          metadata: { accepted: accept, violationId },
          projectId,
        },
      });
    });
  }
  async createPolicy(
    userId: string,
    input: SafetyCreditPolicyInput,
  ): Promise<SafetyCreditPolicyView> {
    const auth = await this.authorization.loadAuthorizationData(userId);
    if (
      !auth.assignments.some(
        (row) =>
          row.roleCode === "SYSTEM_ADMIN" &&
          row.scope.scopeType === "GLOBAL" &&
          row.scope.scopeId === "GLOBAL",
      )
    )
      throw new ForbiddenException({
        message: "SAFETY_POLICY_REQUIRES_SYSTEM_ADMIN",
      });
    if (input.startsOn <= safetyCreditDay(new Date()))
      throw new BadRequestException({ message: "SAFETY_POLICY_STARTS_TOO_EARLY" });
    return this.db.$transaction(async (database) => {
      await database.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"safety-credit-policy"}, 0))`;
      const previous = await database.safetyCreditPolicy.findFirst({
        orderBy: { version: "desc" },
      });
      if (previous === null)
        throw new ServiceUnavailableException({
          message: "SAFETY_POLICY_BASELINE_MISSING",
        });
      if (input.startsOn <= previous.startsOn.toISOString().slice(0, 10))
        throw new ConflictException({ message: "SAFETY_POLICY_DATE_NOT_AFTER_LATEST" });
      const row = await database.safetyCreditPolicy.create({
        data: {
          ...input,
          startsOn: new Date(input.startsOn),
          version: previous.version + 1,
          createdByUserId: userId,
        },
      });
      return policyView(row);
    });
  }
  async evidence(
    userId: string,
    violationId: string,
    index: number,
  ): Promise<{ readonly contentType: string; readonly base64: string }> {
    const row = await this.db.safetyViolation.findUnique({
      where: { id: violationId },
      include: { worker: { select: { userId: true } } },
    });
    if (row === null)
      throw new NotFoundException({ message: "VIOLATION_RECORD_NOT_FOUND" });
    if (row.worker.userId !== userId)
      await this.target(userId, row.teamId, "teamParam", "team.safety.manage");
    const objectKey = row.evidenceObjectKeys[index];
    if (objectKey === undefined)
      throw new NotFoundException({ message: "EVIDENCE_PHOTO_NOT_FOUND" });
    const file = await this.db.storedFile.findUnique({ where: { objectKey } });
    if (
      file === null ||
      file.deletedAt !== null ||
      (file.expiresAt !== null && file.expiresAt <= new Date())
    )
      throw new NotFoundException({ message: "EVIDENCE_PHOTO_EXPIRED" });
    const bytes = await this.storage.get(objectKey);
    if (createHash("sha256").update(bytes).digest("hex") !== file.hash)
      throw new ConflictException({ message: "EVIDENCE_PHOTO_INTEGRITY_FAILED" });
    return { contentType: file.contentType, base64: bytes.toString("base64") };
  }
}
