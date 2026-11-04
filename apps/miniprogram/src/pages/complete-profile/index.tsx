import { View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useEffect, useState } from "react";

import { Button, Notice, Subtitle, Title } from "../../components/ui/index";
import { AccountProfileForm } from "../../components/account-profile-form";
import { FlowScreen } from "../../components/worker-flow";
import { ACCESS_TOKEN_KEY, FRONTEND_DEMO } from "../../config/env";
import { sessionEntryUrl } from "../../routing/session";
import { useSession } from "../../store/session";
import { WorkEntryNotice } from "../../components/work-entry-notice";

import "./index.scss";

export default function CompleteProfile(): JSX.Element {
  const { state, phase, refreshMe, clear } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState<boolean>(false);
  const guard = (): void => {
    const url: string | null = Taro.getStorageSync(ACCESS_TOKEN_KEY)
      ? sessionEntryUrl(phase)
      : "/pages/login/index";
    if (url !== null && url !== "/pages/complete-profile/index")
      void Taro.reLaunch({ url });
  };
  useDidShow(guard);
  useEffect(guard, [phase]);

  const signOut = async (): Promise<void> => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await clear();
      await Taro.reLaunch({ url: "/pages/login/index" });
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "退出失败，请重试。");
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <FlowScreen title="完善本人资料" enabled root>
      <View className="complete-profile-intro">
        <Title>先认识一下你</Title>
        <Subtitle>完善资料，绑定本人档案。</Subtitle>
      </View>
      <WorkEntryNotice />
      <View className="complete-profile-form">
        {state.accountProfile !== null ? (
          <AccountProfileForm
            appearance="worker"
            profile={state.accountProfile}
            submitLabel="保存并继续"
            onSaved={async (): Promise<void> => {
              await refreshMe();
            }}
          />
        ) : null}
      </View>
      <View className="complete-profile-note">
        {FRONTEND_DEMO
          ? "演示资料仅保存在本机。"
          : "填写本人资料。微信头像不用于考勤核验。"}
      </View>
      {error ? <Notice>{error}</Notice> : null}
      <Button
        variant="outline"
        loading={signingOut}
        onClick={() => {
          void signOut();
        }}
      >
        退出登录
      </Button>
    </FlowScreen>
  );
}
