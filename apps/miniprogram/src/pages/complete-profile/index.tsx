import { View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useEffect, useState } from "react";

import {
  AppHeader,
  AppIcon,
  Button,
  Notice,
  Screen,
  Section,
  Subtitle,
  Title,
} from "../../components/ui/index";
import { AccountProfileForm } from "../../components/account-profile-form";
import { ACCESS_TOKEN_KEY, FRONTEND_DEMO } from "../../config/env";
import { sessionEntryUrl } from "../../routing/session";
import { useSession } from "../../store/session";

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
    <Screen>
      <AppHeader title="完善账号资料" />
      <View className="complete-profile-intro">
        <View className="complete-profile-icon">
          <AppIcon name="user" />
        </View>
        <Title>先认识一下你</Title>
        <Subtitle>完成本人资料后，绑定档案并进入项目。</Subtitle>
      </View>
      <Section title="本人资料" sub="头像、昵称、真实姓名和手机号均为必填">
        {state.accountProfile !== null ? (
          <AccountProfileForm
            profile={state.accountProfile}
            submitLabel="保存并继续"
            onSaved={async (): Promise<void> => {
              await refreshMe();
            }}
          />
        ) : null}
      </Section>
      <View className="complete-profile-note">
        {FRONTEND_DEMO
          ? "当前为演示账号，资料只保存在本机。"
          : "请使用本人微信，并填写本人真实姓名和手机号。资料用于关联人员档案；头像不作为考勤人脸核验依据。"}
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
    </Screen>
  );
}
