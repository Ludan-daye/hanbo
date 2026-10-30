import { useEffect, useState } from "react";
import { fetchMyRoleScopes } from "../../services/management";
import type { WorkRoleScope } from "../../services/management.types";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import {
  permissionLabel,
  permissionLevel,
} from "../../routing/permissionLevels";
import Taro from "@tarojs/taro";
import { Picker, View } from "@tarojs/components";

import {
  AppHeader,
  BottomNav,
  ListItem,
  Screen,
  StateView,
  Title,
} from "../../components/ui/index";
import { RolePanel } from "../../components/role-panels/index";
import { roleHomePanel } from "../../routing/roleHome";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { useSession } from "../../store/session";

export default function Workspace(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const { revision, refresh } = usePageRefresh();
  const [scopes, setScopes] = useState<readonly WorkRoleScope[] | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = (scope: WorkRoleScope): string =>
    `${scope.roleCode}:${scope.scopeId}`;
  useEffect(() => {
    let cancelled = false;
    setError(null);
    void fetchMyRoleScopes()
      .then((rows) => {
        if (!cancelled) setScopes(rows);
      })
      .catch((cause: unknown) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : "读取工作范围失败");
      });
    return () => {
      cancelled = true;
    };
  }, [revision, state.me?.user.id]);
  const selected =
    scopes?.find((scope) => key(scope) === selectedKey) ?? scopes?.[0];
  const panel = roleHomePanel(selected?.roleCode ?? null);
  return (
    <Screen>
      <AppHeader title="工作台" />
      <View className="page-intro">
        <Title>全部功能</Title>
        <View className="ui-subtitle">
          {permissionLabel(state.me?.roles.highestRoleCode ?? null)}
        </View>
      </View>
      <View
        className="management-link"
        onClick={() => {
          void Taro.navigateTo({ url: "/pages/permission-levels/index" });
        }}
      >
        权限等级与功能 ›
      </View>
      <ListItem
        primary="打卡流程测试"
        secondary="定位 → 现场拍照 → 活体人脸识别"
        chip="开始测试"
        onClick={() => {
          void Taro.navigateTo({ url: "/pages/punch-test/index" });
        }}
      />
      {error ? (
        <StateView title="加载失败" sub={error} onRetry={refresh} />
      ) : scopes === null ? (
        <StateView title="加载中…" />
      ) : (
        <>
          {scopes.length > 0 ? (
            <Picker
              mode="selector"
              range={scopes.map(
                (scope) =>
                  `${permissionLevel(scope.roleCode).name} · ${scope.scopeName}`,
              )}
              value={scopes.findIndex((scope) => key(scope) === key(selected!))}
              onChange={(event) =>
                setSelectedKey(key(scopes[Number(event.detail.value)]!))
              }
            >
              <ListItem
                primary="当前工作职级与范围"
                secondary={`${permissionLevel(selected!.roleCode).name} · ${selected!.scopeName}`}
                chip="切换"
              />
            </Picker>
          ) : null}
          <RolePanel panel={panel} scope={selected} />
        </>
      )}
      <BottomNav active="workspace" />
    </Screen>
  );
}
