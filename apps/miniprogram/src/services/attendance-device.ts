import Taro from "@tarojs/taro";
import type { AttendanceLocation } from "./geofence";

export const readAttendanceLocation = async (): Promise<AttendanceLocation> => {
  const gps = await Taro.getLocation({ type: "gcj02", isHighAccuracy: true });
  return {
    latitude: gps.latitude.toFixed(7),
    longitude: gps.longitude.toFixed(7),
    accuracyM: gps.accuracy === undefined ? null : String(gps.accuracy),
  };
};

export const chooseAttendancePhoto = async (): Promise<string> => {
  const result = await Taro.chooseImage({
    count: 1,
    sizeType: ["compressed"],
    sourceType:
      process.env.TARO_ENV === "h5" ? ["album", "camera"] : ["camera"],
  });
  const file = result.tempFiles[0];
  const path = result.tempFilePaths[0];
  if (file === undefined || path === undefined)
    throw new Error("未读取到照片，请重新拍摄。");
  if (file.size > 5 * 1024 * 1024)
    throw new Error("照片超过 5MB，请重新拍摄。");
  return path;
};
