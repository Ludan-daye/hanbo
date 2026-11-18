import { describe, expect, it } from "vitest";

import {
  distanceText,
  dotPosition,
  punchScreen,
  screenStep,
} from "../src/pages/punch/punch-stage";
import {
  workerPunchStep,
  type WorkerPunchStepInput,
} from "../src/pages/punch/worker-view";

const idle: WorkerPunchStepInput = {
  phase: "IDLE",
  inside: false,
  hasPhoto: false,
  faceReady: true,
  safetyReady: false,
  validProof: false,
  locationDenied: false,
  cameraDenied: false,
};
const outer = {
  failed: false,
  loaded: true,
  stale: false,
  hasResult: false,
  blocked: false,
  showPoints: false,
  photoReviewed: false,
};
const screen = (
  step: Partial<WorkerPunchStepInput>,
  more: Partial<typeof outer> = {},
): string => {
  const input = { ...idle, ...step };
  return punchScreen({
    ...outer,
    ...more,
    hasPhoto: input.hasPhoto,
    step: workerPunchStep(input),
  });
};

describe("punchScreen", () => {
  it("walks the four steps in order, one screen each", () => {
    expect(screen({})).toBe("locate");
    // 定位通过后停在第一步，由“下一步：拍现场照片”去拍照。
    expect(screen({ inside: true })).toBe("locate");
    expect(screen({ inside: true, phase: "PHOTO" })).toBe("locate");
    expect(screen({ inside: true, hasPhoto: true })).toBe("photo");
    expect(
      screen({ inside: true, hasPhoto: true }, { photoReviewed: true }),
    ).toBe("safety");
    expect(
      screen(
        { inside: true, hasPhoto: true, safetyReady: true },
        { photoReviewed: true },
      ),
    ).toBe("face");
  });

  it("stays on the photo screen while retaking, and shows a new photo before moving on", () => {
    expect(
      screen(
        { inside: true, hasPhoto: true, phase: "PHOTO" },
        { photoReviewed: true },
      ),
    ).toBe("photo");
    expect(screen({ inside: true, hasPhoto: true, safetyReady: true })).toBe(
      "photo",
    );
  });

  // 后面的核对发现人已经出了范围：回到定位，照片和交底都留着。
  it("returns to locate when a later check finds the worker outside", () => {
    expect(
      screen(
        { inside: false, hasPhoto: true, safetyReady: true },
        { photoReviewed: true },
      ),
    ).toBe("locate");
  });

  it("keeps the face screen while preparing and verifying", () => {
    expect(
      screen({ phase: "PREPARING", hasPhoto: true }, { photoReviewed: true }),
    ).toBe("face");
    expect(
      screen({ phase: "VERIFYING", hasPhoto: true }, { photoReviewed: true }),
    ).toBe("face");
  });

  it("shows saving for a submit in flight and for a proof that is still valid", () => {
    expect(screen({ phase: "SUBMITTING" })).toBe("saving");
    expect(screen({ validProof: true })).toBe("saving");
  });

  it("never lets a worker without an approved face walk the steps", () => {
    expect(
      screen(
        { inside: true, hasPhoto: true, faceReady: false },
        { photoReviewed: true },
      ),
    ).toBe("blocked");
  });

  it("orders the outer states: unavailable, loading, stale, result, blocked, points", () => {
    expect(screen({}, { failed: true, loaded: false })).toBe("unavailable");
    expect(screen({}, { loaded: false })).toBe("loading");
    expect(screen({}, { stale: true, hasResult: true })).toBe("stale");
    expect(screen({}, { hasResult: true, blocked: true })).toBe("result");
    expect(screen({}, { blocked: true, showPoints: true })).toBe("blocked");
    expect(screen({ inside: true }, { showPoints: true })).toBe("points");
  });
});

describe("screenStep", () => {
  it("numbers the steps", () => {
    expect(screenStep("locate")).toEqual({ current: 1, label: "定位" });
    expect(screenStep("photo")).toEqual({ current: 2, label: "现场照片" });
    expect(screenStep("safety")).toEqual({ current: 3, label: "安全交底" });
    expect(screenStep("face")).toEqual({ current: 4, label: "人脸核验" });
    expect(screenStep("saving")).toEqual({ current: 4, label: "人脸核验" });
    expect(screenStep("result")).toBeNull();
    expect(screenStep("points")).toBeNull();
  });
});

describe("distanceText", () => {
  it("says metres up close and kilometres far away", () => {
    expect(distanceText(0)).toBe("0 米");
    expect(distanceText(31.6)).toBe("32 米");
    expect(distanceText(999.4)).toBe("999 米");
    expect(distanceText(1000)).toBe("1.0 公里");
    expect(distanceText(111195)).toBe("111.2 公里");
  });
});

describe("dotPosition", () => {
  const center = { centerLatitude: "31.0", centerLongitude: "121.0", radiusM: 300 };

  it("puts the worker at the centre when standing on it", () => {
    expect(
      dotPosition(center, { latitude: "31.0", longitude: "121.0" }, 0),
    ).toEqual({ x: 0, y: 0 });
  });

  it("keeps direction (north is up) and scales distance by the allowed radius", () => {
    const north = dotPosition(center, { latitude: "31.001", longitude: "121.0" }, 150);
    expect(north.x).toBeCloseTo(0, 5);
    expect(north.y).toBeCloseTo(-0.5, 5);
    const east = dotPosition(center, { latitude: "31.0", longitude: "121.001" }, 300);
    expect(east.x).toBeCloseTo(1, 5);
    expect(east.y).toBeCloseTo(0, 5);
  });

  // 离得再远，圆点也画在图里面，不跑出边界。
  it("clamps a far-away worker to the edge of the picture", () => {
    const far = dotPosition(center, { latitude: "31.0", longitude: "122.0" }, 90_000);
    expect(far.x).toBeCloseTo(1.2, 5);
    expect(far.y).toBeCloseTo(0, 5);
  });

  it("falls back to the centre for unusable coordinates", () => {
    expect(dotPosition(center, { latitude: "", longitude: "x" }, 50)).toEqual({
      x: 0,
      y: 0,
    });
  });
});
