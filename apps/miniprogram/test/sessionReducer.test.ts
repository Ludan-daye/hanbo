import { describe, expect, test } from "vitest";

import { initialSessionState, sessionPhase, sessionReducer } from "../src/store/sessionReducer";

const me = (over: Partial<{ isBound: boolean; highest: "WORKER" | null }> = {}) => ({
  user: { id: "u1", isBound: over.isBound ?? true, status: "ACTIVE" },
  profile: { type: "WORKER" as const, id: "w1" },
  roles: { assignments: [], highestRoleCode: over.highest !== undefined ? over.highest : "WORKER" }
});

describe("sessionReducer / sessionPhase", () => {
  test("starts anonymous with no token", () => {
    expect(sessionPhase(initialSessionState)).toBe("anonymous");
  });

  test("after tokens but before /me it is loading", () => {
    const s = sessionReducer(initialSessionState, { type: "SET_TOKENS", accessToken: "a", refreshToken: "r" });
    expect(sessionPhase(s)).toBe("loading");
  });

  test("bound user with a role is ready", () => {
    let s = sessionReducer(initialSessionState, { type: "SET_TOKENS", accessToken: "a", refreshToken: "r" });
    s = sessionReducer(s, { type: "SET_ME", me: me({ isBound: true, highest: "WORKER" }) });
    expect(sessionPhase(s)).toBe("ready");
  });

  test("bound user without a role is norole", () => {
    let s = sessionReducer(initialSessionState, { type: "SET_TOKENS", accessToken: "a", refreshToken: "r" });
    s = sessionReducer(s, { type: "SET_ME", me: me({ isBound: true, highest: null }) });
    expect(sessionPhase(s)).toBe("norole");
  });

  test("unbound user goes to bind", () => {
    let s = sessionReducer(initialSessionState, { type: "SET_TOKENS", accessToken: "a", refreshToken: "r" });
    s = sessionReducer(s, { type: "SET_ME", me: me({ isBound: false, highest: null }) });
    expect(sessionPhase(s)).toBe("unbound");
  });

  test("CLEAR returns to anonymous", () => {
    let s = sessionReducer(initialSessionState, { type: "SET_TOKENS", accessToken: "a", refreshToken: "r" });
    s = sessionReducer(s, { type: "CLEAR" });
    expect(sessionPhase(s)).toBe("anonymous");
  });
});
