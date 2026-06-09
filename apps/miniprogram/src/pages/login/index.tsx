import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";

import { Button, Label, Screen, Subtitle, Title } from "../../components/ui/index";
import { devLogin } from "../../services/auth";
import { useSession } from "../../store/session";

const DEMO_ROLES: ReadonlyArray<{ code: string; label: string }> = [
  { code: "dev-worker", label: "工人" },
  { code: "dev-team", label: "班组长" },
  { code: "dev-project", label: "项目管理员" },
  { code: "dev-company", label: "公司管理员" },
  { code: "dev-system", label: "系统管理员" },
  { code: "dev-unbound", label: "未绑定用户(测绑定流程)" }
];

export default function Login(): JSX.Element {
  const { phase, onLoggedIn } = useSession();
  const [busy, setBusy] = useState(false);

  useDidShow(() => {
    if (phase === "ready" || phase === "norole") {
      void Taro.redirectTo({ url: "/pages/home/index" });
    } else if (phase === "unbound") {
      void Taro.redirectTo({ url: "/pages/bind/index" });
    }
  });

  const pick = async (code: string): Promise<void> => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      await devLogin(code);
      await onLoggedIn();
      await Taro.redirectTo({ url: "/pages/home/index" });
    } catch {
      await Taro.showToast({ icon: "none", title: "登录失败，请重试" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Label>工地考勤</Label>
      <Title>今天打卡了吗?</Title>
      <Subtitle>开发态登录:选择一个演示身份直接进入</Subtitle>
      {DEMO_ROLES.map((r) => (
        <Button key={r.code} variant={r.code === "dev-worker" ? "primary" : "outline"} onClick={() => void pick(r.code)}>
          {r.label}
        </Button>
      ))}
    </Screen>
  );
}
