import { describe, expect, it } from "vitest";

import {
  punchTestNext,
  punchTestPrimary,
  punchTestRows,
  type TestLocation,
} from "../src/pages/punch-test/test-view";

const inside: TestLocation = {
  isInside: true,
  accuracyPassed: true,
  distanceM: 41.6,
  radiusM: 300,
  accuracyLimitM: 50,
};
const base = {
  phase: "IDLE",
  next: "locate",
  location: null,
  uploadedBytes: null,
  faceResult: null,
  videoEnabled: true,
  profileStatus: "APPROVED",
} as const;

describe("打卡测试：下一步该做什么", () => {
  it("按定位、照片、底照、活体的先后往下走", () => {
    const step = {
      finished: false,
      inside: true,
      uploaded: true,
      faceReady: true,
    };
    expect(punchTestNext({ ...step, inside: false })).toBe("locate");
    expect(punchTestNext({ ...step, uploaded: false })).toBe("photo");
    expect(punchTestNext({ ...step, faceReady: false })).toBe("profile");
    expect(punchTestNext(step)).toBe("face");
    expect(punchTestNext({ ...step, finished: true })).toBe("done");
  });

  it("按钮写的就是下一步；正在做的时候写“…中”", () => {
    const idle = { phase: "IDLE", located: false, faceTried: false } as const;
    expect(punchTestPrimary({ ...idle, next: "locate" })).toBe("开始定位");
    expect(punchTestPrimary({ ...idle, next: "locate", located: true })).toBe(
      "重新定位",
    );
    expect(punchTestPrimary({ ...idle, next: "photo" })).toBe("拍照并上传");
    expect(punchTestPrimary({ ...idle, next: "profile" })).toBe("查看人脸档案");
    expect(punchTestPrimary({ ...idle, next: "face" })).toBe("开始活体核验");
    expect(punchTestPrimary({ ...idle, next: "face", faceTried: true })).toBe(
      "重新核验",
    );
    expect(punchTestPrimary({ ...idle, next: "done" })).toBe("返回");
    expect(
      punchTestPrimary({ ...idle, next: "locate", phase: "LOCATING" }),
    ).toBe("定位中…");
    expect(punchTestPrimary({ ...idle, next: "photo", phase: "PHOTO" })).toBe(
      "拍照上传中…",
    );
    expect(
      punchTestPrimary({ ...idle, next: "face", phase: "PREPARING" }),
    ).toBe("准备核验中…");
    expect(
      punchTestPrimary({
        ...idle,
        next: "face",
        phase: "PREPARING",
        faceTried: true,
      }),
    ).toBe("确认结果中…");
    expect(
      punchTestPrimary({ ...idle, next: "face", phase: "VERIFYING" }),
    ).toBe("核验中…");
  });
});

describe("打卡测试：三步的结果", () => {
  it("刚进来：第一步是该做的那一步，后两步还没到", () => {
    const rows = punchTestRows(base);
    expect(rows.map((row) => row.title)).toEqual([
      "1 定位",
      "2 现场照片",
      "3 活体核验",
    ]);
    expect(rows.map((row) => row.state)).toEqual(["now", "todo", "todo"]);
    expect(rows[0].status).toEqual({ kind: "warn", text: "待测试" });
    expect(rows[1].status).toEqual({ kind: "idle", text: "待测试" });
  });

  it("设计稿那一屏：定位和照片过了，等活体核验", () => {
    const rows = punchTestRows({
      ...base,
      next: "face",
      location: inside,
      uploadedBytes: 190_464,
    });
    expect(rows.map((row) => row.state)).toEqual(["done", "done", "now"]);
    expect(rows[0].sub).toBe("距中心 42 米，允许 300 米");
    expect(rows[0].status).toEqual({ kind: "ok", text: "通过" });
    expect(rows[1].sub).toBe("已上传 186KB");
    expect(rows[1].status).toEqual({ kind: "ok", text: "已上传" });
    expect(rows[2].sub).toBe("录一段动作视频，和底照比对");
    expect(rows[2].status).toEqual({ kind: "warn", text: "待测试" });
  });

  it("定位没通过：说清是出了范围还是精度不够", () => {
    const outside = punchTestRows({
      ...base,
      location: { ...inside, isInside: false, distanceM: 812 },
    })[0];
    expect(outside.state).toBe("now");
    expect(outside.sub).toBe("距中心 812 米，允许 300 米");
    expect(outside.status).toEqual({ kind: "bad", text: "没通过" });
    const vague = punchTestRows({
      ...base,
      location: { ...inside, accuracyPassed: false },
    })[0];
    expect(vague.sub).toBe("定位精度不够，要求误差不超过 50 米");
    expect(vague.status.kind).toBe("bad");
  });

  it("正在做的那一步是橙点，写着正在做什么", () => {
    expect(punchTestRows({ ...base, phase: "LOCATING" })[0]).toMatchObject({
      state: "now",
      sub: "正在定位",
    });
    const photo = punchTestRows({ ...base, next: "photo", phase: "PHOTO" });
    // 拍照前会重新核对位置，这时手里暂时没有定位结果
    expect(photo[0].sub).toBe("正在重新核对位置");
    expect(photo[1]).toMatchObject({ state: "now", sub: "正在拍照上传" });
    const verifying = punchTestRows({
      ...base,
      next: "face",
      phase: "VERIFYING",
      location: inside,
      uploadedBytes: 1024,
    });
    expect(verifying[2]).toMatchObject({
      state: "now",
      status: { kind: "warn", text: "核验中" },
    });
  });

  it("底照不能用时，第三步写明原因", () => {
    const sub = (profileStatus: string | null, videoEnabled = true): string =>
      punchTestRows({
        ...base,
        next: "profile",
        location: inside,
        uploadedBytes: 1024,
        profileStatus,
        videoEnabled,
      })[2].sub;
    expect(sub(null)).toBe("还没录入底照，先到人脸档案录一张");
    expect(sub("REJECTED")).toBe("底照审核没通过，先到人脸档案重新录");
    expect(sub("REPLACED")).toBe("底照现在不能用，先到人脸档案看看");
    expect(sub("PENDING")).toContain("正式打卡要等审核通过");
    expect(sub("APPROVED", false)).toBe("视频活体没启用，请联系管理员");
  });

  it("核验有了结果：通过是黑点，没通过留在这一步", () => {
    const done = punchTestRows({
      ...base,
      next: "done",
      location: inside,
      uploadedBytes: 1024,
      faceResult: "VERIFIED",
    });
    expect(done.map((row) => row.state)).toEqual(["done", "done", "done"]);
    const failed = punchTestRows({
      ...base,
      next: "face",
      location: inside,
      uploadedBytes: 1024,
      faceResult: "FAILED",
    })[2];
    expect(failed.state).toBe("now");
    expect(failed.status).toEqual({ kind: "bad", text: "没通过" });
  });
});
