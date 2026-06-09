import { createContext, useContext, useEffect, useReducer, type PropsWithChildren } from "react";
import Taro from "@tarojs/taro";

import { fetchMe } from "../services/auth.js";
import { initialSessionState, sessionPhase, sessionReducer, type SessionPhase, type SessionState } from "./sessionReducer.js";

type SessionContextValue = {
  readonly state: SessionState;
  readonly phase: SessionPhase;
  readonly refreshMe: () => Promise<void>;
  readonly onLoggedIn: () => Promise<void>;
  readonly clear: () => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export const SessionProvider = ({ children }: PropsWithChildren): JSX.Element => {
  const [state, dispatch] = useReducer(sessionReducer, initialSessionState);

  const loadMe = async (): Promise<void> => {
    try {
      const me = await fetchMe();
      dispatch({ me, type: "SET_ME" });
    } catch {
      dispatch({ type: "CLEAR" });
    }
  };

  useEffect(() => {
    const accessToken = String(Taro.getStorageSync("accessToken") || "");
    const refreshToken = String(Taro.getStorageSync("refreshToken") || "");
    if (accessToken.length > 0) {
      dispatch({ accessToken, refreshToken, type: "SET_TOKENS" });
      void loadMe();
    }
  }, []);

  const value: SessionContextValue = {
    clear: () => {
      Taro.removeStorageSync("accessToken");
      Taro.removeStorageSync("refreshToken");
      dispatch({ type: "CLEAR" });
    },
    onLoggedIn: async () => {
      const accessToken = String(Taro.getStorageSync("accessToken") || "");
      const refreshToken = String(Taro.getStorageSync("refreshToken") || "");
      dispatch({ accessToken, refreshToken, type: "SET_TOKENS" });
      await loadMe();
    },
    phase: sessionPhase(state),
    refreshMe: loadMe,
    state
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
};

export const useSession = (): SessionContextValue => {
  const ctx = useContext(SessionContext);
  if (ctx === null) {
    throw new Error("useSession must be used within SessionProvider");
  }
  return ctx;
};
