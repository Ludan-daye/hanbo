import { BadRequestException, Logger, ServiceUnavailableException } from "@nestjs/common";
import { iai } from "tencentcloud-sdk-nodejs-iai";

import type { ApiEnv } from "../../config/env.js";
import { imageContentType } from "../../uploads/image-content-type.js";

type FaceClient = InstanceType<typeof iai.v20200303.Client>;
type ComparisonResponse = Awaited<ReturnType<FaceClient["CompareFace"]>>;
type ComparisonConfiguration = Pick<ApiEnv, "TENCENT_SECRET_ID" | "TENCENT_SECRET_KEY" | "TENCENT_FACE_REGION">;
export type FaceComparisonResult = {
  readonly score: number;
  readonly faceModelVersion: "3.0";
  readonly requestId: string;
};

const requireFaceImage = (image: Buffer, field: "reference" | "probe"): void => {
  if (image.length === 0 || image.length > 3 * 1024 * 1024 || imageContentType(image) === null)
    throw new BadRequestException({ message: "FACE_COMPARISON_IMAGE_INVALID", field, requirement: "Use a JPEG or PNG image smaller than 3 MiB" });
};

/** Compare two supplied photos without issuing an attendance or liveness proof. */
export class TencentFaceComparisonConnector {
  private readonly client: FaceClient;
  private readonly logger: Logger = new Logger(TencentFaceComparisonConnector.name);

  constructor(env: ComparisonConfiguration) {
    if (env.TENCENT_SECRET_ID.length === 0 || env.TENCENT_SECRET_KEY.length === 0)
      throw new ServiceUnavailableException({ message: "Configure Tencent API credentials in apps/api/.env before comparing photos" });
    if (env.TENCENT_FACE_REGION.length === 0)
      throw new ServiceUnavailableException({ message: "Set TENCENT_FACE_REGION in apps/api/.env, for example ap-guangzhou" });
    this.client = new iai.v20200303.Client({
      credential: { secretId: env.TENCENT_SECRET_ID, secretKey: env.TENCENT_SECRET_KEY },
      region: env.TENCENT_FACE_REGION,
      profile: { httpProfile: { endpoint: "iai.tencentcloudapi.com", reqTimeout: 20 } },
    });
  }

  async compare(reference: Buffer, probe: Buffer, operationId: string): Promise<FaceComparisonResult> {
    requireFaceImage(reference, "reference");
    requireFaceImage(probe, "probe");
    const result: ComparisonResponse = await this.requestComparison(reference, probe, operationId);
    if (typeof result.Score !== "number" || !Number.isFinite(result.Score) || result.Score < 0 || result.Score > 100
      || result.FaceModelVersion !== "3.0" || typeof result.RequestId !== "string" || result.RequestId.length === 0) {
      throw new ServiceUnavailableException({ message: "FACE_COMPARISON_RESPONSE_INVALID", action: "CompareFace", operationId, requestId: result.RequestId });
    }
    return { score: result.Score, faceModelVersion: "3.0", requestId: result.RequestId };
  }

  private async requestComparison(reference: Buffer, probe: Buffer, operationId: string): Promise<ComparisonResponse> {
    for (let attempt: number = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.client.CompareFace({
          ImageA: reference.toString("base64"),
          ImageB: probe.toString("base64"),
          FaceModelVersion: "3.0",
          QualityControl: 3,
          NeedRotateDetection: 1,
        });
      } catch (error: unknown) {
        const code: string = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "UNKNOWN";
        const requestId: string | null = typeof error === "object" && error !== null && "requestId" in error ? String(error.requestId) : null;
        const fields = { action: "CompareFace", operationId, attempt, code, requestId };
        if (/^(InternalError|RequestLimitExceeded|ClientError|RequestError|ETIMEDOUT|ECONNRESET)/.test(code) && attempt < 3) {
          this.logger.warn({ ...fields, message: "TENCENT_FACE_COMPARISON_RETRY" });
          await new Promise<void>((resolve) => setTimeout(resolve, 300 * attempt));
          continue;
        }
        this.logger.error({ ...fields, message: "TENCENT_FACE_COMPARISON_FAILED" });
        throw new ServiceUnavailableException({ ...fields, message: "FACE_COMPARISON_REQUEST_FAILED" }, { cause: error });
      }
    }
    throw new Error("TENCENT_FACE_COMPARISON_RETRY_STATE_INVALID");
  }
}
