import type { AttendanceToday } from "./me.types";

export type AttendanceLocation = {
  readonly latitude: string;
  readonly longitude: string;
  readonly accuracyM: string | null;
};
export type GeofenceCheck = {
  readonly distanceM: number;
  readonly isInside: boolean;
};

const toRadians = (value: number): number => (value * Math.PI) / 180;

export const checkAttendanceGeofence = (
  geofence: AttendanceToday["geofence"],
  position: AttendanceLocation,
): GeofenceCheck => {
  const fromLat: number = Number(geofence.centerLatitude);
  const fromLng: number = Number(geofence.centerLongitude);
  const toLat: number = Number(position.latitude);
  const toLng: number = Number(position.longitude);
  if (
    [
      geofence.centerLatitude,
      geofence.centerLongitude,
      position.latitude,
      position.longitude,
    ].some((value) => value.trim() === "") ||
    ![fromLat, fromLng, toLat, toLng, geofence.radiusM].every(
      Number.isFinite,
    ) ||
    Math.abs(fromLat) > 90 ||
    Math.abs(toLat) > 90 ||
    Math.abs(fromLng) > 180 ||
    Math.abs(toLng) > 180 ||
    geofence.radiusM <= 0
  )
    throw new RangeError(
      "考勤位置无效，请重新打卡；如仍失败，请联系管理员核对项目位置。",
    );
  const lat: number = toRadians(toLat - fromLat);
  const lng: number = toRadians(toLng - fromLng);
  const value: number = Math.min(
    1,
    Math.max(
      0,
      Math.sin(lat / 2) ** 2 +
        Math.cos(toRadians(fromLat)) *
          Math.cos(toRadians(toLat)) *
          Math.sin(lng / 2) ** 2,
    ),
  );
  const distanceM: number =
    6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
  return { distanceM, isInside: distanceM <= geofence.radiusM };
};
