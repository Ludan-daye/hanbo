import { Map, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useMemo, useState } from "react";

import centerPin from "../../assets/icons/pin.png";
import {
  locationFromMapBoundary,
  locationFromMapSelection,
  projectMapBounds,
  type ProjectLocation,
} from "../../services/project-location";
import { Button, Notice, Subtitle } from "../ui/index";

import "./index.scss";

const locationError = (cause: unknown): string => {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === "object" && cause !== null && "errMsg" in cause) {
    const message = String(cause.errMsg);
    if (message.toLowerCase().includes("cancel"))
      return "已取消选址，原位置未更改。";
    return `选址失败，请检查微信定位权限。${message}`;
  }
  return "地图选址未完成，请重新打开地图。";
};

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

  return (
    <View className="project-geofence">
      {process.env.TARO_ENV === "weapp" ? (
        <>
          <Button
            variant="outline"
            loading={selecting}
            disabled={disabled}
            onClick={() => {
              void chooseCenter();
            }}
          >
            {value === null ? "在地图上选择工地" : "重新选择工地中心"}
          </Button>
          {value === null ? (
            <View className="project-geofence__empty">
              选择工地中心，再点选范围边界。
            </View>
          ) : (
            <>
              <View className="project-geofence__summary">
                <View>
                  考勤半径{" "}
                  <View className="project-geofence__radius">
                    {value.geofenceRadiusM}
                  </View>{" "}
                  米
                </View>
                <Subtitle>点选边界调整范围</Subtitle>
              </View>
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
                    color: "#1462CC",
                    fillColor: "#1462CC28",
                    strokeWidth: 2,
                  },
                ]}
                onTap={(event) => chooseBoundary(event.detail)}
                onPoiTap={(event) => chooseBoundary(event.detail)}
                onError={() =>
                  setError(
                    "地图加载失败，请检查网络和定位权限。",
                  )
                }
              />
              <Subtitle>
                蓝色圆圈为可打卡范围。
              </Subtitle>
            </>
          )}
        </>
      ) : (
        <Notice>
          地图选址仅支持微信小程序。
        </Notice>
      )}
      {value !== null ? (
        <View className="project-geofence__address">{value.address}</View>
      ) : null}
      {error !== null ? <Notice>{error}</Notice> : null}
    </View>
  );
};
