import Taro from "@tarojs/taro";
import { useState } from "react";

import { Button, Field, Screen, Subtitle, Title } from "../../components/ui/index";
import { bindByInvitation } from "../../services/auth";
import { useSession } from "../../store/session";

export default function Bind(): JSX.Element {
  const { refreshMe, clear } = useSession();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    if (busy || code.trim().length === 0) {
      return;
    }
    setBusy(true);
    try {
      await bindByInvitation(code.trim());
      await refreshMe();
      await Taro.redirectTo({ url: "/pages/home/index" });
    } catch {
      await Taro.showToast({ icon: "none", title: "绑定失败:邀请码无效或已使用" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>绑定身份</Title>
      <Subtitle>输入管理员发放的邀请码完成绑定</Subtitle>
      <Field value={code} placeholder="邀请码,如 DEV-BIND-CODE" onInput={setCode} />
      <Button onClick={() => void submit()}>绑定</Button>
      <Button variant="outline" onClick={() => { clear(); void Taro.redirectTo({ url: "/pages/login/index" }); }}>
        退出登录
      </Button>
    </Screen>
  );
}
