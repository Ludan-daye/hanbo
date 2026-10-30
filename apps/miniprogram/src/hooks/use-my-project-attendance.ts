import { useEffect, useState } from "react";

import { apiClient } from "../services/client";
import {
  fetchMyProjectAttendance,
  type ProjectAttendance,
} from "../services/project-attendance";
import { useSession } from "../store/session";

export const useMyProjectAttendance = (
  revision: number,
  refresh: () => void,
): {
  readonly entries: readonly ProjectAttendance[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly refresh: () => void;
} => {
  const { state, phase } = useSession();
  const [entries, setEntries] = useState<readonly ProjectAttendance[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const userId = state.me?.user.id;
  useEffect(() => {
    if (userId === undefined || phase !== "ready") return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setEntries([]);
    void fetchMyProjectAttendance(apiClient)
      .then(
        (result) => {
          if (!cancelled) setEntries(result);
        },
        (reason: unknown) => {
          if (!cancelled)
            setError(
              reason instanceof Error
                ? reason.message
                : "无法读取我的项目，请重试。",
            );
        },
      )
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, phase, revision]);
  useEffect(() => {
    const remaining = 86_400_000 - ((Date.now() + 8 * 3_600_000) % 86_400_000);
    const timer = setTimeout(refresh, remaining + 100);
    return () => clearTimeout(timer);
  }, [refresh, revision]);
  return { entries, loading, error, refresh };
};
