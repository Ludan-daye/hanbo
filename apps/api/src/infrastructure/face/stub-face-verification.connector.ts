import type {
  FaceVerificationConnector,
  FaceVerificationInput,
  FaceVerificationResult
} from "./face-verification.types.js";

export class StubFaceVerificationConnector implements FaceVerificationConnector {
  private readonly score: number;

  constructor(score: number) {
    this.score = score;
  }

  async verifyFace(_input: FaceVerificationInput): Promise<FaceVerificationResult> {
    return { detected: true, score: this.score };
  }
}
