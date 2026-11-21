import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { WorkerProfile } from "@prisma/client";

import { API_ENV } from "../config/env.module.js";
import type { ApiEnv } from "../config/env.js";
import { PrismaService } from "../infrastructure/database/prisma.service.js";

import { decryptPersonnelName } from "./personnel-name.js";
import type {
  MemberRegistrationResponse,
  RegistrationVerificationRequest,
  RegistrationVerificationStatus,
} from "./registration-review.types.js";

const verificationStatus = (value: string): RegistrationVerificationStatus =>
  value === "VERIFIED" || value === "NEEDS_UPDATE" ? value : "PENDING";

/**
 * Project admins (and above, in scope) read a worker's registration unmasked and mark it
 * 已核实 or 需更正 (decisions 2 and 3 of 2026-11-20). Marks are logged; since 2026-11-21 (Q9)
 * each read is logged too (who, when, whose), without a reason, at most once per viewer and
 * person every 10 minutes so reopening the page does not flood the log.
 */
@Injectable()
export class RegistrationReviewService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  async get(
    projectId: string,
    memberId: string,
  ): Promise<MemberRegistrationResponse> {
    const member = await this.workerMember(projectId, memberId);
    return this.response(member.id, member.worker);
  }

  async view(
    projectId: string,
    memberId: string,
    viewerUserId: string,
  ): Promise<MemberRegistrationResponse> {
    const member = await this.workerMember(projectId, memberId);
    const recent = await this.prisma.auditLog.count({
      where: {
        action: "WORKER_REGISTRATION_VIEWED",
        actorUserId: viewerUserId,
        createdAt: { gt: new Date(Date.now() - 10 * 60_000) },
        entityId: member.worker.id,
      },
    });
    // Nothing filled in yet means nothing was read: no 查看用工资料 entry.
    if (recent === 0 && member.worker.registrationCompletedAt !== null)
      await this.prisma.auditLog.create({
        data: {
          action: "WORKER_REGISTRATION_VIEWED",
          actorUserId: viewerUserId,
          entityId: member.worker.id,
          entityType: "worker_profile",
          metadata: { memberId: member.id },
          projectId,
        },
      });
    return this.response(member.id, member.worker);
  }

  async verify(
    projectId: string,
    memberId: string,
    actorUserId: string,
    body: RegistrationVerificationRequest,
  ): Promise<MemberRegistrationResponse> {
    const member = await this.workerMember(projectId, memberId);
    const worker = member.worker;
    if (worker.userId === actorUserId)
      throw new ForbiddenException({
        message: "REGISTRATION_SELF_VERIFY_FORBIDDEN",
      });
    if (worker.registrationCompletedAt === null)
      throw new ConflictException({ message: "REGISTRATION_NOT_SUBMITTED" });
    await this.prisma.$transaction(async (transaction): Promise<void> => {
      const result = await transaction.workerProfile.updateMany({
        where: {
          id: worker.id,
          registrationVersion: body.expectedVersion,
          registrationCompletedAt: { not: null },
        },
        data: {
          realNameStatus: body.status,
          registrationVerifiedAt: new Date(),
          registrationVerifiedByUserId: actorUserId,
          registrationVersion: { increment: 1 },
          // Not a profile edit: keep the version open person forms hold.
          updatedAt: worker.updatedAt,
        },
      });
      if (result.count !== 1)
        throw new ConflictException({
          message: "REGISTRATION_CHANGED_RELOAD_BEFORE_SAVING",
        });
      await transaction.auditLog.create({
        data: {
          action: "WORKER_REGISTRATION_VERIFIED",
          actorUserId,
          entityId: worker.id,
          entityType: "worker_profile",
          metadata: {
            memberId: member.id,
            previousStatus: verificationStatus(worker.realNameStatus),
            status: body.status,
          },
          projectId,
        },
      });
    });
    return this.get(projectId, memberId);
  }

  private async workerMember(projectId: string, memberId: string) {
    const member = await this.prisma.projectWorkerMember.findFirst({
      where: { id: memberId, projectId },
      include: { worker: true },
    });
    if (member !== null) return member;
    const manager = await this.prisma.projectManagerMember.findFirst({
      where: { id: memberId, projectId },
      select: { id: true },
    });
    if (manager !== null)
      throw new BadRequestException({
        message: "REGISTRATION_ONLY_FOR_WORKERS",
        memberId,
      });
    throw new NotFoundException({
      message: "PROJECT_MEMBER_NOT_FOUND",
      projectId,
      memberId,
    });
  }

  private decrypt(value: string | null): string {
    return value === null
      ? ""
      : decryptPersonnelName(value, this.env.PERSONNEL_ENCRYPTION_KEY);
  }

  private async response(
    memberId: string,
    worker: WorkerProfile,
  ): Promise<MemberRegistrationResponse> {
    const verifier =
      worker.registrationVerifiedByUserId === null
        ? null
        : await this.prisma.user.findUnique({
            where: { id: worker.registrationVerifiedByUserId },
            select: { encryptedRealName: true, nickname: true },
          });
    const verifierName =
      verifier === null
        ? null
        : verifier.encryptedRealName?.startsWith("name-v1:")
          ? this.decrypt(verifier.encryptedRealName)
          : (verifier.nickname ?? null);
    return {
      displayName: worker.encryptedName.startsWith("name-v1:")
        ? this.decrypt(worker.encryptedName)
        : null,
      memberId,
      phone: worker.phone,
      registration:
        worker.registrationCompletedAt === null
          ? null
          : {
              idNumber: this.decrypt(worker.encryptedIdNumber),
              residentialAddress: this.decrypt(
                worker.encryptedResidentialAddress,
              ),
              emergencyContactName: worker.emergencyContactName ?? "",
              emergencyContactPhone: worker.emergencyContactPhone ?? "",
              hasLongTermMedication: worker.hasLongTermMedication,
              medicationDetails: this.decrypt(
                worker.encryptedMedicationDetails,
              ),
              hasPersonalInsurance: worker.hasPersonalInsurance,
              insuranceDetails: this.decrypt(worker.encryptedInsuranceDetails),
              payrollBankCard: this.decrypt(worker.encryptedPayrollBankCard),
            },
      submittedAt: worker.registrationCompletedAt?.toISOString() ?? null,
      verification: {
        status: verificationStatus(worker.realNameStatus),
        verifiedAt: worker.registrationVerifiedAt?.toISOString() ?? null,
        verifiedByName: verifierName,
        version: worker.registrationVersion,
      },
    };
  }
}
