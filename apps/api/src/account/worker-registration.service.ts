import { createHmac, randomBytes } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  normalizeWorkerRegistration,
  workerRegistrationError,
  type WorkerRegistration,
} from "@construction/domain";
import { API_ENV } from "../config/env.module.js";
import type { ApiEnv } from "../config/env.js";
import { PrismaService } from "../infrastructure/database/prisma.service.js";
import {
  decryptPersonnelName,
  encryptPersonnelName,
} from "../management/personnel-name.js";

@Injectable()
export class WorkerRegistrationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  async get(userId: string): Promise<WorkerRegistration> {
    const worker = await this.prisma.workerProfile.findUnique({
      where: { userId },
    });
    if (worker === null)
      throw new ForbiddenException({ message: "WORKER_PROFILE_NOT_BOUND" });
    const decrypt = (value: string | null): string =>
      value === null
        ? ""
        : decryptPersonnelName(value, this.env.PERSONNEL_ENCRYPTION_KEY);
    return {
      idNumber: decrypt(worker.encryptedIdNumber),
      residentialAddress: decrypt(worker.encryptedResidentialAddress),
      emergencyContactName: worker.emergencyContactName ?? "",
      emergencyContactPhone: worker.emergencyContactPhone ?? "",
      hasLongTermMedication: worker.hasLongTermMedication,
      medicationDetails: decrypt(worker.encryptedMedicationDetails),
      hasPersonalInsurance: worker.hasPersonalInsurance,
      insuranceDetails: decrypt(worker.encryptedInsuranceDetails),
      payrollBankCard: decrypt(worker.encryptedPayrollBankCard),
    };
  }

  async save(userId: string, input: WorkerRegistration): Promise<void> {
    const value: WorkerRegistration = normalizeWorkerRegistration(input);
    const reason: string | null = workerRegistrationError(value);
    if (reason !== null)
      throw new BadRequestException({
        message: "WORKER_REGISTRATION_INVALID",
        reason,
      });
    const encrypt = (plain: string): string =>
      encryptPersonnelName(
        plain,
        this.env.PERSONNEL_ENCRYPTION_KEY,
        randomBytes(12),
      );
    try {
      await this.prisma.$transaction(async (transaction): Promise<void> => {
        await transaction.$queryRaw`SELECT id FROM worker_profiles WHERE "userId" = ${userId} FOR UPDATE`;
        const worker = await transaction.workerProfile.findUnique({
          where: { userId },
        });
        if (worker === null)
          throw new ForbiddenException({ message: "WORKER_PROFILE_NOT_BOUND" });
        if (
          worker.encryptedIdNumber !== null &&
          decryptPersonnelName(
            worker.encryptedIdNumber,
            this.env.PERSONNEL_ENCRYPTION_KEY,
          ) !== value.idNumber
        )
          throw new ConflictException({
            message: "WORKER_IDENTITY_CHANGE_REQUIRES_REVIEW",
          });
        await transaction.workerProfile.update({
          where: { id: worker.id },
          data: {
            encryptedIdNumber: encrypt(value.idNumber),
            idNumberHash: createHmac(
              "sha256",
              Buffer.from(this.env.PERSONNEL_ENCRYPTION_KEY, "hex"),
            )
              .update(`worker-id\u0000${value.idNumber}`)
              .digest("hex"),
            encryptedResidentialAddress: encrypt(value.residentialAddress),
            emergencyContactName: value.emergencyContactName,
            emergencyContactPhone: value.emergencyContactPhone,
            hasLongTermMedication: value.hasLongTermMedication,
            encryptedMedicationDetails: value.hasLongTermMedication
              ? encrypt(value.medicationDetails)
              : null,
            hasPersonalInsurance: value.hasPersonalInsurance,
            encryptedInsuranceDetails: value.hasPersonalInsurance
              ? encrypt(value.insuranceDetails)
              : null,
            encryptedPayrollBankCard: encrypt(value.payrollBankCard),
            registrationCompletedAt: new Date(),
          },
        });
        await transaction.auditLog.create({
          data: {
            actorUserId: userId,
            action: "worker.registration.submit",
            entityType: "worker_profile",
            entityId: worker.id,
            metadata: { source: "SELF_DECLARED" },
          },
        });
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new ConflictException({
          message: "WORKER_ID_NUMBER_ALREADY_EXISTS",
        });
      throw error;
    }
  }
}
