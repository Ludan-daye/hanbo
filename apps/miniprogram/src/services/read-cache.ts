// 读取缓存：只在内存里，为的是“先用上次的数据把页面画出来，再去核对”。
//
// 稳妥优先，所以规则很保守：
// - 键必须带用户编号（约定 `${userId}:${名称}:${参数}`），退出登录时整个清空；
// - 任何一次成功的写操作都会清空全部缓存，避免刚办完事又看到办之前的数据；
// - 清空之后才回来的旧请求，结果不会再写进缓存。

/** 这么新的数据直接用，不再发请求。 */
export const FRESH_MS = 30_000;
/** 超过这个时间的数据不再拿来先显示，宁可等一下。 */
export const STALE_MS = 10 * 60_000;

type Entry = { readonly value: unknown; readonly at: number };

const entries = new Map<string, Entry>();
const pending = new Map<string, Promise<unknown>>();
let generation = 0;
let writes = 0;

/**
 * 读一次并记住结果。同一个键同时只发一个请求；
 * 传了 maxAgeMs 且缓存够新时，直接返回缓存，不发请求。
 */
export const cachedRead = <T>(
  key: string,
  fetcher: () => Promise<T>,
  options?: { readonly maxAgeMs?: number },
): Promise<T> => {
  const entry = entries.get(key);
  if (
    entry !== undefined &&
    options?.maxAgeMs !== undefined &&
    Date.now() - entry.at < options.maxAgeMs
  )
    return Promise.resolve(entry.value as T);
  const running = pending.get(key);
  if (running !== undefined) return running as Promise<T>;
  const startedIn = generation;
  const promise: Promise<T> = fetcher()
    .then((value) => {
      if (startedIn === generation)
        entries.set(key, { value, at: Date.now() });
      return value;
    })
    .finally(() => {
      if (pending.get(key) === promise) pending.delete(key);
    });
  pending.set(key, promise);
  return promise;
};

/** 上次成功读到的结果；太旧的不算。 */
export const peekRead = <T>(
  key: string,
  maxStaleMs: number = STALE_MS,
): T | undefined => {
  const entry = entries.get(key);
  return entry !== undefined && Date.now() - entry.at < maxStaleMs
    ? (entry.value as T)
    : undefined;
};

/** 距上次成功读取过了多少毫秒；没读过返回 null。 */
export const readAge = (key: string, now: number = Date.now()): number | null => {
  const entry = entries.get(key);
  return entry === undefined ? null : now - entry.at;
};

/** 丢弃匹配前缀的缓存；不传前缀则全部丢弃。还在路上的请求不再写回。 */
export const invalidateReads = (prefix?: string): void => {
  generation += 1;
  for (const key of [...entries.keys()])
    if (prefix === undefined || key.startsWith(prefix)) entries.delete(key);
  for (const key of [...pending.keys()])
    if (prefix === undefined || key.startsWith(prefix)) pending.delete(key);
};

/** 退出登录、换账号时调用。 */
export const clearReadCache = (): void => invalidateReads();

/** 任何写操作成功后调用：缓存全部作废，回到页面时也会重读。 */
export const noteWrite = (): void => {
  writes += 1;
  invalidateReads();
};

/** 写操作计数，用来判断“离开这段时间有没有改过东西”。 */
export const writeVersion = (): number => writes;
