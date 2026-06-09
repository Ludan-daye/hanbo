import type {
  FaceVerificationConnector,
  FaceVerificationInput,
  FaceVerificationResult
} from "./face-verification.types.js";

export class FailClosedFaceVerificationConnector implements FaceVerificationConnector {
  async verifyFace(_input: FaceVerificationInput): Promise<FaceVerificationResult> {
    return { detected: false, score: 0 };
  }
}
