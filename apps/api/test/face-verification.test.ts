import { describe, expect, test } from "vitest";

import { deriveFacePassed } from "../src/infrastructure/face/face-verification.types.js";
import { StubFaceVerificationConnector } from "../src/infrastructure/face/stub-face-verification.connector.js";
import { FailClosedFaceVerificationConnector } from "../src/infrastructure/face/fail-closed-face-verification.connector.js";

describe("deriveFacePassed", () => {
  test("passes when detected and score >= threshold", () => {
    expect(deriveFacePassed({ detected: true, score: 90 }, 80)).toBe(true);
    expect(deriveFacePassed({ detected: true, score: 80 }, 80)).toBe(true);
  });
  test("fails when below threshold or not detected", () => {
    expect(deriveFacePassed({ detected: true, score: 79 }, 80)).toBe(false);
    expect(deriveFacePassed({ detected: false, score: 99 }, 80)).toBe(false);
  });
});

describe("StubFaceVerificationConnector", () => {
  test("returns the configured score and detected=true", async () => {
    const connector = new StubFaceVerificationConnector(88);
    const result = await connector.verifyFace({ selfieObjectKey: "k", baselineRef: null });
    expect(result).toEqual({ detected: true, score: 88 });
  });
});

describe("FailClosedFaceVerificationConnector", () => {
  test("never passes (detected=false, score=0)", async () => {
    const connector = new FailClosedFaceVerificationConnector();
    const result = await connector.verifyFace({ selfieObjectKey: "k", baselineRef: null });
    expect(result).toEqual({ detected: false, score: 0 });
  });
});
