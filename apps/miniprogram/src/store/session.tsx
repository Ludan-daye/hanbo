import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useState,
  type PropsWithChildren,
} from "react";
import Taro from "@tarojs/taro";

import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from "../config/env";
import { fetchMe, logout } from "../services/auth";
import { fetchAccountProfile } from "../services/account";
import type { MeResponse } from "../services/auth.types";
import {
  initialSessionState,
  sessionPhase,
  sessionReducer,
  type SessionPhase,
  type SessionState,
} from "./sessionReducer";

type SessionContextValue = {
  readonly state: SessionState;
  readonly phase: SessionPhase;
  readonly error: string | null;
  readonly refreshMe: () => Promise<MeResponse>;
  readonly onLoggedIn: () => Promise<void>;
  readonly clear: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export const SessionProvider = ({
  children,
}: PropsWithChildren): JSX.Element => {
  const [error, setError] = useState<string | null>(null);
  const [state, dispatch] = useReducer(
    sessionReducer,
    initialSessionState,
    (initial): SessionState => {
      const accessToken = String(Taro.getStorageSync(ACCESS_TOKEN_KEY) || "");
      const refreshToken = String(Taro.getStorageSync(REFRESH_TOKEN_KEY) || "");
      return accessToken.length > 0
        ? { ...initial, accessToken, refreshToken }
        : initial;
    },
  );

  const loadMe = async (): Promise<MeResponse> => {
    setError(null);
    const me = await fetchMe();
    const accountProfile = await fetchAccountProfile();
    dispatch({ me, accountProfile, type: "SET_ME" });
    return me;
  };

  useEffect(() => {
    const accessToken = String(Taro.getStorageSync(ACCESS_TOKEN_KEY) || "");
    const refreshToken = String(Taro.getStorageSync(REFRESH_TOKEN_KEY) || "");
    if (accessToken.length > 0) {
      dispatch({ accessToken, refreshToken, type: "SET_TOKENS" });
      void loadMe().catch((cause: unknown): void => {
        dispatch({ type: "CLEAR" });
        setError(
          cause instanceof Error
            ? cause.message
            : "读取登录状态失败，请重新登录。",
        );
      });
    }
  }, []);

  const value: SessionContextValue = {
    clear: async () => {
      try {
        await logout();
      } finally {
        dispatch({ type: "CLEAR" });
      }
    },
    onLoggedIn: async () => {
      const accessToken = String(Taro.getStorageSync(ACCESS_TOKEN_KEY) || "");
      const refreshToken = String(Taro.getStorageSync(REFRESH_TOKEN_KEY) || "");
      dispatch({ type: "CLEAR" });
      dispatch({ accessToken, refreshToken, type: "SET_TOKENS" });
      try {
        await loadMe();
      } catch (cause: unknown) {
        dispatch({ type: "CLEAR" });
        throw cause;
      }
    },
    error,
    phase: sessionPhase(state),
    refreshMe: loadMe,
    state,
  };

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
};

export const useSession = (): SessionContextValue => {
  const ctx = useContext(SessionContext);
  if (ctx === null) {
    throw new Error("useSession must be used within SessionProvider");
  }
  return ctx;
};
