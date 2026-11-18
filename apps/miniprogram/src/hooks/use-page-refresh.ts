import { useDidShow } from "@tarojs/taro";
import { useCallback, useRef, useState } from "react";

import {
  FRESH_MS,
  invalidateReads,
  writeVersion,
} from "../services/read-cache";

/**
 * 回到页面时要不要重读。刚读过、这期间也没改过东西，就不读：
 * 拍照、选位置、看一眼子页面再回来，都会触发“页面显示”，没必要每次都重新请求。
 */
export const shouldRefreshOnShow = (input: {
  readonly lastRefreshAt: number | null;
  readonly now: number;
  readonly writesAtLastRefresh: number;
  readonly writesNow: number;
  readonly minIntervalMs: number;
}): boolean =>
  input.lastRefreshAt === null ||
  input.writesNow !== input.writesAtLastRefresh ||
  input.now - input.lastRefreshAt >= input.minIntervalMs;

export const usePageRefresh = (options?: {
  /** 距上次读取不到这么久、期间也没有写操作时，回到页面不重读。默认 30 秒。 */
  readonly minShowIntervalMs?: number;
}): {
  readonly revision: number;
  /** 手动刷新（下拉、重试）：丢掉缓存，一定重读。 */
  readonly refresh: () => void;
} => {
  const minIntervalMs = options?.minShowIntervalMs ?? FRESH_MS;
  const [revision, setRevision] = useState<number>(0);
  const last = useRef<{ at: number; writes: number } | null>(null);
  const bump = useCallback((): void => {
    last.current = { at: Date.now(), writes: writeVersion() };
    setRevision((value) => value + 1);
  }, []);
  const refresh = useCallback((): void => {
    invalidateReads();
    bump();
  }, [bump]);
  useDidShow(() => {
    if (
      shouldRefreshOnShow({
        lastRefreshAt: last.current?.at ?? null,
        now: Date.now(),
        writesAtLastRefresh: last.current?.writes ?? 0,
        writesNow: writeVersion(),
        minIntervalMs,
      })
    )
      bump();
  });
  return { revision, refresh };
};
