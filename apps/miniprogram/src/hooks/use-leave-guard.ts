import Taro from "@tarojs/taro";
import { useEffect } from "react";

const supported = (): boolean => process.env.TARO_ENV === "weapp";

const disable = (): void => {
  try {
    Taro.disableAlertBeforeUnload();
  } catch {
    // 低版本基础库没有这个接口，不拦就是了。
  }
};

/**
 * 页面是自定义导航栏，系统返回和右滑会直接关掉整个页面。
 * 页面里有没保存的东西（子视图里的草稿）时传一句提示，微信会在离开前问一下；
 * 传 null 表示没东西可丢，正常返回。只在微信小程序里生效，H5 和测试里什么都不做。
 * 页面内自己的返回（PageHeader onBack 回到上一层视图）不受影响。
 */
export const useLeaveGuard = (message: string | null): void => {
  useEffect(() => {
    if (!supported()) {
      return;
    }
    if (message === null) {
      disable();
      return;
    }
    try {
      Taro.enableAlertBeforeUnload({ message });
    } catch {
      return;
    }
    return disable;
  }, [message]);
};
