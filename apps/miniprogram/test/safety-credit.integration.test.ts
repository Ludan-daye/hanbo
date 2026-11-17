import Taro from "@tarojs/taro";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type {
  MySafetyCredit,
  SafetyCreditBoard,
  SafetyViolationView,
} from "@construction/domain";
import {
  createDemoClient,
  demoUploadImage,
  resetDemoState,
} from "../src/services/demo/client";
import type { LoginResponse } from "../src/services/auth.types";

const client = createDemoClient();
const login = async (code: string): Promise<void> => {
  const tokens = await client.request<LoginResponse>("/auth/wechat/login", {
    method: "POST",
    data: { code },
    auth: false,
  });
  Taro.setStorageSync("demoAccessToken", tokens.accessToken);
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-17T04:00:00Z"));
  resetDemoState();
  Taro.removeStorageSync("demoAccessToken");
});
afterEach(() => vi.useRealTimers());

describe("safety credit persistent demo flow", () => {
  test("leader records, project reviews, worker appeals, revocation restores credit and reset clears it", async () => {
    await login("dev-team");
    const photo = demoUploadImage("test/local-photo.png");
    const input = {
      memberId: "member-worker",
      category: "未戴安全帽",
      severity: "GENERAL",
      occurredAt: "2026-11-17T03:00:00Z",
      description: "测试违规记录",
      evidence: [{ objectKey: photo.objectKey, hash: photo.hash }],
    };
    const row = await client.request<SafetyViolationView>(
      "/safety-credit/teams/demo-team/violations",
      { method: "POST", data: input },
    );
    expect(row.status).toBe("PENDING");
    await expect(
      client.request("/safety-credit/teams/demo-team/violations", {
        method: "POST",
        data: input,
      }),
    ).rejects.toThrow("已登记");
    await expect(
      client.request("/safety-credit/teams/demo-team/violations", {
        method: "POST",
        data: { ...input, memberId: "member-worker-2" },
      }),
    ).rejects.toThrow("本班");
    await login("dev-worker");
    const pending = await client.request<MySafetyCredit>("/safety-credit/me", {
      method: "GET",
    });
    expect(pending.summary.score).toBe(100);
    await login("dev-project");
    await client.request(
      `/safety-credit/projects/demo-project/violations/${row.id}/review`,
      { method: "POST", data: { action: "CONFIRM", reason: "证据确认" } },
    );
    const board = await client.request<SafetyCreditBoard>(
      "/safety-credit/projects/demo-project",
      { method: "GET" },
    );
    expect(
      board.workers.find((person) => person.workerId === "profile-worker")
        ?.score,
    ).toBe(95);
    await login("dev-worker");
    await client.request(`/safety-credit/me/violations/${row.id}/appeals`, {
      method: "POST",
      data: { reason: "申请复核" },
    });
    const appealed = await client.request<MySafetyCredit>("/safety-credit/me", {
      method: "GET",
    });
    expect(appealed.summary.score).toBe(95);
    const appealId = appealed.violations[0]!.appeals[0]!.id;
    await login("dev-project");
    vi.setSystemTime(new Date("2026-11-17T04:01:00Z"));
    await client.request(
      `/safety-credit/projects/demo-project/violations/${row.id}/appeals/${appealId}/review`,
      { method: "POST", data: { accept: true, reason: "核实后撤销" } },
    );
    await login("dev-worker");
    const revoked = await client.request<MySafetyCredit>("/safety-credit/me", {
      method: "GET",
    });
    expect(revoked.summary).toMatchObject({
      score: 100,
      confirmedViolationCount: 0,
    });
    expect(revoked.violations[0]!.decisions).toHaveLength(2);
    resetDemoState();
    const reset = await client.request<MySafetyCredit>("/safety-credit/me", {
      method: "GET",
    });
    expect(reset.violations).toEqual([]);
  });
});
