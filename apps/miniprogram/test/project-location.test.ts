import { describe, expect, it } from "vitest";

import {
  locationFromMapBoundary,
  locationWithRadius,
  parseRadiusInput,
  type ProjectLocation,
} from "../src/services/project-location";

const site: ProjectLocation = {
  address: "成都市武侯区示例工地",
  centerLatitude: "30.6431000",
  centerLongitude: "104.0912000",
  geofenceRadiusM: 300,
};

describe("考勤半径", () => {
  it("可以直接改成常用半径，位置不变", () => {
    expect(locationWithRadius(site, 800)).toEqual({ ...site, geofenceRadiusM: 800 });
  });

  it("自己填的半径要是 50 到 3000 之间的整数", () => {
    expect(parseRadiusInput(" 650 ")).toBe(650);
    expect(() => parseRadiusInput("49")).toThrow("50 到 3000");
    expect(() => parseRadiusInput("3001")).toThrow("50 到 3000");
    expect(() => parseRadiusInput("12.5")).toThrow("整数");
    expect(() => parseRadiusInput("")).toThrow("整数");
  });

  it("在地图上点得太远会提示上限，不会存一个超大的范围", () => {
    expect(() =>
      locationFromMapBoundary(site, { latitude: 30.7, longitude: 104.0912 }),
    ).toThrow("最多 3000 米");
    expect(() =>
      locationFromMapBoundary(site, { latitude: 30.6432, longitude: 104.0912 }),
    ).toThrow("至少 50 米");
  });
});
