import { useEffect, useRef, useState } from "react";

import { errorMessage } from "../services/error-messages";
import {
  cachedRead,
  FRESH_MS,
  peekRead,
  writeVersion,
} from "../services/read-cache";

export type CachedRead<T> = {
  /** 有缓存时立刻就是上次的数据。 */
  readonly data: T | null;
  /** 没有可先显示的数据，正在读：显示骨架。 */
  readonly loading: boolean;
  /** 已经显示着上次的数据，正在核对。 */
  readonly refreshing: boolean;
  /** 这次读取失败的原因；data 仍保留上次的数据。 */
  readonly error: string | null;
};

type ReadState<T> = CachedRead<T> & {
  /** data 是为哪个键、在第几次写操作之后读到的。 */
  readonly key: string | null;
  readonly writes: number;
};

/**
 * 开始一次读取时页面该显示什么：
 * - 缓存里有，先显示缓存；
 * - 缓存没有，但页面上正显示着同一个键的数据、这期间也没改过东西（比如下拉刷新），
 *   继续显示它，不闪骨架；
 * - 其余情况（换了键、刚办完事）显示骨架，不拿旧数据充数。
 */
export const startRead = <T>(
  previous: ReadState<T>,
  key: string | null,
  cached: T | undefined,
  writes: number,
): ReadState<T> => {
  if (key === null)
    return {
      key,
      writes,
      data: null,
      loading: false,
      refreshing: false,
      error: null,
    };
  if (cached !== undefined)
    return {
      key,
      writes,
      data: cached,
      loading: false,
      refreshing: true,
      error: null,
    };
  if (
    previous.key === key &&
    previous.data !== null &&
    previous.writes === writes
  )
    return { ...previous, loading: false, refreshing: true, error: null };
  return {
    key,
    writes,
    data: null,
    loading: true,
    refreshing: false,
    error: null,
  };
};

const EMPTY: ReadState<never> = {
  key: null,
  writes: 0,
  data: null,
  loading: false,
  refreshing: false,
  error: null,
};

/**
 * 先用上次的数据把页面画出来，再去核对。
 * key 要带用户编号（见 services/read-cache.ts）；传 null 表示现在还不能读。
 * revision 变了就重读；30 秒内读过的直接用缓存，手动刷新和写操作会让缓存作废。
 */
export const useCachedRead = <T>(
  key: string | null,
  fetcher: () => Promise<T>,
  revision: number,
  /** 读取失败、服务端又没给出说明时显示的话。 */
  fallback: string = "读取失败，请重试。",
): CachedRead<T> => {
  const [state, setState] = useState<ReadState<T>>(() =>
    startRead<T>(
      EMPTY,
      key,
      key === null ? undefined : peekRead<T>(key),
      writeVersion(),
    ),
  );
  const latest = useRef(fetcher);
  latest.current = fetcher;
  useEffect(() => {
    setState((previous) =>
      startRead<T>(
        previous,
        key,
        key === null ? undefined : peekRead<T>(key),
        writeVersion(),
      ),
    );
    if (key === null) return;
    let cancelled = false;
    void cachedRead(key, () => latest.current(), { maxAgeMs: FRESH_MS }).then(
      (data) => {
        if (!cancelled)
          setState({
            key,
            writes: writeVersion(),
            data,
            loading: false,
            refreshing: false,
            error: null,
          });
      },
      (cause: unknown) => {
        if (!cancelled)
          setState((previous) => ({
            ...previous,
            loading: false,
            refreshing: false,
            error: errorMessage(cause, fallback),
          }));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key, revision]);
  return state;
};
