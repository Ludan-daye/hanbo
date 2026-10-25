import { Logger, ServiceUnavailableException } from "@nestjs/common";
import { faceid } from "tencentcloud-sdk-nodejs-faceid";

import type { ApiEnv } from "../../config/env.js";
import type { NativeFaceResult } from "./tencent-native-face.connector.js";

type FaceClient = InstanceType<typeof faceid.v20180301.Client>;

export const parseActionSequence = (sequence: string): readonly ("1" | "2")[] => {
  if (sequence !== "1,2" && sequence !== "2,1") {
    throw new ServiceUnavailableException({ message: "FACE_PROVIDER_ACTION_SEQUENCE_INVALID" });
  }
  return sequence === "1,2" ? ["1", "2"] : ["2", "1"];
};

/** Tencent's server-only video API; it never selects a weaker liveness mode. */
export class TencentVideoFaceConnector {
  private readonly client: FaceClient | null;
  private readonly logger: Logger = new Logger(TencentVideoFaceConnector.name);

  constructor(env: ApiEnv) {
    this.client = env.TENCENT_SECRET_ID.length === 0 || env.TENCENT_SECRET_KEY.length === 0
      ? null
      : new faceid.v20180301.Client({
          credential: { secretId: env.TENCENT_SECRET_ID, secretKey: env.TENCENT_SECRET_KEY },
          region: "",
          profile: { httpProfile: { reqTimeout: 30, endpoint: "faceid.tencentcloudapi.com" } },
        });
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async getActionSequence(sessionId: string): Promise<string> {
    const client = this.requireClient();
    const response = await this.request("GetActionSequence", sessionId, () => client.GetActionSequence({}));
    const sequence = response.ActionSequence;
    if (typeof sequence !== "string") {
      throw new ServiceUnavailableException({ message: "FACE_PROVIDER_ACTION_SEQUENCE_MISSING", requestId: response.RequestId });
    }
    parseActionSequence(sequence);
    return sequence;
  }

  async verifyVideo(baseline: Buffer, video: Buffer, sequence: string, sessionId: string): Promise<NativeFaceResult> {
    parseActionSequence(sequence);
    const client = this.requireClient();
    const response = await this.request("LivenessCompare", sessionId, () => client.LivenessCompare({
      LivenessType: "ACTION",
      ValidateData: sequence,
      ImageBase64: baseline.toString("base64"),
      VideoBase64: video.toString("base64"),
    }));
    if (typeof response.RequestId !== "string" || typeof response.Result !== "string") {
      throw new ServiceUnavailableException({ message: "FACE_PROVIDER_INVALID_RESPONSE", requestId: response.RequestId });
    }
    const passed: boolean = response.Result === "Success";
    const score: number = response.Sim ?? 0;
    if (passed && (response.Sim === undefined || !Number.isFinite(score) || score < 0 || score > 100)) {
      throw new ServiceUnavailableException({ message: "FACE_PROVIDER_SCORE_INVALID", requestId: response.RequestId });
    }
    return {
      passed,
      score: passed ? score : 0,
      image: typeof response.BestFrameBase64 === "string" && response.BestFrameBase64.length > 0
        ? Buffer.from(response.BestFrameBase64, "base64") : null,
      requestId: response.RequestId,
      failureCode: passed ? null : response.Result,
    };
  }

  private requireClient(): FaceClient {
    if (this.client === null) throw new ServiceUnavailableException({ message: "FACE_PROVIDER_NOT_CONFIGURED" });
    return this.client;
  }

  private async request<T>(action: string, sessionId: string, request: () => Promise<T>): Promise<T> {
    for (let attempt: number = 1; attempt <= 3; attempt += 1) {
      try {
        return await request();
      } catch (error: unknown) {
        const code: string = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "UNKNOWN";
        const requestId: string | null = typeof error === "object" && error !== null && "requestId" in error ? String(error.requestId) : null;
        const fields = { action, sessionId, attempt, code, requestId };
        if (/^(InternalError|RequestLimitExceeded|ClientError|RequestError|ETIMEDOUT|ECONNRESET)/.test(code) && attempt < 3) {
          this.logger.warn({ ...fields, message: "TENCENT_VIDEO_FACE_REQUEST_RETRY" });
          await new Promise<void>((resolve) => setTimeout(resolve, attempt * 300));
          continue;
        }
        this.logger.error({ ...fields, message: "TENCENT_VIDEO_FACE_REQUEST_FAILED" });
        throw new ServiceUnavailableException({ ...fields, message: "FACE_PROVIDER_REQUEST_FAILED" }, { cause: error });
      }
    }
    throw new Error("TENCENT_VIDEO_FACE_RETRY_STATE_INVALID");
  }
}
