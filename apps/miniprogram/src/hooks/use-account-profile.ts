import { fetchAccountProfile, type AccountProfile } from "../services/account";
import { useSession } from "../store/session";
import { useCachedRead } from "./use-cached-read";
import { usePageRefresh } from "./use-page-refresh";

export const useAccountProfile = (): {
  readonly profile: AccountProfile | null;
  readonly error: string | null;
  readonly refresh: () => void;
} => {
  const { state } = useSession();
  const { revision, refresh } = usePageRefresh();
  const userId: string | null = state.me?.user.id ?? null;
  const { data, error } = useCachedRead<AccountProfile>(
    userId === null ? null : `${userId}:account-profile`,
    fetchAccountProfile,
    revision,
    "账号资料读取失败，请重试。",
  );
  return { profile: data, error, refresh };
};
