import { createHash, randomUUID } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  FaceProfile,
  FaceVerificationSession,
  Prisma,
} from "@prisma/client";

import { API_ENV } from "../config/env.module.js";
import type { ApiEnv } from "../config/env.js";
import { PrismaService } from "../infrastructure/database/prisma.service.js";
import { TencentNativeFaceConnector, type NativeFaceResult } from "../infrastructure/face/tencent-native-face.connector.js";
import { TencentVideoFaceConnector, parseActionSequence } from "../infrastructure/face/tencent-video-face.connector.js";
import {
  STORAGE_PORT,
  type ReadableStoragePort,
} from "../infrastructure/storage/storage.types.js";
import { UploadsService } from "../uploads/uploads.service.js";
import { imageContentType } from "../uploads/image-content-type.js";
import type { UploadedMultipartFile } from "../uploads/uploads.types.js";

import {
  FACE_CONSENT_TEXT,
  FACE_CONSENT_VERSION,
  faceProfileResponse,
  type FaceOwner,
  type FaceProfileResponse,
  type FaceSessionContext,
  type IssuedFaceSession,
  type IssuedVideoFaceSession,
  type CompletedFaceSession,
  type MyFaceResponse,
} from "./face.types.js";
import { requireFaceVideo } from "./face-video-validation.js";

const imageType = (image: Buffer): "image/jpeg" | "image/png" => {
  const contentType = imageContentType(image);
  if (contentType === null) throw new BadRequestException({ message: "FACE_IMAGE_INVALID" });
  return contentType;
};

const lockOwner = async (
  tx: Prisma.TransactionClient,
  owner: FaceOwner,
): Promise<void> => {
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`${owner.ownerType}:${owner.ownerId}`}, 0))`;
};

@Injectable()
export class FaceService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(UploadsService) private readonly uploads: UploadsService,
    @Inject(STORAGE_PORT) private readonly storage: ReadableStoragePort,
    @Inject(TencentNativeFaceConnector)
    private readonly provider: TencentNativeFaceConnector,
    @Inject(TencentVideoFaceConnector) private readonly videoProvider: TencentVideoFaceConnector,
  ) {}

  async getMine(userId: string): Promise<MyFaceResponse> {
    const owner = await this.ownerForUser(userId);
    const profile = await this.prisma.faceProfile.findFirst({
      where: owner,
      orderBy: { version: "desc" },
    });
    return {
      mode: this.env.FACE_DEV_STUB
        ? "DEVELOPMENT"
        : this.env.TENCENT_FACE_MODE === "VIDEO_ACTION"
          ? this.videoProvider.isConfigured() ? "VIDEO_ACTION" : "UNCONFIGURED"
          : this.provider.isConfigured() ? "WECHAT_NATIVE" : "UNCONFIGURED",
      consentText: FACE_CONSENT_TEXT,
      consentVersion: FACE_CONSENT_VERSION,
      profile: profile === null ? null : faceProfileResponse(profile),
    };
  }

  async enroll(
    userId: string,
    file: UploadedMultipartFile | undefined,
    consentVersion: string,
  ): Promise<FaceProfileResponse> {
    if (consentVersion !== FACE_CONSENT_VERSION)
      throw new BadRequestException({ message: "FACE_CONSENT_REQUIRED" });
    const owner = await this.ownerForUser(userId);
    if (file === undefined || file.size > 2 * 1024 * 1024)
      throw new BadRequestException({ message: "FACE_IMAGE_SIZE_INVALID" });
    if (imageType(file.buffer) !== file.mimetype)
      throw new BadRequestException({ message: "FACE_IMAGE_INVALID" });
    const upload = await this.uploads.storeImage(file);
    const profile = await this.prisma.$transaction(async (tx) => {
      await lockOwner(tx, owner);
      const latest = await tx.faceProfile.findFirst({
        where: owner,
        orderBy: { version: "desc" },
      });
      await tx.faceProfile.updateMany({
        where: { ...owner, status: { in: ["APPROVED", "PENDING"] } },
        data: { status: "REPLACED" },
      });
      if (owner.ownerType === "WORKER") {
        await tx.workerProfile.update({
          where: { id: owner.ownerId },
          data: { faceProfileStatus: "PENDING" },
        });
      }
      return tx.faceProfile.create({
        data: {
          ...owner,
          baselineObjectKey: upload.objectKey,
          baselineImageHash: upload.hash,
          submittedByUserId: userId,
          consentedAt: new Date(),
          consentVersion,
          status: "PENDING",
          version: (latest?.version ?? 0) + 1,
        },
      });
    });
    return faceProfileResponse(profile);
  }

  async listForProject(
    projectId: string,
  ): Promise<readonly FaceProfileResponse[]> {
    const owners = await this.ownersForProject(projectId);
    if (owners.length === 0) return [];
    const profiles = await this.prisma.faceProfile.findMany({
      where: {
        OR: owners,
        status: { in: ["PENDING", "APPROVED", "REJECTED"] },
      },
      orderBy: { createdAt: "desc" },
    });
    return profiles.map(faceProfileResponse);
  }

  async getPhoto(
    projectId: string,
    profileId: string,
  ): Promise<{ readonly dataUrl: string }> {
    const profile = await this.profileForProject(projectId, profileId);
    const image = await this.storage.get(profile.baselineObjectKey);
    return {
      dataUrl: `data:${imageType(image)};base64,${image.toString("base64")}`,
    };
  }

  async review(
    projectId: string,
    profileId: string,
    reviewerUserId: string,
    decision: "APPROVED" | "REJECTED",
    reason: string,
  ): Promise<FaceProfileResponse> {
    const profile = await this.profileForProject(projectId, profileId);
    const owner = { ownerType: profile.ownerType, ownerId: profile.ownerId };
    const bound =
      profile.ownerType === "WORKER"
        ? await this.prisma.workerProfile.findUnique({
            where: { id: profile.ownerId },
          })
        : await this.prisma.managerProfile.findUnique({
            where: { id: profile.ownerId },
          });
    if (
      bound?.userId === reviewerUserId ||
      profile.submittedByUserId === reviewerUserId
    )
      throw new ForbiddenException({ message: "FACE_SELF_REVIEW_FORBIDDEN" });
    const updated = await this.prisma.$transaction(async (tx) => {
      await lockOwner(tx, owner);
      const result = await tx.faceProfile.updateMany({
        where: { id: profileId, status: "PENDING" },
        data: {
          status: decision,
          reviewedByUserId: reviewerUserId,
          reviewedAt: new Date(),
          reviewReason: reason,
        },
      });
      if (result.count !== 1)
        throw new ConflictException({ message: "FACE_PROFILE_NOT_PENDING" });
      if (owner.ownerType === "WORKER") {
        await tx.workerProfile.update({
          where: { id: owner.ownerId },
          data: { faceProfileStatus: decision },
        });
      }
      return tx.faceProfile.findUniqueOrThrow({ where: { id: profileId } });
    });
    return faceProfileResponse(updated);
  }

  async startSession(context: FaceSessionContext): Promise<IssuedFaceSession> {
    if (this.env.TENCENT_FACE_MODE !== "WECHAT_NATIVE" || !this.provider.isConfigured())
      throw new BadRequestException({ message: "FACE_NATIVE_PROVIDER_NOT_CONFIGURED" });
    const { id, expiresAt, profile } = await this.reserveSession(context, "WECHAT_NATIVE");
    try {
      const image = await this.storage.get(profile.baselineObjectKey);
      const bizToken = await this.provider.createSession(image, id);
      await this.prisma.faceVerificationSession.update({
        where: { id },
        data: { bizToken, status: "PENDING" },
      });
      return { id, bizToken, expiresAt: expiresAt.toISOString() };
    } catch (error: unknown) {
      await this.prisma.faceVerificationSession.update({
        where: { id },
        data: { status: "FAILED", failureCode: "FACE_SESSION_CREATION_FAILED" },
      });
      throw error;
    }
  }

  async startVideoSession(context: FaceSessionContext): Promise<IssuedVideoFaceSession> {
    if (this.env.TENCENT_FACE_MODE !== "VIDEO_ACTION" || !this.videoProvider.isConfigured())
      throw new BadRequestException({ message: "FACE_VIDEO_PROVIDER_NOT_CONFIGURED" });
    const { id, expiresAt } = await this.reserveSession(context, "VIDEO_ACTION");
    try {
      const sequence = await this.videoProvider.getActionSequence(id);
      await this.prisma.faceVerificationSession.update({
        where: { id }, data: { actionSequence: sequence, status: "PENDING" },
      });
      return { id, expiresAt: expiresAt.toISOString(), actionSequence: parseActionSequence(sequence) };
    } catch (error: unknown) {
      await this.prisma.faceVerificationSession.update({ where: { id }, data: { status: "FAILED", failureCode: "FACE_ACTION_CREATION_FAILED" } });
      throw error;
    }
  }

  async videoResult(context: FaceSessionContext, sessionId: string): Promise<CompletedFaceSession> {
    const session = await this.sessionForContext(context, sessionId);
    if (session.provider !== "VIDEO_ACTION") throw new ConflictException({ message: "FACE_SESSION_PROVIDER_MISMATCH" });
    return { id: session.id, status: session.status, expiresAt: session.expiresAt.toISOString() };
  }

  async verifyVideoSession(context: FaceSessionContext, sessionId: string, file: UploadedMultipartFile | undefined): Promise<CompletedFaceSession> {
    const session = await this.sessionForContext(context, sessionId);
    if (session.provider !== "VIDEO_ACTION" || this.env.TENCENT_FACE_MODE !== "VIDEO_ACTION")
      throw new ConflictException({ message: "FACE_SESSION_PROVIDER_MISMATCH" });
    if (session.status === "VERIFIED" || session.status === "FAILED")
      return { id: session.id, status: session.status, expiresAt: session.expiresAt.toISOString() };
    const video: Buffer = requireFaceVideo(file);
    if (session.actionSequence === null) throw new ConflictException({ message: "FACE_SESSION_NOT_READY" });
    const hash: string = createHash("sha256").update(video).digest("hex");
    if (session.videoHash !== null && session.videoHash !== hash)
      throw new ConflictException({ message: "FACE_SESSION_VIDEO_CHANGED" });
    const claim = await this.prisma.faceVerificationSession.updateMany({
      where: { id: session.id, status: "PENDING", providerAttempts: { lt: 3 }, OR: [{ videoHash: null }, { videoHash: hash }] },
      data: { status: "VERIFYING", videoHash: hash, providerAttempts: { increment: 1 } },
    });
    if (claim.count !== 1) throw new ConflictException({ message: "FACE_SESSION_NOT_READY" });
    try {
      const profile = await this.prisma.faceProfile.findUniqueOrThrow({ where: { id: session.faceProfileId } });
      const baseline = await this.storage.get(profile.baselineObjectKey);
      const result = await this.videoProvider.verifyVideo(baseline, video, session.actionSequence, session.id);
      await this.saveResult(session, result);
      return this.videoResult(context, session.id);
    } catch (error: unknown) {
      await this.prisma.faceVerificationSession.updateMany({
        where: { id: session.id, status: "VERIFYING" }, data: { status: "FAILED", failureCode: "FACE_VIDEO_PROVIDER_ERROR" },
      });
      throw error;
    }
  }

  async completeSession(
    context: FaceSessionContext,
    sessionId: string,
  ): Promise<{
    readonly id: string;
    readonly status: string;
    readonly expiresAt: string;
  }> {
    const session = await this.sessionForContext(context, sessionId);
    if (session.provider !== "WECHAT_NATIVE") throw new ConflictException({ message: "FACE_SESSION_PROVIDER_MISMATCH" });
    if (session.status === "VERIFIED" || session.status === "FAILED")
      return {
        id: session.id,
        status: session.status,
        expiresAt: session.expiresAt.toISOString(),
      };
    if (session.status !== "PENDING")
      throw new ConflictException({ message: "FACE_SESSION_ALREADY_USED" });
    if (session.bizToken === null)
      throw new ConflictException({ message: "FACE_SESSION_NOT_READY" });
    const claim = await this.prisma.faceVerificationSession.updateMany({
      where: { id: session.id, status: "PENDING" },
      data: { status: "VERIFYING" },
    });
    if (claim.count !== 1)
      throw new ConflictException({ message: "FACE_SESSION_NOT_READY" });
    try {
      const result = await this.provider.getResult(
        session.bizToken,
        session.id,
      );
      await this.saveResult(session, result);
      const completed = await this.sessionForContext(context, session.id);
      return {
        id: completed.id,
        status: completed.status,
        expiresAt: completed.expiresAt.toISOString(),
      };
    } catch (error: unknown) {
      await this.prisma.faceVerificationSession.updateMany({
        where: { id: session.id, status: "VERIFYING" },
        data: { status: "PENDING" },
      });
      throw error;
    }
  }

  async requireProof(
    context: FaceSessionContext,
    sessionId: string | undefined,
  ): Promise<FaceVerificationSession> {
    if (sessionId === undefined)
      throw new BadRequestException({
        message: "FACE_VERIFIED_SESSION_REQUIRED",
      });
    const session = await this.sessionForContext(context, sessionId);
    if (
      session.status !== "VERIFIED" ||
      session.score === null ||
      session.selfieObjectKey === null ||
      session.selfieHash === null
    )
      throw new BadRequestException({
        message: "FACE_VERIFIED_SESSION_REQUIRED",
      });
    return session;
  }

  async consumeProof(
    tx: Prisma.TransactionClient,
    session: FaceVerificationSession,
  ): Promise<void> {
    await lockOwner(tx, {
      ownerType: session.participantType,
      ownerId: session.participantId,
    });
    const result = await tx.faceVerificationSession.updateMany({
      where: {
        id: session.id,
        status: "VERIFIED",
        expiresAt: { gt: new Date() },
        faceProfile: {
          status: "APPROVED",
          version: session.faceProfileVersion,
        },
      },
      data: { status: "CONSUMED", consumedAt: new Date() },
    });
    if (result.count !== 1)
      throw new ConflictException({ message: "FACE_SESSION_ALREADY_USED" });
  }

  private async reserveSession(context: FaceSessionContext, provider: "WECHAT_NATIVE" | "VIDEO_ACTION"): Promise<{ readonly id: string; readonly expiresAt: Date; readonly profile: FaceProfile }> {
    if (this.env.FACE_DEV_STUB) throw new BadRequestException({ message: "FACE_PROVIDER_DISABLED_IN_DEVELOPMENT_MODE" });
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60_000);
    const profile = await this.prisma.$transaction(async (tx) => {
      await lockOwner(tx, context.owner);
      const approved = await tx.faceProfile.findFirst({
        where: { ...context.owner, status: "APPROVED" },
        orderBy: { version: "desc" },
      });
      if (approved === null)
        throw new BadRequestException({
          message: "FACE_APPROVED_PROFILE_REQUIRED",
        });
      const count = await tx.faceVerificationSession.count({
        where: {
          userId: context.userId,
          createdAt: { gte: new Date(Date.now() - 60_000) },
        },
      });
      if (count >= 3)
        throw new ConflictException({
          message: "FACE_VERIFICATION_TOO_FREQUENT",
        });
      await tx.faceVerificationSession.create({
        data: {
          id,
          userId: context.userId,
          projectId: context.projectId,
          participantType: context.owner.ownerType,
          participantId: context.owner.ownerId,
          pointCode: context.pointCode,
          attendanceDate: new Date(`${context.attendanceDate}T00:00:00Z`),
          faceProfileId: approved.id,
          faceProfileVersion: approved.version,
          status: "CREATING",
          provider,
          expiresAt,
        },
      });
      return approved;
    });
    return { id, expiresAt, profile };
  }

  private async saveResult(session: FaceVerificationSession, result: NativeFaceResult): Promise<void> {
    const passed =
      result.passed && result.score >= this.env.FACE_SCORE_THRESHOLD;
    if (passed && result.image === null)
      throw new ConflictException({
        message: "FACE_PROVIDER_PHOTO_REQUIRED",
      });
    const verifiedContentType =
      passed && result.image !== null ? imageType(result.image) : null;
    const objectKey = passed
      ? `face-verifications/${session.id}.${verifiedContentType === "image/png" ? "png" : "jpg"}`
      : null;
    let hash: string | null = null;
    if (objectKey !== null && result.image !== null) {
      const contentType = imageType(result.image);
      hash = createHash("sha256").update(result.image).digest("hex");
      await this.storage.put(objectKey, result.image, contentType);
    }
    const status = passed ? "VERIFIED" : "FAILED";
    await this.prisma.faceVerificationSession.updateMany({
      where: {
        id: session.id,
        status: "VERIFYING",
        expiresAt: { gt: new Date() },
        faceProfile: { status: "APPROVED" },
      },
      data: {
        status,
        score: result.score,
        selfieObjectKey: objectKey,
        selfieHash: hash,
        verifiedAt: new Date(),
        providerRequestId: result.requestId,
        failureCode:
          result.failureCode ??
          (passed ? null : "FACE_SCORE_BELOW_THRESHOLD"),
      },
    });
  }

  private async sessionForContext(
    context: FaceSessionContext,
    sessionId: string,
  ): Promise<FaceVerificationSession> {
    const session = await this.prisma.faceVerificationSession.findFirst({
      where: {
        id: sessionId,
        userId: context.userId,
        projectId: context.projectId,
        participantType: context.owner.ownerType,
        participantId: context.owner.ownerId,
        pointCode: context.pointCode,
        attendanceDate: new Date(`${context.attendanceDate}T00:00:00Z`),
        faceProfile: { status: "APPROVED" },
      },
    });
    if (session === null)
      throw new NotFoundException({ message: "FACE_SESSION_NOT_FOUND" });
    if (session.expiresAt.getTime() <= Date.now())
      throw new ConflictException({ message: "FACE_SESSION_EXPIRED" });
    return session;
  }

  private async ownerForUser(userId: string): Promise<FaceOwner> {
    const [worker, manager] = await Promise.all([
      this.prisma.workerProfile.findUnique({ where: { userId } }),
      this.prisma.managerProfile.findUnique({ where: { userId } }),
    ]);
    if ((worker === null) === (manager === null))
      throw new BadRequestException({ message: "FACE_BOUND_PROFILE_REQUIRED" });
    return worker !== null
      ? { ownerType: "WORKER", ownerId: worker.id }
      : { ownerType: "MANAGER", ownerId: manager!.id };
  }

  private async ownersForProject(projectId: string): Promise<FaceOwner[]> {
    const [workers, managers] = await Promise.all([
      this.prisma.projectWorkerMember.findMany({
        where: { projectId, status: "ACTIVE" },
        select: { workerId: true },
      }),
      this.prisma.projectManagerMember.findMany({
        where: { projectId, status: "ACTIVE" },
        select: { managerId: true },
      }),
    ]);
    return [
      ...workers.map(
        (row): FaceOwner => ({ ownerType: "WORKER", ownerId: row.workerId }),
      ),
      ...managers.map(
        (row): FaceOwner => ({ ownerType: "MANAGER", ownerId: row.managerId }),
      ),
    ];
  }

  private async profileForProject(
    projectId: string,
    profileId: string,
  ): Promise<FaceProfile> {
    const owners = await this.ownersForProject(projectId);
    const profile = await this.prisma.faceProfile.findFirst({
      where: { id: profileId, OR: owners },
    });
    if (profile === null)
      throw new NotFoundException({ message: "FACE_PROFILE_NOT_FOUND" });
    return profile;
  }
}
