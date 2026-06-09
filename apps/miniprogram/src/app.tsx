import { type PropsWithChildren } from "react";

import { SessionProvider } from "./store/session";
import "./app.scss";

export default function App({ children }: PropsWithChildren): JSX.Element {
  return <SessionProvider>{children}</SessionProvider>;
}
