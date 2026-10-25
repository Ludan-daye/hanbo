import { Logger, ServiceUnavailableException } from "@nestjs/common";
import { faceid } from "tencentcloud-sdk-nodejs-faceid";

import type { ApiEnv } from "../../config/env.js";

export type NativeFaceResult = {
  readonly passed: boolean;
  readonly score: number;
  readonly image: Buffer | null;
  readonly requestId: string;
  readonly failureCode: string | null;
};

type FaceClient = InstanceType<typeof faceid.v20180301.Client>;

export class TencentNativeFaceConnector {
  private readonly client: FaceClient | null;
  private readonly ruleId: string;
  private readonly logger = new Logger(TencentNativeFaceConnector.name);

  constructor(env: ApiEnv) {
    this.ruleId = env.TENCENT_FACE_RULE_ID;
    this.client =
      this.ruleId.length === 0
        ? null
        : new faceid.v20180301.Client({
            credential: {
              secretId: env.TENCENT_SECRET_ID,
              secretKey: env.TENCENT_SECRET_KEY,
            },
            region: "",
            profile: {
              httpProfile: {
                reqTimeout: 20,
                endpoint: "faceid.tencentcloudapi.com",
              },
            },
          });
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async createSession(baseline: Buffer, sessionId: string): Promise<string> {
    const client = this.requireClient();
    const response = await this.withRetries("DetectAuth", sessionId, () =>
      client.DetectAuth({
        RuleId: this.ruleId,
        ImageBase64: baseline.toString("base64"),
        Extra: sessionId,
      }),
    );
    if (
      typeof response.BizToken !== "string" ||
      response.BizToken.length === 0
    ) {
      throw new ServiceUnavailableException({
        message: "FACE_PROVIDER_INVALID_RESPONSE",
        requestId: response.RequestId,
      });
    }
    return response.BizToken;
  }

  async getResult(
    bizToken: string,
    sessionId: string,
  ): Promise<NativeFaceResult> {
    const client = this.requireClient();
    const response = await this.withRetries(
      "GetDetectInfoEnhanced",
      sessionId,
      () =>
        client.GetDetectInfoEnhanced({
          RuleId: this.ruleId,
          BizToken: bizToken,
          InfoType: "13",
        }),
    );
    const text = response.Text;
    if (text === undefined || text === null) {
      throw new ServiceUnavailableException({
        message: "FACE_PROVIDER_RESULT_NOT_READY",
        requestId: response.RequestId,
      });
    }
    if (text.Extra !== sessionId) {
      throw new ServiceUnavailableException({
        message: "FACE_PROVIDER_SESSION_MISMATCH",
        requestId: response.RequestId,
      });
    }
    if (text.CompareLibType !== "业务方自有库") {
      throw new ServiceUnavailableException({
        message: "FACE_RULE_MUST_USE_UPLOADED_PHOTO",
        requestId: response.RequestId,
      });
    }
    const score = Number(text.Sim);
    if (typeof response.RequestId !== "string")
      throw new ServiceUnavailableException({
        message: "FACE_PROVIDER_INVALID_RESPONSE",
      });
    const passed =
      text.ErrCode === 0 && text.LiveStatus === 0 && text.Comparestatus === 0;
    if (
      passed &&
      (text.Sim === null ||
        text.Sim === undefined ||
        text.Sim === "" ||
        !Number.isFinite(score) ||
        score < 0 ||
        score > 100)
    ) {
      throw new ServiceUnavailableException({
        message: "FACE_PROVIDER_SCORE_INVALID",
        requestId: response.RequestId,
      });
    }
    const image = response.BestFrame?.BestFrame;
    return {
      passed,
      score: passed ? score : 0,
      image:
        typeof image === "string" && image.length > 0
          ? Buffer.from(image, "base64")
          : null,
      requestId: response.RequestId,
      failureCode: passed
        ? null
        : `${text.ErrCode}:${text.LiveStatus}:${text.Comparestatus}`,
    };
  }

  private requireClient(): FaceClient {
    if (this.client === null) {
      throw new ServiceUnavailableException({
        message: "FACE_PROVIDER_NOT_CONFIGURED",
      });
    }
    return this.client;
  }

  private async withRetries<T>(
    action: string,
    sessionId: string,
    request: () => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await request();
      } catch (error: unknown) {
        const code =
          typeof error === "object" && error !== null && "code" in error
            ? String(error.code)
            : "UNKNOWN";
        const requestId =
          typeof error === "object" && error !== null && "requestId" in error
            ? String(error.requestId)
            : null;
        const fields = {
          action,
          attempt,
          code,
          requestId,
          sessionId,
          ruleId: this.ruleId,
        };
        const retryable =
          /^(InternalError|RequestLimitExceeded|ClientError|RequestError|ETIMEDOUT|ECONNRESET)/.test(
            code,
          );
        if (retryable && attempt < 3) {
          this.logger.warn({
            ...fields,
            message: "TENCENT_FACE_REQUEST_RETRY",
          });
          await new Promise<void>((resolve) =>
            setTimeout(resolve, 300 * attempt),
          );
          continue;
        }
        this.logger.error({
          ...fields,
          message: "TENCENT_FACE_REQUEST_FAILED",
        });
        throw new ServiceUnavailableException(
          { message: "FACE_PROVIDER_REQUEST_FAILED", ...fields },
          { cause: error },
        );
      }
    }
    throw new Error("TENCENT_FACE_RETRY_STATE_INVALID");
  }
}
