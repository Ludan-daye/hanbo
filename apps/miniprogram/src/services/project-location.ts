import { checkAttendanceGeofence } from "./geofence";
import type { CreateProjectBody } from "./management.types";

export type ProjectLocation = Pick<
  CreateProjectBody,
  "address" | "centerLatitude" | "centerLongitude" | "geofenceRadiusM"
>;
export type MapPoint = {
  readonly latitude: number;
  readonly longitude: number;
};
export type MapSelection = MapPoint & {
  readonly name: string;
  readonly address: string;
};

export const readMapPoint = (detail: unknown): MapPoint => {
  if (
    typeof detail !== "object" ||
    detail === null ||
    !("latitude" in detail) ||
    !("longitude" in detail) ||
    typeof detail.latitude !== "number" ||
    typeof detail.longitude !== "number" ||
    !Number.isFinite(detail.latitude) ||
    !Number.isFinite(detail.longitude) ||
    Math.abs(detail.latitude) > 90 ||
    Math.abs(detail.longitude) > 180
  ) {
    throw new RangeError("地图没有返回有效位置，请重新选点。");
  }
  return { latitude: detail.latitude, longitude: detail.longitude };
};

export const validateProjectLocation = (location: ProjectLocation): void => {
  if (!location.address.trim())
    throw new Error("请选择工地位置并补充详细地址。");
  if (
    !Number.isInteger(location.geofenceRadiusM) ||
    location.geofenceRadiusM <= 0
  ) {
    throw new RangeError("考勤范围无效，请在地图上重新点选边界。");
  }
  checkAttendanceGeofence(
    { ...location, radiusM: location.geofenceRadiusM },
    {
      latitude: location.centerLatitude,
      longitude: location.centerLongitude,
      accuracyM: null,
    },
  );
};

/** WeChat map selection and attendance GPS both use GCJ-02 coordinates. */
export const locationFromMapSelection = (
  selection: MapSelection,
  radiusM: number,
): ProjectLocation => {
  const point = readMapPoint(selection);
  const address = selection.address.trim();
  const name = selection.name.trim();
  const location: ProjectLocation = {
    address: address.includes(name)
      ? address
      : [address, name].filter((part) => part.length > 0).join(" "),
    centerLatitude: point.latitude.toFixed(7),
    centerLongitude: point.longitude.toFixed(7),
    geofenceRadiusM: radiusM,
  };
  validateProjectLocation(location);
  return location;
};

/** Round outward so the selected edge remains within the stored circle. */
export const locationFromMapBoundary = (
  location: ProjectLocation,
  detail: unknown,
): ProjectLocation => {
  validateProjectLocation(location);
  const point = readMapPoint(detail);
  const { distanceM } = checkAttendanceGeofence(
    { ...location, radiusM: location.geofenceRadiusM },
    {
      latitude: point.latitude.toFixed(7),
      longitude: point.longitude.toFixed(7),
      accuracyM: null,
    },
  );
  if (distanceM < 1)
    throw new RangeError("边界与中心太近，请在地图上选择更远的边界位置。");
  return { ...location, geofenceRadiusM: Math.ceil(distanceM) };
};

/** Fit the whole circle with margin, including when it crosses the date line. */
export const projectMapBounds = (location: ProjectLocation): MapPoint[] => {
  const latitude = (Number(location.centerLatitude) * Math.PI) / 180;
  const longitude = (Number(location.centerLongitude) * Math.PI) / 180;
  const angularDistance = (location.geofenceRadiusM * 1.25) / 6371000;
  return [0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((bearing) => {
    const lat = Math.asin(
      Math.sin(latitude) * Math.cos(angularDistance) +
        Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearing),
    );
    const lng =
      longitude +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude),
        Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(lat),
      );
    return {
      latitude: (lat * 180) / Math.PI,
      longitude: (((lng * 180) / Math.PI + 540) % 360) - 180,
    };
  });
};
