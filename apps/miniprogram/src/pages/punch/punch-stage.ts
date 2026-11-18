import type { WorkerPunchStep } from "./worker-view";

/** 打卡页现在显示哪一屏。一屏只做一件事。 */
export type PunchScreen =
  | "unavailable" // 读不到项目或今天的安排
  | "loading"
  | "stale" // 手里的安排不是今天的
  | "result" // 已经保存
  | "blocked" // 没有可打的卡：没排班、休息、都打完了、任务时间不对、底照没通过
  | "points" // 点开了“今天的卡”
  | "locate"
  | "photo"
  | "safety"
  | "face"
  | "saving";

/**
 * 步骤判定沿用 worker-view.ts 的 workerPunchStep（定位、照片、交底、核验的先后和
 * 各种等待状态），这里只决定它落在哪一屏：
 * - 定位通过后仍停在“定位”，由“下一步：拍现场照片”去拍；
 * - 拍完先看一眼照片，点“下一步”才进交底；重拍后要重新看过；
 * - 后面的核对发现人已出范围时回到“定位”，照片和交底都留着。
 */
export const punchScreen = (input: {
  readonly failed: boolean;
  readonly loaded: boolean;
  readonly stale: boolean;
  readonly hasResult: boolean;
  readonly blocked: boolean;
  readonly showPoints: boolean;
  readonly hasPhoto: boolean;
  /** 工人看过这张照片并点了“下一步”。 */
  readonly photoReviewed: boolean;
  readonly step: WorkerPunchStep;
}): PunchScreen => {
  if (input.failed) return "unavailable";
  if (!input.loaded) return "loading";
  if (input.stale) return "stale";
  if (input.hasResult) return "result";
  if (input.blocked || input.step.action === "face-profile") return "blocked";
  if (input.showPoints) return "points";
  const { stage, action } = input.step;
  if (stage === "saving") return "saving";
  if (stage === "location") return "locate";
  if (stage === "photo") return input.hasPhoto ? "photo" : "locate";
  if (action === "wait") return "face";
  if (!input.photoReviewed) return "photo";
  return action === "confirm-safety" ? "safety" : "face";
};

const STEPS: Partial<
  Record<PunchScreen, { readonly current: number; readonly label: string }>
> = {
  locate: { current: 1, label: "定位" },
  photo: { current: 2, label: "现场照片" },
  safety: { current: 3, label: "安全交底" },
  face: { current: 4, label: "人脸核验" },
  saving: { current: 4, label: "人脸核验" },
};

/** 这一屏是四步里的第几步；不在步骤里的屏返回 null。 */
export const screenStep = (
  screen: PunchScreen,
): { readonly current: number; readonly label: string } | null =>
  STEPS[screen] ?? null;

/** 示意图上圆点最远画到 1.2 倍半径，再远也留在图里。 */
const MAX_REACH = 1.2;

/** 距离怎么说：一公里以内说米，再远说公里。 */
export const distanceText = (meters: number): string =>
  meters < 1000
    ? `${Math.round(meters)} 米`
    : `${(meters / 1000).toFixed(1)} 公里`;

/**
 * 示意图上“你”的位置，以允许半径为 1：x 向东为正，y 向下为正（上北下南）。
 * 方向按经纬度算，距离用已经算好的 distanceM，和文字说的米数一致。
 */
export const dotPosition = (
  geofence: {
    readonly centerLatitude: string;
    readonly centerLongitude: string;
    readonly radiusM: number;
  },
  position: { readonly latitude: string; readonly longitude: string },
  distanceM: number,
): { readonly x: number; readonly y: number } => {
  const lat0 = Number(geofence.centerLatitude);
  const north = Number(position.latitude) - lat0;
  const east =
    (Number(position.longitude) - Number(geofence.centerLongitude)) *
    Math.cos((lat0 * Math.PI) / 180);
  const length = Math.hypot(north, east);
  if (
    position.latitude.trim() === "" ||
    position.longitude.trim() === "" ||
    !Number.isFinite(length) ||
    length === 0 ||
    !(geofence.radiusM > 0)
  )
    return { x: 0, y: 0 };
  const reach = Math.min(MAX_REACH, Math.max(0, distanceM) / geofence.radiusM);
  // 用 || 0 去掉 -0，免得样式里出现 “-0%”。
  return {
    x: (east / length) * reach || 0,
    y: (-north / length) * reach || 0,
  };
};
