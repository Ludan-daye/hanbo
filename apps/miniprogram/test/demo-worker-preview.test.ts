import Taro from "@tarojs/taro";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { workerRegistrationError } from "@construction/domain";
import type { AccountProfile } from "../src/services/account";
import type { LoginResponse, MeResponse } from "../src/services/auth.types";
import type { MyFace } from "../src/services/face";
import { initialSessionState, sessionPhase } from "../src/store/sessionReducer";

const mode = vi.hoisted(() => ({ demo: true }));
vi.mock("../src/config/env", () => ({ get FRONTEND_DEMO() { return mode.demo; } }));
import { createDemoClient, prepareDemoWorkerPreview, readDemoState, resetDemoState } from "../src/services/demo/client";

const client = createDemoClient();
const sessionFor = async (code: string) => {
  const tokens = await client.request<LoginResponse>("/auth/wechat/login", { method: "POST", data: { code } });
  Taro.setStorageSync("demoAccessToken", tokens.accessToken);
  const me = await client.request<MeResponse>("/auth/me", { method: "GET" });
  const accountProfile = await client.request<AccountProfile>("/account/profile", { method: "GET" });
  const face = await client.request<MyFace>("/face-profiles/me", { method: "GET" });
  return { ...initialSessionState, accessToken: tokens.accessToken, me, accountProfile, faceEnrollmentRequired: face.profile === null };
};

beforeEach(() => { mode.demo = true; resetDemoState(); Taro.removeStorageSync("demoAccessToken"); });

describe("worker UI preview shortcut", () => {
  test("a fresh worker reaches ready through the unchanged session guard with valid fictional registration", async () => {
    prepareDemoWorkerPreview();
    const session = await sessionFor("dev-worker");
    expect(sessionPhase(session)).toBe("ready");
    expect(session.me.roles.highestRoleCode).toBe("WORKER");
    expect(workerRegistrationError(readDemoState().workerRegistrations!["profile-worker"])).toBeNull();
    expect(session.accountProfile.avatarDataUrl).toBeTruthy();
    await expect(client.request("/management/projects/demo-project", { method: "PUT", data: {} })).rejects.toThrow("权限");
  });

  test("the full first-time identity still requires profile, binding and registration after shortcut use", async () => {
    prepareDemoWorkerPreview();
    const session = await sessionFor("dev-unbound");
    expect(sessionPhase(session)).toBe("profile-required");
    expect(session.me.user.isBound).toBe(false);
    expect(readDemoState().workerRegistrations?.["profile-unbound"]).toBeUndefined();
    expect(readDemoState().invitations[0].status).toBe("PENDING");
  });

  test("repeat entry preserves existing worker edits, face review status and other local data", () => {
    prepareDemoWorkerPreview();
    const state = readDemoState();
    const saved = { ...state, boundProfileId: "profile-unbound", accountProfiles: {
      ...state.accountProfiles,
      "dev-worker": { ...state.accountProfiles!["dev-worker"], nickname: "已改的昵称" },
      "dev-unbound": { ...state.accountProfiles!["dev-worker"], realName: "待入场成员", phone: "13800000006" },
    }, faces: state.faces.map(face => ({ ...face, status: "REJECTED" as const, reviewReason: "保留审核结果" })) };
    Taro.setStorageSync("hanbo.frontend-demo.v1", saved);
    prepareDemoWorkerPreview();
    expect(readDemoState()).toEqual(saved);
  });

  test("does not reuse another worker's existing test ID number", () => {
    prepareDemoWorkerPreview();
    const state = readDemoState();
    const prior = state.workerRegistrations!["profile-worker"];
    Taro.setStorageSync("hanbo.frontend-demo.v1", { ...state, workerRegistrations: { "profile-unbound": prior } });
    prepareDemoWorkerPreview();
    const registrations = readDemoState().workerRegistrations!;
    expect(registrations["profile-worker"].idNumber).not.toBe(prior.idNumber);
    expect(workerRegistrationError(registrations["profile-worker"])).toBeNull();
    expect(registrations["profile-unbound"]).toEqual(prior);
  });

  test("real mode rejects the shortcut before changing any local data or login", () => {
    const state = readDemoState();
    Taro.setStorageSync("hanbo.frontend-demo.v1", state);
    Taro.setStorageSync("accessToken", "existing-real-session");
    mode.demo = false;
    expect(() => prepareDemoWorkerPreview()).toThrow("仅适用于演示模式");
    expect(readDemoState()).toEqual(state);
    expect(Taro.getStorageSync("accessToken")).toBe("existing-real-session");
    expect(Taro.getStorageSync("demoAccessToken")).toBe("");
  });
});
