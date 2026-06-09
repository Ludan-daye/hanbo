import Taro, { useDidShow } from "@tarojs/taro";

import { Button, Screen, StateView } from "../../components/ui/index";
import { RolePanel } from "../../components/role-panels/index";
import { roleHomePanel } from "../../routing/roleHome";
import { useSession } from "../../store/session";

export default function Home(): JSX.Element {
  const { phase, state, clear } = useSession();

  useDidShow(() => {
    if (phase === "anonymous") {
      void Taro.redirectTo({ url: "/pages/login/index" });
    } else if (phase === "unbound") {
      void Taro.redirectTo({ url: "/pages/bind/index" });
    }
  });

  if (phase === "loading" || phase === "anonymous" || phase === "unbound") {
    return (
      <Screen>
        <StateView title="加载中…" />
      </Screen>
    );
  }

  const panel = roleHomePanel(state.me?.roles.highestRoleCode ?? null);

  return (
    <Screen>
      <RolePanel panel={panel} />
      <Button variant="outline" onClick={() => { clear(); void Taro.redirectTo({ url: "/pages/login/index" }); }}>
        退出登录
      </Button>
    </Screen>
  );
}
