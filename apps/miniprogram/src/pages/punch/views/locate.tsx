import { View } from "@tarojs/components";

import {
  BottomBar,
  Button,
  Notice,
  Row,
  Say,
  SectionTitle,
  Segmented,
  Sheet,
} from "../../../components/ui";
import type { AttendanceLocation } from "../../../services/geofence";
import type { AttendanceTodayGeofence } from "../../../services/me.types";
import { distanceText, dotPosition } from "../punch-stage";

export type DemoPosition = "INSIDE" | "OUTSIDE" | "DENIED";

// 示意图宽 678rpx、高 422rpx，考勤范围的圆半径 148rpx：换成百分比，两种构建里都不用换算单位。
const ZONE_X = (148 / 678) * 100;
const ZONE_Y = (148 / 422) * 100;

/** 考勤范围示意图：一个圆是范围，一个点是你。上北下南，不是地图。 */
const ZoneMap = ({
  label,
  dot,
}: {
  readonly label: string;
  readonly dot: { readonly x: number; readonly y: number } | null;
}): JSX.Element => (
  <View className="punch-map">
    <View className="punch-map__zone" />
    {dot ? (
      <View
        className="punch-map__me"
        style={{
          left: `${50 + dot.x * ZONE_X}%`,
          top: `${50 + dot.y * ZONE_Y}%`,
        }}
      />
    ) : null}
    <View className="punch-map__label">{label}</View>
  </View>
);

/** 第 1 步：定位。在范围内时，按钮直接去拍现场照片。 */
export const LocateView = ({
  locating,
  taking,
  location,
  problem,
  photoProblem,
  locationDenied,
  cameraDenied,
  projectName,
  geofence,
  card,
  taskName,
  demo,
  onLocate,
  onPhoto,
  onSettings,
  onPoints,
  onSite,
}: {
  readonly locating: boolean;
  /** 相机开着，正在拍现场照片。 */
  readonly taking: boolean;
  readonly location: {
    readonly isInside: boolean;
    readonly distanceM: number;
    readonly position: AttendanceLocation;
  } | null;
  /** 没定到位的原因：权限、精度、网络。 */
  readonly problem: string | null;
  /** 位置没问题，但照片没拍成的原因。 */
  readonly photoProblem: string | null;
  readonly locationDenied: boolean;
  readonly cameraDenied: boolean;
  readonly projectName: string;
  readonly geofence: AttendanceTodayGeofence;
  /** 现在要打的这张卡，例如“上班 08:00”。 */
  readonly card: string;
  readonly taskName?: string;
  readonly demo?: {
    readonly value: DemoPosition;
    readonly onChange: (value: DemoPosition) => void;
  };
  readonly onLocate: () => void;
  readonly onPhoto: () => void;
  readonly onSettings: () => void;
  readonly onPoints: () => void;
  readonly onSite: () => void;
}): JSX.Element => {
  const inside = location?.isInside === true && problem === null;
  const range =
    location === null
      ? `允许距工地中心 ${geofence.radiusM} 米。`
      : `距工地中心 ${distanceText(location.distanceM)}，允许 ${geofence.radiusM} 米。`;
  const title = locating
    ? "正在定位"
    : inside
      ? "你在考勤范围内"
      : location?.isInside === false
        ? "你不在考勤范围内"
        : locationDenied
          ? "需要打开定位权限"
          : problem?.includes("精度")
            ? "定位不够准"
            : problem !== null
              ? "没定到位"
              : "正在定位";
  const sub = locating
    ? "正在核对你是不是在考勤范围内。"
    : inside
      ? range
      : location?.isInside === false
        ? `${range}到了工地再点重新定位。`
        : (problem ?? "正在核对你是不是在考勤范围内。");
  const busy = locating || taking;
  return (
    <>
      {/* 换到这一步时内容从右边滑入。底部操作条是固定定位的，不能放进带动画的容器里。 */}
      <View className="m-step">
        <Say title={title} sub={sub} />
        <ZoneMap
          label={`${projectName}，半径 ${geofence.radiusM} 米`}
          dot={
            location === null || locating
              ? null
              : dotPosition(geofence, location.position, location.distanceM)
          }
        />
        {inside && cameraDenied ? (
          <Notice tone="error">
            需要打开相机权限
            <View className="ui-notice__sub">现场照片只能现场拍。</View>
          </Notice>
        ) : inside && photoProblem !== null ? (
          <Notice tone="error">{photoProblem}</Notice>
        ) : null}
        <Sheet gap>
          <Row
            title="今天的卡"
            value={card}
            chevron
            onClick={busy ? undefined : onPoints}
          />
          {taskName ? <Row title="任务" value={taskName} mute /> : null}
        </Sheet>
        {demo ? (
          <>
            <SectionTitle>演示定位，不读真实位置</SectionTitle>
            <Segmented
              options={[
                { value: "INSIDE", label: "范围内" },
                { value: "OUTSIDE", label: "范围外" },
                { value: "DENIED", label: "定位失败" },
              ]}
              value={demo.value}
              onChange={demo.onChange}
            />
          </>
        ) : null}
      </View>
      {inside ? (
        <BottomBar
          primary={
            taking ? "拍照中…" : cameraDenied ? "去设置" : "下一步：拍现场照片"
          }
          busy={busy}
          onPrimary={cameraDenied ? onSettings : onPhoto}
        />
      ) : (
        <BottomBar
          primary={
            locating ? "定位中…" : locationDenied ? "去设置" : "重新定位"
          }
          busy={busy}
          onPrimary={locationDenied ? onSettings : onLocate}
        >
          {busy ? null : (
            <Button variant="text" onClick={onSite}>
              工地位置和联系人
            </Button>
          )}
        </BottomBar>
      )}
    </>
  );
};
