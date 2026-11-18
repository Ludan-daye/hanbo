import { useCallback, useRef, useState } from "react";

export type ActionGuard = {
  /** 上一次还没结束时再触发，直接忽略并返回 undefined。 */
  readonly run: <T>(action: () => Promise<T>) => Promise<T | undefined>;
  readonly busy: () => boolean;
};

/** 防连点：同一时间只让一个操作在跑。失败后放开，可以再试。 */
export const createActionGuard = (): ActionGuard => {
  let running = false;
  return {
    busy: () => running,
    run: async <T>(action: () => Promise<T>): Promise<T | undefined> => {
      if (running) return undefined;
      running = true;
      try {
        return await action();
      } finally {
        running = false;
      }
    },
  };
};

/** 提交类按钮用：busy 为真时把按钮置灰并把文案换成“…中”。 */
export const useAction = (): {
  readonly busy: boolean;
  readonly run: <T>(action: () => Promise<T>) => Promise<T | undefined>;
} => {
  const guard = useRef<ActionGuard | null>(null);
  if (guard.current === null) guard.current = createActionGuard();
  const [busy, setBusy] = useState<boolean>(false);
  const run = useCallback(
    <T>(action: () => Promise<T>): Promise<T | undefined> =>
      guard.current!.run(async () => {
        setBusy(true);
        try {
          return await action();
        } finally {
          setBusy(false);
        }
      }),
    [],
  );
  return { busy, run };
};
