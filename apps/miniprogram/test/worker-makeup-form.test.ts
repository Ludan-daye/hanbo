import { describe, expect, it } from "vitest";
import {
  canSubmitWorkerMakeup,
  makeupPlanContext,
} from "../src/pages/submit-makeup/form-state";

const input = {
  projectId: "project-a",
  date: "2026-11-01",
  loadedContext: "project-a/2026-11-01",
  plan: { isWorkday: true, points: [{ code: "CUSTOM_START" }] },
  point: "CUSTOM_START",
  reason: "到场后手机无法完成拍照",
  busy: false,
  submitted: false,
};

describe("worker makeup form submission context", () => {
  it("accepts a dynamic point belonging to the currently loaded historical plan", () => {
    expect(makeupPlanContext(input.projectId, input.date)).toBe(
      input.loadedContext,
    );
    expect(canSubmitWorkerMakeup(input)).toBe(true);
  });
  it("blocks the previous project plan before the replacement request completes", () => {
    expect(canSubmitWorkerMakeup({ ...input, projectId: "project-b" })).toBe(
      false,
    );
  });
  it("blocks a previous date plan even when it uses the same point code", () => {
    expect(canSubmitWorkerMakeup({ ...input, date: "2026-10-31" })).toBe(false);
  });
  it("blocks a point removed by the refreshed plan", () => {
    expect(canSubmitWorkerMakeup({ ...input, point: "REMOVED" })).toBe(false);
  });
  it("requires a project, a loaded workday plan, and a nonblank reason", () => {
    expect(canSubmitWorkerMakeup({ ...input, projectId: null })).toBe(false);
    expect(canSubmitWorkerMakeup({ ...input, plan: null })).toBe(false);
    expect(
      canSubmitWorkerMakeup({
        ...input,
        plan: { ...input.plan, isWorkday: false },
      }),
    ).toBe(false);
    expect(canSubmitWorkerMakeup({ ...input, reason: "  " })).toBe(false);
  });
  it("prevents duplicate requests while saving or after server success even if navigation failed", () => {
    expect(canSubmitWorkerMakeup({ ...input, busy: true })).toBe(false);
    expect(canSubmitWorkerMakeup({ ...input, submitted: true })).toBe(false);
  });
});
