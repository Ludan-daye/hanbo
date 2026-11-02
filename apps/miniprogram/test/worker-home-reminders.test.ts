import { describe, expect, test } from "vitest";
import {
  workerCanUseDemoFace,
  workerHomeReminders,
  workerFaceBlocker,
} from "../src/services/worker-home-reminders";
import type { MyFace } from "../src/services/face";

const face = (
  status: string | null,
  mode: MyFace["mode"] = "VIDEO_ACTION",
): MyFace => ({
  mode,
  consentText: "",
  consentVersion: "v1",
  profile:
    status === null
      ? null
      : {
          id: "face",
          ownerType: "WORKER",
          ownerId: "worker",
          status,
          version: 1,
          reviewReason: "照片模糊",
          createdAt: "",
          reviewedAt: null,
        },
});
describe("worker home actionable reminders", () => {
  test("allows demo verification only for the local demo development mode", () => {
    expect(workerCanUseDemoFace(face("PENDING", "DEVELOPMENT"), true)).toBe(
      true,
    );
    expect(workerCanUseDemoFace(face(null, "DEVELOPMENT"), true)).toBe(true);
    expect(workerCanUseDemoFace(face("APPROVED", "DEVELOPMENT"), false)).toBe(
      false,
    );
    expect(workerCanUseDemoFace(face("PENDING", "VIDEO_ACTION"), true)).toBe(
      false,
    );
    expect(workerCanUseDemoFace(face("PENDING", "WECHAT_NATIVE"), true)).toBe(
      false,
    );
    expect(workerCanUseDemoFace(face("APPROVED", "UNCONFIGURED"), true)).toBe(
      false,
    );
    expect(workerCanUseDemoFace(null, true)).toBe(false);
  });
  test.each([
    ["VIDEO_ACTION", false, false],
    ["WECHAT_NATIVE", false, false],
    ["DEVELOPMENT", false, true],
    ["DEVELOPMENT", true, false],
    ["UNCONFIGURED", false, true],
    ["UNCONFIGURED", true, true],
  ] as const)(
    "checks approved face mode %s with demo=%s before allowing punch",
    (mode, isDemo, blocked) => {
      expect(workerFaceBlocker(face("APPROVED", mode), isDemo) !== null).toBe(
        blocked,
      );
    },
  );
  test("keeps pending formal enrollment blocked", () => {
    expect(workerFaceBlocker(face("PENDING"), false)?.url).toBe(
      "/pages/face-profile/index",
    );
  });
  test("retains rejection feedback when the verification service is unavailable", () => {
    expect(
      workerFaceBlocker(face("REJECTED", "UNCONFIGURED"))?.description,
    ).toContain("照片模糊");
  });
  test("retains enrollment reminders for demo pending profiles", () => {
    expect(
      workerHomeReminders(null, face("PENDING", "DEVELOPMENT"), null, true),
    ).toEqual([
      expect.objectContaining({
        id: "face",
        title: "底照正在审核",
        url: "/pages/face-profile/index",
      }),
    ]);
  });
  test("passes demo mode to approved enrollment reminders", () => {
    expect(
      workerHomeReminders(null, face("APPROVED", "DEVELOPMENT"), null),
    ).toHaveLength(1);
    expect(
      workerHomeReminders(null, face("APPROVED", "DEVELOPMENT"), null, true),
    ).toEqual([]);
  });
  test("does not mislabel unknown face state as not enrolled", () => {
    expect(workerFaceBlocker(null)).toBeNull();
    expect(workerFaceBlocker(face("APPROVED"))).toBeNull();
    expect(workerFaceBlocker(face("PENDING"))?.title).toBe("底照正在审核");
    expect(workerFaceBlocker(face("APPROVED", "UNCONFIGURED"))?.title).toBe(
      "刷脸核验暂不可用",
    );
    expect(workerFaceBlocker(face("NEW_STATUS"))?.title).toBe("请确认底照状态");
  });
  test("orders blocking face then missing punches and rejected applications before waiting", () => {
    const reminders = workerHomeReminders(null, face("PENDING"), {
      attendedDays: 1,
      workedMinutes: 60,
      missingDays: 2,
      rejectedMakeups: 1,
      pendingMakeups: 3,
    });
    expect(reminders.map((item) => item.id)).toEqual([
      "face",
      "missing",
      "rejected",
      "pending",
    ]);
    expect(reminders[1].title).toContain("2 项");
    expect(reminders[1].url).toBe("/pages/my-records/index?range=MONTH");
  });
  test("does not fabricate empty reminders when data is still unknown", () => {
    expect(workerHomeReminders(null, null, null)).toEqual([]);
  });
});
