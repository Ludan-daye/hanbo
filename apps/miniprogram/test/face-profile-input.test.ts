import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const device = vi.hoisted(() => ({ chooseMedia: vi.fn(), chooseImage: vi.fn() }));
vi.mock("@tarojs/taro", () => ({ default: device }));
import {
  chooseFaceEnrollmentPhoto,
  replacementNeedsConfirmation,
} from "../src/pages/face-profile/face-profile-input";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("TARO_ENV", "weapp");
});
afterEach(() => vi.unstubAllEnvs());

describe("face enrollment camera", () => {
  test("WeChat captures one fresh image with chooseMedia", async () => {
    device.chooseMedia.mockResolvedValue({
      tempFiles: [{ tempFilePath: "wxfile://face.jpg", size: 1024 }],
    });
    await expect(chooseFaceEnrollmentPhoto()).resolves.toBe("wxfile://face.jpg");
    expect(device.chooseMedia).toHaveBeenCalledWith({
      count: 1, mediaType: ["image"], sizeType: ["compressed"], sourceType: ["camera"],
    });
    expect(device.chooseImage).not.toHaveBeenCalled();
  });
  test("keeps the stricter 2MB enrollment limit", async () => {
    device.chooseMedia.mockResolvedValue({
      tempFiles: [{ tempFilePath: "wxfile://large.jpg", size: 2 * 1024 * 1024 + 1 }],
    });
    await expect(chooseFaceEnrollmentPhoto()).rejects.toThrow("2MB");
  });
  test("empty results do not create a preview", async () => {
    device.chooseMedia.mockResolvedValue({ tempFiles: [] });
    await expect(chooseFaceEnrollmentPhoto()).rejects.toThrow("重新拍摄");
  });
  test("cancellation propagates so the current usable preview can remain", async () => {
    const cancelled = { errMsg: "chooseMedia:fail cancel" };
    device.chooseMedia.mockRejectedValue(cancelled);
    await expect(chooseFaceEnrollmentPhoto()).rejects.toBe(cancelled);
  });
  test("H5 preserves album and camera selection", async () => {
    vi.stubEnv("TARO_ENV", "h5");
    device.chooseImage.mockResolvedValue({
      tempFilePaths: ["blob:face"], tempFiles: [{ size: 1024 }],
    });
    await expect(chooseFaceEnrollmentPhoto()).resolves.toBe("blob:face");
    expect(device.chooseImage).toHaveBeenCalledWith({
      count: 1, sizeType: ["compressed"], sourceType: ["album", "camera"],
    });
    expect(device.chooseMedia).not.toHaveBeenCalled();
  });
});

describe("approved face replacement confirmation", () => {
  test("only approved replacement needs final submission confirmation", () => {
    expect(replacementNeedsConfirmation("APPROVED", "new-photo", null)).toBe(true);
    for (const status of [undefined, "PENDING", "REJECTED", "REPLACED"])
      expect(replacementNeedsConfirmation(status, "new-photo", null)).toBe(false);
  });
  test("retrying the same confirmed preview does not ask twice", () => {
    expect(replacementNeedsConfirmation("APPROVED", "same-photo", "same-photo")).toBe(false);
    expect(replacementNeedsConfirmation("APPROVED", "new-photo", "same-photo")).toBe(true);
  });
});
