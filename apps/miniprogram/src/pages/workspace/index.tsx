import { View } from "@tarojs/components";

import {
  AppHeader,
  BottomNav,
  Label,
  Screen,
  Subtitle,
  Title,
} from "../../components/ui/index";
import { RolePanel } from "../../components/role-panels/index";
import { PANEL_LABELS } from "../../routing/features";
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
        <Label>HANBO WORKSPACE</Label>
        <Title>让工作，更有序</Title>
        <Subtitle>为{PANEL_LABELS[panel]}提供的全部工作应用</Subtitle>
      </View>
      <RolePanel panel={panel} />
      <View className="page-footnote">瀚渤智慧工地 · 每一份付出，都有记录</View>
      <BottomNav active="workspace" />
    </Screen>
  );
}
