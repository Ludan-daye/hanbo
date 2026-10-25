import { type PropsWithChildren } from "react";
import { useLaunch } from "@tarojs/taro";

import { SessionProvider } from "./store/session";
import { initializeNativeFaceSdk } from "./services/face-sdk";
import { PrivacyProvider } from "./components/privacy-authorization";
import "./app.scss";

export default function App({ children }: PropsWithChildren): JSX.Element {
  useLaunch(() => { initializeNativeFaceSdk(); });
  return (
    <PrivacyProvider>
      <SessionProvider>{children}</SessionProvider>
    </PrivacyProvider>
  );
}
