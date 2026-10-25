import { useEffect, useState } from "react";

import { fetchAccountProfile, type AccountProfile } from "../services/account";
import { useSession } from "../store/session";
import { usePageRefresh } from "./use-page-refresh";

export const useAccountProfile = (): {
  readonly profile: AccountProfile | null;
  readonly error: string | null;
  readonly refresh: () => void;
} => {
  const { state } = useSession();
  const { revision, refresh } = usePageRefresh();
  const userId: string | null = state.me?.user.id ?? null;
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setError(null);
    setProfile(null);
    if (userId === null) return;
    void fetchAccountProfile().then(
      (result: AccountProfile): void => {
        if (!cancelled) setProfile(result);
      },
      (cause: unknown): void => {
        if (!cancelled)
          setError(
            cause instanceof Error
              ? cause.message
              : "账号资料读取失败，请重试。",
          );
      },
    );
    return () => {
      cancelled = true;
    };
  }, [userId, revision]);
  return { profile, error, refresh };
};
