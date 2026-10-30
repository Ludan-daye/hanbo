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
    const pages = Taro.getCurrentPages();
    const currentRoute: string | undefined = pages[pages.length - 1]?.route;
    if (
      url !== null &&
      url !== "/pages/home/index" &&
      url.split("?")[0].replace(/^\/+/, "") !== currentRoute?.replace(/^\/+/, "")
    )
      void Taro.reLaunch({ url });
  };
  useDidShow(guard);
  useEffect(guard, [phase]);
};
