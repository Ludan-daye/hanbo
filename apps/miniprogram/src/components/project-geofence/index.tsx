import { Map, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useMemo, useState } from "react";

import centerPin from "../../assets/icons/pin.png";
import { errorMessage, isUserCancel } from "../../services/error-messages";
import {
  locationFromMapBoundary,
  locationFromMapSelection,
  projectMapBounds,
  type ProjectLocation,
} from "../../services/project-location";
import { Button, Notice, Photo } from "../ui/index";

import "./index.scss";

const locationError = (cause: unknown): string =>
  isUserCancel(cause)
    ? "没有重新选，原来的位置没变。"
    : errorMessage(cause, "位置没选成，请检查微信的定位权限后再试。");

/**
 * 工地位置和考勤范围：真地图。先选工地中心，再点地图上的一处定边界。
 * 项目设置和新建项目共用；地址由所在页面自己放输入框。
 */
export const ProjectGeofence = ({
  value,
  onChange,
  disabled,
}: {
  readonly value: ProjectLocation | null;
  readonly onChange: (location: ProjectLocation) => void;
  readonly disabled: boolean;
}): JSX.Element => {
  const [selecting, setSelecting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const bounds = useMemo(
    () => (value === null ? [] : projectMapBounds(value)),
    [value?.centerLatitude, value?.centerLongitude, value?.geofenceRadiusM],
  );

  const chooseCenter = async (): Promise<void> => {
    if (disabled || selecting) return;
    setSelecting(true);
    setError(null);
    try {
      const selection = await Taro.chooseLocation(
        value === null
          ? {}
          : {
              latitude: Number(value.centerLatitude),
              longitude: Number(value.centerLongitude),
            },
      );
      onChange(
        locationFromMapSelection(
          selection,
          value === null ? 300 : value.geofenceRadiusM,
        ),
      );
    } catch (cause: unknown) {
      setError(locationError(cause));
    } finally {
      setSelecting(false);
    }
  };
  const chooseBoundary = (detail: unknown): void => {
    if (value === null || disabled || selecting) return;
    setError(null);
    try {
      onChange(locationFromMapBoundary(value, detail));
    } catch (cause: unknown) {
      setError(locationError(cause));
    }
  };

  const caption =
    value === null ? null : (
      <View className="project-geofence__caption">
        <View className="project-geofence__radius">
          半径 <Text className="num">{value.geofenceRadiusM}</Text> 米
        </View>
        <View className="project-geofence__address">{value.address}</View>
      </View>
    );

  return (
    <View className="project-geofence">
      {process.env.TARO_ENV === "weapp" ? (
        <>
          {value === null ? (
            <Photo icon="pin" label="还没有选工地位置" />
          ) : (
            <>
              <Map
                id="project-geofence-map"
                className="project-geofence__map"
                latitude={Number(value.centerLatitude)}
                longitude={Number(value.centerLongitude)}
                scale={16}
                includePoints={bounds}
                showScale
                enableRotate={false}
                markers={[
                  {
                    id: 1,
                    latitude: Number(value.centerLatitude),
                    longitude: Number(value.centerLongitude),
                    iconPath: centerPin,
                    width: 30,
                    height: 30,
                    title: "工地中心",
                  },
                ]}
                circles={[
                  {
                    latitude: Number(value.centerLatitude),
                    longitude: Number(value.centerLongitude),
                    radius: value.geofenceRadiusM,
                    color: "#FF6A13",
                    fillColor: "#FF6A1329",
                    strokeWidth: 2,
                  },
                ]}
                onTap={(event) => chooseBoundary(event.detail)}
                onPoiTap={(event) => chooseBoundary(event.detail)}
                onError={() =>
                  setError("地图没加载出来，请检查网络和定位权限。")
                }
              />
              {caption}
              <Notice>
                橙色圆圈里可以打卡。点地图上的一处，范围的边就定到那里。
              </Notice>
            </>
          )}
          <Button
            variant="outline"
            wide
            loading={selecting}
            disabled={disabled}
            onClick={() => {
              void chooseCenter();
            }}
          >
            {selecting
              ? "选择中…"
              : value === null
                ? "在地图上选择工地"
                : "重新选择工地中心"}
          </Button>
        </>
      ) : (
        <>
          <Notice>地图选址只能在微信小程序里用。</Notice>
          {caption}
        </>
      )}
      {error !== null ? <Notice tone="error">{error}</Notice> : null}
    </View>
  );
};
