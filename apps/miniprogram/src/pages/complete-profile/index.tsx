import Taro, { useDidShow } from "@tarojs/taro";
import { useEffect, useState } from "react";

import { AccountProfileForm } from "../../components/account-profile-form";
import {
  AppHeader,
  Button,
  Notice,
  Say,
  Screen,
  Steps,
} from "../../components/ui/index";
import { WorkEntryNotice } from "../../components/work-entry-notice";
import { ACCESS_TOKEN_KEY, FRONTEND_DEMO } from "../../config/env";
import { sessionEntryUrl } from "../../routing/session";
import { errorMessage } from "../../services/error-messages";
import { useSession } from "../../store/session";

import { ONBOARDING_STEPS, readOnboardingTotal } from "./onboarding-steps";

/** 入场第 1 步：只填姓名和手机号，头像和昵称留到“我的”里。 */
export default function CompleteProfile(): JSX.Element {
  const { state, phase, refreshMe, clear } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState<boolean>(false);
  const [total] = useState<number>(readOnboardingTotal);
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
      setError(errorMessage(cause, "退出失败，请重试。"));
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <Screen header={<AppHeader title="入场登记" />}>
      <Steps current={1} total={total} label={ONBOARDING_STEPS[0]} />
      <Say title="先认识一下你" sub="姓名和手机号要和管理员建的档案一致。" />
      <WorkEntryNotice />
      {state.accountProfile !== null ? (
        <AccountProfileForm
          identityOnly
          inBar
          profile={state.accountProfile}
          submitLabel="保存并继续"
          note={
            FRONTEND_DEMO
              ? "演示资料只保存在本机。"
              : "头像和昵称以后可以在“我的”里设置。"
          }
          onSaved={async (): Promise<void> => {
            await refreshMe();
          }}
        >
          <Button
            variant="text"
            loading={signingOut}
            onClick={() => {
              void signOut();
            }}
          >
            {signingOut ? "退出中…" : "退出登录"}
          </Button>
        </AccountProfileForm>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
    </Screen>
  );
}
