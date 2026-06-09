import { type PropsWithChildren } from "react";

import { SessionProvider } from "./store/session.js";
import "./app.scss";

export default function App({ children }: PropsWithChildren): JSX.Element {
  return <SessionProvider>{children}</SessionProvider>;
}
