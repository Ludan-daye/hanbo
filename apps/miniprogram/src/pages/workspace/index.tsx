import { permissionLabel } from "../../routing/permissionLevels";
import Taro from "@tarojs/taro";
import { View } from "@tarojs/components";

import { AppHeader, BottomNav, Screen, Title } from "../../components/ui/index";
import { RolePanel } from "../../components/role-panels/index";
import { roleHomePanel } from "../../routing/roleHome";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { useSession } from "../../store/session";

export default function Workspace(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const panel = roleHomePanel(state.me?.roles.highestRoleCode ?? null);
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
      <RolePanel panel={panel} />
      <BottomNav active="workspace" />
    </Screen>
  );
}
