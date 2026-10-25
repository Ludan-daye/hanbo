import { createHash, randomUUID } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { FaceLivenessTestSession } from "@prisma/client";

import { API_ENV } from "../config/env.module.js";
import type { ApiEnv } from "../config/env.js";
import { PrismaService } from "../infrastructure/database/prisma.service.js";
import {
  parseActionSequence,
  TencentVideoFaceConnector,
} from "../infrastructure/face/tencent-video-face.connector.js";
import {
  STORAGE_PORT,
  type ReadableStoragePort,
} from "../infrastructure/storage/storage.types.js";
import type { UploadedMultipartFile } from "../uploads/uploads.types.js";

import { FaceService } from "./face.service.js";
import type { IssuedVideoFaceSession } from "./face.types.js";
import { requireFaceVideo } from "./face-video-validation.js";

export type FaceLivenessTestResult = {
  readonly id: string;
  readonly purpose: "LIVENESS_TEST";
  readonly status: string;
  readonly score: number | null;
  readonly failureCode: string | null;
  readonly requestId: string | null;
  readonly expiresAt: string;
};

const resultResponse = (
  session: FaceLivenessTestSession,
): FaceLivenessTestResult => ({
  id: session.id,
  purpose: "LIVENESS_TEST",
  status: session.status,
  score: session.score === null ? null : Number(session.score),
  failureCode: session.failureCode,
  requestId: session.providerRequestId,
  expiresAt: session.expiresAt.toISOString(),
});

/** Self-tests use separate persistence and can never issue attendance proofs. */
@Injectable()
export class FaceLivenessTestService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(FaceService) private readonly faces: FaceService,
    @Inject(TencentVideoFaceConnector)
    private readonly provider: TencentVideoFaceConnector,
    @Inject(STORAGE_PORT) private readonly storage: ReadableStoragePort,
  ) {}

  async start(userId: string): Promise<IssuedVideoFaceSession> {
    if (
      this.env.FACE_DEV_STUB ||
      this.env.TENCENT_FACE_MODE !== "VIDEO_ACTION" ||
      !this.provider.isConfigured()
    )
      throw new BadRequestException({
        message: "FACE_VIDEO_PROVIDER_NOT_CONFIGURED",
      });
    const mine = await this.faces.getMine(userId);
    if (
      mine.profile === null ||
      !["PENDING", "APPROVED"].includes(mine.profile.status)
    )
      throw new BadRequestException({
        message: "FACE_TEST_REFERENCE_REQUIRED",
      });
    const profile = mine.profile;
    const id: string = randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60_000);
    await this.prisma.$transaction(async (tx): Promise<void> => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`face-test:${userId}`}, 0))`;
      const count: number = await tx.faceLivenessTestSession.count({
        where: { userId, createdAt: { gte: new Date(Date.now() - 60_000) } },
      });
      if (count >= 3)
        throw new ConflictException({
          message: "FACE_VERIFICATION_TOO_FREQUENT",
        });
      await tx.faceLivenessTestSession.create({
        data: {
          id,
          userId,
          faceProfileId: profile.id,
          faceProfileVersion: profile.version,
          status: "CREATING",
          expiresAt,
        },
      });
    });
    try {
      const sequence: string = await this.provider.getActionSequence(id);
      await this.prisma.faceLivenessTestSession.update({
        where: { id },
        data: { actionSequence: sequence, status: "PENDING" },
      });
      return {
        id,
        expiresAt: expiresAt.toISOString(),
        actionSequence: parseActionSequence(sequence),
      };
    } catch (error: unknown) {
      await this.prisma.faceLivenessTestSession.update({
        where: { id },
        data: { status: "FAILED", failureCode: "FACE_ACTION_CREATION_FAILED" },
      });
      throw error;
    }
  }

  async result(
    userId: string,
    sessionId: string,
  ): Promise<FaceLivenessTestResult> {
    return resultResponse(await this.sessionForUser(userId, sessionId));
  }

  async verify(
    userId: string,
    sessionId: string,
    file: UploadedMultipartFile | undefined,
  ): Promise<FaceLivenessTestResult> {
    const session = await this.sessionForUser(userId, sessionId);
    if (session.status === "VERIFIED" || session.status === "FAILED")
      return resultResponse(session);
    const video: Buffer = requireFaceVideo(file);
    if (session.actionSequence === null)
      throw new ConflictException({ message: "FACE_SESSION_NOT_READY" });
    const videoHash: string = createHash("sha256").update(video).digest("hex");
    const claim = await this.prisma.faceLivenessTestSession.updateMany({
      where: { id: sessionId, status: "PENDING" },
      data: { status: "VERIFYING", videoHash },
    });
    if (claim.count !== 1)
      throw new ConflictException({ message: "FACE_SESSION_NOT_READY" });
    try {
      const profile = await this.prisma.faceProfile.findUniqueOrThrow({
        where: { id: session.faceProfileId },
      });
      const baseline: Buffer = await this.storage.get(
        profile.baselineObjectKey,
      );
      const result = await this.provider.verifyVideo(
        baseline,
        video,
        session.actionSequence,
        sessionId,
      );
      const passed: boolean =
        result.passed && result.score >= this.env.FACE_SCORE_THRESHOLD;
      const saved = await this.prisma.faceLivenessTestSession.updateMany({
        where: {
          id: sessionId,
          status: "VERIFYING",
          expiresAt: { gt: new Date() },
          faceProfile: {
            version: session.faceProfileVersion,
            status: { in: ["PENDING", "APPROVED"] },
          },
        },
        data: {
          status: passed ? "VERIFIED" : "FAILED",
          score: result.passed ? result.score : null,
          providerRequestId: result.requestId,
          failureCode:
            result.failureCode ??
            (passed ? null : "FACE_SCORE_BELOW_THRESHOLD"),
          completedAt: new Date(),
        },
      });
      if (saved.count !== 1)
        throw new ConflictException({
          message: "FACE_TEST_REFERENCE_CHANGED_OR_EXPIRED",
        });
      return this.result(userId, sessionId);
    } catch (error: unknown) {
      await this.prisma.faceLivenessTestSession.updateMany({
        where: { id: sessionId, status: "VERIFYING" },
        data: {
          status: "FAILED",
          failureCode: "FACE_VIDEO_TEST_ERROR",
          completedAt: new Date(),
        },
      });
      throw error;
    }
  }

  private async sessionForUser(
    userId: string,
    sessionId: string,
  ): Promise<FaceLivenessTestSession> {
    const session = await this.prisma.faceLivenessTestSession.findFirst({
      where: { id: sessionId, userId },
      include: { faceProfile: true },
    });
    if (session === null)
      throw new NotFoundException({ message: "FACE_TEST_SESSION_NOT_FOUND" });
    if (session.expiresAt.getTime() <= Date.now())
      throw new GoneException({ message: "FACE_TEST_SESSION_EXPIRED" });
    if (
      session.faceProfile.version !== session.faceProfileVersion ||
      !["PENDING", "APPROVED"].includes(session.faceProfile.status)
    )
      throw new ConflictException({
        message: "FACE_TEST_REFERENCE_CHANGED_OR_EXPIRED",
      });
    return session;
  }
}
