type NativeFaceFailure = {
  readonly ErrorCode?: string | number;
  readonly ErrorMsg?: string;
};
type NativeFaceRuntime = {
  readonly startVerify?: (options: {
    readonly data: { readonly token: string };
    readonly success: () => void;
    readonly fail: (error: NativeFaceFailure) => void;
  }) => void;
};

declare const wx: NativeFaceRuntime;

export const nativeFaceSdkAvailable = (): boolean =>
  process.env.TARO_ENV === "weapp" &&
  process.env.TARO_APP_FACE_NATIVE_SDK === "true" &&
  typeof wx !== "undefined" &&
  typeof wx.startVerify === "function";

export const initializeNativeFaceSdk = (): void => {
  if (
    process.env.TARO_ENV === "weapp" &&
    process.env.TARO_APP_FACE_NATIVE_SDK === "true"
  ) {
    // Tencent supplies this native package from the approved RuleId console.
    const sdk = require("../verify_mpsdk/main") as {
      readonly init: () => void;
    };
    sdk.init();
  }
};

export const verifyWithNativeFaceSdk = async (
  bizToken: string,
): Promise<void> => {
  if (!nativeFaceSdkAvailable() || typeof wx.startVerify !== "function")
    throw new Error("请在已接入人脸核验服务的微信小程序中操作。");
  await new Promise<void>((resolve, reject) => {
    wx.startVerify!({
      data: { token: bizToken },
      // The SDK documentation requires this delay before resuming on iOS.
      success: (): void => {
        setTimeout(resolve, 500);
      },
      fail: (error: NativeFaceFailure): void => {
        setTimeout(
          () =>
            reject(
              new Error(
                `人脸核验未完成：${error.ErrorMsg ?? "请重新尝试"}（${error.ErrorCode ?? "UNKNOWN"}）`,
              ),
            ),
          500,
        );
      },
    });
  });
};
