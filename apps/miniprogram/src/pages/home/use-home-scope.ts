import Taro from "@tarojs/taro";
import { useState } from "react";

import { API_BASE_URL, FRONTEND_DEMO } from "../../config/env";
import { useCachedRead } from "../../hooks/use-cached-read";
import type { MeResponse } from "../../services/auth.types";
import { fetchMyRoleScopes } from "../../services/management";
import type { WorkRoleScope } from "../../services/management.types";

import { resolveHomeScope } from "./home-model";

const readStored = (key: string): string | null => {
  try {
    const stored: unknown = Taro.getStorageSync(key);
    return typeof stored === "string" && stored.length > 0 ? stored : null;
  } catch {
    // 本机存储用不了时，照常用默认范围。
    return null;
  }
};

export type HomeScope = {
  /** 这个职级能选的范围；null 表示还没读到。 */
  readonly available: readonly WorkRoleScope[] | null;
  /** 当前范围。列表没读到时名字是空的，只有编号能用。 */
  readonly scope: WorkRoleScope | null;
  /** 范围列表还在读，而且没有上次的可以先用。 */
  readonly loading: boolean;
  readonly refreshing: boolean;
  readonly error: string | null;
  readonly choosing: boolean;
  /** 能换的时候才有（多于一个范围）。 */
  readonly startChoosing: (() => void) | undefined;
  readonly stopChoosing: () => void;
  readonly choose: (scope: WorkRoleScope) => void;
  /** 换好了，但这次没能记在本机。 */
  readonly notRemembered: boolean;
};

/**
 * 首页看哪个班组、哪个项目、哪家公司：默认第一个，可以在页头切换，选择记在本机。
 * 这个选择只属于首页，不改工作台和其它页面。
 */
export const useHomeScope = (input: {
  readonly me: MeResponse;
  readonly roleCode: WorkRoleScope["roleCode"];
  readonly scopeType: WorkRoleScope["scopeType"];
  readonly revision: number;
  /** 班组长的班组以读回来的列表为准，列表到之前不先猜。 */
  readonly waitForList?: boolean;
}): HomeScope => {
  const { me, roleCode, scopeType, revision, waitForList } = input;
  const userId = me.user.id;
  const storageKey = `homeScope:v1:${JSON.stringify([
    FRONTEND_DEMO ? "demo" : "http",
    API_BASE_URL.replace(/\/+$/, ""),
    userId,
    roleCode,
  ])}`;
  const [preferredId, setPreferredId] = useState<string | null>(() =>
    readStored(storageKey),
  );
  const [choosing, setChoosing] = useState<boolean>(false);
  const [notRemembered, setNotRemembered] = useState<boolean>(false);
  const list = useCachedRead<readonly WorkRoleScope[]>(
    `${userId}:role-scopes`,
    fetchMyRoleScopes,
    revision,
    "工作范围没读到，请重试。",
  );
  const { available, scope } = resolveHomeScope({
    roleCode,
    scopeType,
    scopes: list.data,
    sessionIds: waitForList
      ? []
      : me.roles.assignments
          .filter(
            (assignment) =>
              assignment.roleCode === roleCode &&
              assignment.scope.scopeType === scopeType,
          )
          .map((assignment) => assignment.scope.scopeId),
    preferredId,
  });
  const canChoose = available !== null && available.length > 1;
  return {
    available,
    scope,
    loading: list.loading,
    refreshing: list.refreshing,
    error: list.error,
    choosing: choosing && canChoose,
    startChoosing: canChoose ? () => setChoosing(true) : undefined,
    stopChoosing: () => setChoosing(false),
    choose: (next) => {
      setPreferredId(next.scopeId);
      setChoosing(false);
      try {
        Taro.setStorageSync(storageKey, next.scopeId);
        setNotRemembered(false);
      } catch {
        setNotRemembered(true);
      }
    },
    notRemembered,
  };
};
