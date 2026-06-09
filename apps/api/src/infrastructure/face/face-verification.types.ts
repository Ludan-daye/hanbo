export const FACE_VERIFICATION_CONNECTOR = Symbol("FACE_VERIFICATION_CONNECTOR");

export type FaceVerificationInput = {
  readonly selfieObjectKey: string;
  readonly baselineRef: string | null;
};

export type FaceVerificationResult = {
  readonly detected: boolean;
  readonly score: number;
};

export interface FaceVerificationConnector {
  verifyFace(input: FaceVerificationInput): Promise<FaceVerificationResult>;
}

export const deriveFacePassed = (result: FaceVerificationResult, threshold: number): boolean =>
  result.detected && result.score >= threshold;
