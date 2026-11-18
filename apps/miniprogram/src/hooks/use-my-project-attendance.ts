import { useEffect } from "react";

import { apiClient } from "../services/client";
import {
  fetchMyProjectAttendance,
  type ProjectAttendance,
} from "../services/project-attendance";
import { chinaToday } from "../services/time";
import { useSession } from "../store/session";
import { useCachedRead } from "./use-cached-read";

const NONE: readonly ProjectAttendance[] = [];

export const useMyProjectAttendance = (
  revision: number,
  refresh: () => void,
): {
  readonly entries: readonly ProjectAttendance[];
  /** 没有可先显示的数据，正在读。有上次的数据时为假，entries 先是上次的。 */
  readonly loading: boolean;
  /** 正显示着上次的数据，同时在核对。 */
  readonly refreshing: boolean;
  /** 最近一次读取失败的原因；entries 仍保留上次读到的。 */
  readonly error: string | null;
  readonly refresh: () => void;
} => {
  const { state, phase } = useSession();
  const userId = state.me?.user.id;
  // 键里带日期：过了零点不拿昨天的安排先显示。
  const { data, loading, refreshing, error } = useCachedRead<
    readonly ProjectAttendance[]
  >(
    userId === undefined || phase !== "ready"
      ? null
      : `${userId}:project-attendance:${chinaToday()}`,
    () => fetchMyProjectAttendance(apiClient),
    revision,
    "无法读取我的项目，请重试。",
  );
  useEffect(() => {
    const remaining = 86_400_000 - ((Date.now() + 8 * 3_600_000) % 86_400_000);
    const timer = setTimeout(refresh, remaining + 100);
    return () => clearTimeout(timer);
  }, [refresh, revision]);
  return {
    entries: data ?? NONE,
    // 会话还没就绪时也算读取中，和原来一致。
    loading: loading || (data === null && error === null),
    refreshing,
    error,
    refresh,
  };
};
