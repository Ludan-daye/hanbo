import Taro from "@tarojs/taro";

export const replacementNeedsConfirmation = (
  status: string | undefined,
  photo: string,
  confirmedPhoto: string | null,
): boolean => status === "APPROVED" && photo !== confirmedPhoto;

export const chooseFaceEnrollmentPhoto = async (): Promise<string> => {
  let path: string | undefined;
  let size: number | undefined;
  if (process.env.TARO_ENV === "weapp") {
    const result = await Taro.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sizeType: ["compressed"],
      sourceType: ["camera"],
    });
    path = result.tempFiles[0]?.tempFilePath;
    size = result.tempFiles[0]?.size;
  } else {
    const result = await Taro.chooseImage({
      count: 1,
      sizeType: ["compressed"],
      sourceType: process.env.TARO_ENV === "h5" ? ["album", "camera"] : ["camera"],
    });
    path = result.tempFilePaths[0];
    size = result.tempFiles[0]?.size;
  }
  if (!path || size === undefined) throw new Error("未读取到照片，请重新拍摄。");
  if (size > 2 * 1024 * 1024) throw new Error("底照不能超过 2MB，请重新拍摄。");
  return path;
};
