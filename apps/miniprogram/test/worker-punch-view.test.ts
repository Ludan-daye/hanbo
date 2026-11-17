import { describe, expect, test } from "vitest";
import {
  workerPunchFeedback,
  workerPunchStep,
  type WorkerPunchStepInput,
} from "../src/pages/punch/worker-view";

const ready: WorkerPunchStepInput = {
  phase: "IDLE",
  inside: true,
  hasPhoto: true,
  faceReady: true,
  safetyReady: true,
  validProof: false,
  locationDenied: false,
  cameraDenied: false,
};

describe("worker punch exposes one action for the existing workflow", () => {
  test("a photo and approved face cannot skip the outstanding safety acknowledgement", () => {
    expect(workerPunchStep({ ...ready, safetyReady: false })).toEqual({
      stage: "face",
      action: "confirm-safety",
    });
    expect(workerPunchStep({ ...ready, safetyReady: true })).toEqual({
      stage: "face",
      action: "verify",
    });
  });
  test("lost or expired safety acknowledgement returns the next action to safety", () => {
    expect(workerPunchStep({ ...ready, safetyReady: false }).action).not.toBe("verify");
  });
  test("safety guidance does not replace unfinished location, photo or face-profile steps", () => {
    expect(workerPunchStep({ ...ready, safetyReady: false, inside: false }).action).toBe("locate");
    expect(workerPunchStep({ ...ready, safetyReady: false, hasPhoto: false }).action).toBe("capture");
    expect(workerPunchStep({ ...ready, safetyReady: false, faceReady: false }).action).toBe("face-profile");
  });
  test("an already verified proof still offers saving, not a new safety or face step", () => {
    expect(workerPunchStep({ ...ready, safetyReady: false, validProof: true })).toEqual({
      stage: "saving",
      action: "retry-save",
    });
  });
  test("saving must wait rather than offer a second submission with the available proof", () => {
    expect(
      workerPunchStep({ ...ready, phase: "SUBMITTING", validProof: true }),
    ).toEqual({ stage: "saving", action: "wait" });
  });
  test("a valid proof retries saving without forcing another location or face step", () => {
    expect(
      workerPunchStep({ ...ready, inside: false, validProof: true }),
    ).toEqual({ stage: "saving", action: "retry-save" });
  });
  test("a valid proof with revoked location permission opens settings and remains reusable after permission returns", () => {
    const proofReady = {
      ...ready,
      inside: false,
      validProof: true,
      locationDenied: true,
    };
    expect(workerPunchStep(proofReady)).toEqual({
      stage: "saving",
      action: "location-settings",
    });
    expect(workerPunchStep({ ...proofReady, locationDenied: false })).toEqual({
      stage: "saving",
      action: "retry-save",
    });
  });
  test("a running save does not open settings before it finishes", () => {
    expect(
      workerPunchStep({
        ...ready,
        phase: "SUBMITTING",
        validProof: true,
        locationDenied: true,
      }),
    ).toEqual({ stage: "saving", action: "wait" });
  });
  test.each(["PREPARING", "VERIFYING"] as const)(
    "%s does not allow another face attempt",
    (phase) => {
      expect(workerPunchStep({ ...ready, phase })).toEqual({
        stage: "face",
        action: "wait",
      });
    },
  );
  test.each([
    ["LOCATING", "location"],
    ["PHOTO", "photo"],
  ] as const)("%s keeps its current operation locked", (phase, stage) => {
    expect(workerPunchStep({ ...ready, phase })).toEqual({
      stage,
      action: "wait",
    });
  });
  test("an ordinary location failure offers retry rather than settings", () => {
    expect(workerPunchStep({ ...ready, inside: false })).toEqual({
      stage: "location",
      action: "locate",
    });
  });
  test("only confirmed location permission denial offers location settings", () => {
    expect(
      workerPunchStep({ ...ready, inside: false, locationDenied: true }),
    ).toEqual({ stage: "location", action: "location-settings" });
  });
  test("photo capture stays behind the location check", () => {
    expect(
      workerPunchStep({
        ...ready,
        inside: false,
        hasPhoto: false,
        cameraDenied: true,
      }),
    ).toEqual({ stage: "location", action: "locate" });
  });
  test("photo capture is the action after location, unless camera permission was denied", () => {
    expect(workerPunchStep({ ...ready, hasPhoto: false })).toEqual({
      stage: "photo",
      action: "capture",
    });
    expect(
      workerPunchStep({ ...ready, hasPhoto: false, cameraDenied: true }),
    ).toEqual({ stage: "photo", action: "camera-settings" });
  });
  test("pending or rejected face profiles cannot start formal verification", () => {
    expect(workerPunchStep({ ...ready, faceReady: false })).toEqual({
      stage: "face",
      action: "face-profile",
    });
  });
  test("ready location, photo and approved face profile expose verification", () => {
    expect(workerPunchStep(ready)).toEqual({ stage: "face", action: "verify" });
  });
});

describe("worker punch schedule refresh feedback stays independent of the saved result", () => {
  test("an existing schedule keeps a refresh failure in a persistent notice rather than the active-step-only error", () => {
    expect(
      workerPunchFeedback({
        hasSchedule: true,
        scheduleError: "读取安排失败",
        error: "读取安排失败",
      }),
    ).toEqual({ refreshWarning: "读取安排失败", actionError: null });
  });
  test("a refresh warning does not swallow a separate save failure", () => {
    expect(
      workerPunchFeedback({
        hasSchedule: true,
        scheduleError: "读取安排失败",
        error: "打卡保存失败",
      }),
    ).toEqual({ refreshWarning: "读取安排失败", actionError: "打卡保存失败" });
  });
  test("an initial load failure stays in the existing full-page recovery path", () => {
    expect(
      workerPunchFeedback({
        hasSchedule: false,
        scheduleError: "读取安排失败",
        error: "读取安排失败",
      }),
    ).toEqual({ refreshWarning: null, actionError: "读取安排失败" });
  });
  test("ordinary operation errors are not relabelled as refresh failures", () => {
    expect(
      workerPunchFeedback({
        hasSchedule: true,
        scheduleError: null,
        error: "照片过大",
      }),
    ).toEqual({ refreshWarning: null, actionError: "照片过大" });
  });
  test("a successful refresh removes the warning", () => {
    expect(
      workerPunchFeedback({
        hasSchedule: true,
        scheduleError: null,
        error: null,
      }),
    ).toEqual({ refreshWarning: null, actionError: null });
  });
});
