import Taro, { useDidShow } from "@tarojs/taro";
import { useEffect } from "react";

import { ACCESS_TOKEN_KEY } from "../config/env";
import { useSession } from "../store/session";
import { sessionEntryUrl } from "../routing/session";

export const useSessionGuard = (): void => {
  const { phase } = useSession();
  const guard = (): void => {
    if (phase === "anonymous" || !Taro.getStorageSync(ACCESS_TOKEN_KEY)) {
      void Taro.reLaunch({ url: "/pages/login/index" });
      return;
    }
    const url = sessionEntryUrl(phase);
    if (url !== null && url !== "/pages/home/index") void Taro.reLaunch({ url });
  };
  useDidShow(guard);
  useEffect(guard, [phase]);
};
