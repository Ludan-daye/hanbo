import Taro from "@tarojs/taro";

export const readDemoPhoto = async (filePath: string): Promise<string> => {
  if (process.env.TARO_ENV === "h5") {
    const response = await fetch(filePath);
    if (!response.ok) throw new Error(`无法读取测试图片：${response.status}`);
    const blob = await response.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = (): void =>
        reject(new Error("无法读取测试图片，请重新选择。"));
      reader.onload = (): void =>
        typeof reader.result === "string"
          ? resolve(reader.result)
          : reject(new Error("测试图片格式无效。"));
      reader.readAsDataURL(blob);
    });
  }
  return new Promise<string>((resolve, reject) => {
    Taro.getFileSystemManager().readFile({
      filePath,
      encoding: "base64",
      success: (result) =>
        resolve(`data:image/jpeg;base64,${String(result.data)}`),
      fail: (error) => reject(new Error(`无法读取测试图片：${error.errMsg}`)),
    });
  });
};
