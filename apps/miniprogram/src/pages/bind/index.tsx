import { View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useEffect, useState } from "react";

import { AccountProfileForm } from "../../components/account-profile-form";
import {
  AppHeader,
  BottomBar,
  Button,
  FormError,
  FormInput,
  Links,
  Notice,
  PageHeader,
  Row,
  Say,
  Screen,
  Sheet,
  Stamp,
  Steps,
} from "../../components/ui/index";
import { ACCESS_TOKEN_KEY, FRONTEND_DEMO } from "../../config/env";
import { bindByInvitation } from "../../services/auth";
import { errorMessage } from "../../services/error-messages";
import { joinTemporaryTask } from "../../services/team-work";
import { chinaToday } from "../../services/time";
import { useSession } from "../../store/session";
import {
  ONBOARDING_STEPS,
  readOnboardingTotal,
} from "../complete-profile/onboarding-steps";

import { archiveLabel, nextStepLabel, roleLabel } from "./bind-view";
import "./index.scss";

/** 入场第 2 步：输邀请码绑定本人档案。绑好之后（以及以后从“我的”进来）看到的是盖了章的结果。 */
export default function Bind(): JSX.Element {
  const { state, phase, refreshMe, clear } = useSession();
  const [editingProfile, setEditingProfile] = useState<boolean>(false);
  const [code, setCode] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const [signingOut, setSigningOut] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [bindingComplete, setBindingComplete] = useState<boolean>(false);
  const [total] = useState<number>(readOnboardingTotal);
  // 入场时这一页是重新打开的，前面没有页面；从“我的”点进来才有上一页，页头带返回。
  const [entered] = useState<boolean>(() => Taro.getCurrentPages().length > 1);
  const bound: boolean = bindingComplete || state.me?.user.isBound === true;
  const guard = (): void => {
    if (phase === "anonymous" || !Taro.getStorageSync(ACCESS_TOKEN_KEY)) {
      void Taro.reLaunch({ url: "/pages/login/index" });
      return;
    }
    if (phase === "profile-required")
      void Taro.reLaunch({ url: "/pages/complete-profile/index" });
    if (phase === "worker-registration-required")
      void Taro.reLaunch({ url: "/pages/worker-registration/index" });
    if (phase === "face-enrollment-required")
      void Taro.reLaunch({ url: "/pages/face-profile/index?onboarding=1" });
  };
  useDidShow(guard);
  useEffect(guard, [phase]);

  const submit = async (): Promise<void> => {
    if (busy || bound || phase !== "unbound") return;
    if (code.trim().length === 0) {
      setError("请输入本人专属邀请码。");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (/^\d{6}$/.test(code.trim())) await joinTemporaryTask(code.trim());
      else await bindByInvitation(code.trim());
      setBindingComplete(true);
      setCode("");
    } catch (cause) {
      setError(errorMessage(cause, "绑定失败，请确认邀请码后重试。"));
    } finally {
      setBusy(false);
    }
  };
  const enterProject = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const me = await refreshMe();
      if (!me.user.isBound)
        throw new Error("尚未确认档案绑定结果，请重试或联系管理员。");
      await Taro.reLaunch({
        url:
          me.profile.type === "WORKER"
            ? "/pages/worker-registration/index"
            : "/pages/home/index",
      });
    } catch (cause: unknown) {
      setError(errorMessage(cause, "读取绑定信息失败，请重新登录查看。"));
    } finally {
      setBusy(false);
    }
  };
  const signOut = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setSigningOut(true);
    try {
      await clear();
    } catch (cause: unknown) {
      await Taro.showToast({
        icon: "none",
        title: errorMessage(cause, "会话退出失败，本机登录已清除。"),
      });
    } finally {
      await Taro.reLaunch({ url: "/pages/login/index" });
    }
  };

  const account = state.accountProfile;
  const header = entered ? (
    <PageHeader title="档案绑定" />
  ) : (
    <AppHeader title="入场登记" />
  );
  const steps = entered ? null : (
    <Steps current={2} total={total} label={ONBOARDING_STEPS[1]} />
  );
  const signOutButton = (
    <Button
      variant="text"
      disabled={busy}
      onClick={() => {
        void signOut();
      }}
    >
      {signingOut ? "退出中…" : "退出登录"}
    </Button>
  );

  // 改本人资料是单独一屏：它有自己的“保存”，不和“确认绑定”挤在一起。
  if (editingProfile && !bound && account !== null)
    return (
      <Screen
        header={
          <PageHeader
            title="本人资料"
            onBack={() => setEditingProfile(false)}
          />
        }
      >
        <Say
          title="核对姓名和手机号"
          sub="要和管理员建的档案一致，不然绑不上。"
        />
        <AccountProfileForm
          identityOnly
          inBar
          profile={account}
          submitLabel="保存本人资料"
          note="保存之后回到上一屏，接着输邀请码。"
          onSaved={async (): Promise<void> => {
            await refreshMe();
            setEditingProfile(false);
            setError(null);
          }}
        >
          <Button variant="outline" onClick={() => setEditingProfile(false)}>
            取消
          </Button>
        </AccountProfileForm>
      </Screen>
    );

  if (bound) {
    const me = state.me;
    // 刚绑好时手里的身份还是绑定前的，进不进首页先按登录时走的入口估计；点了按钮会重新读。
    const goesHome: boolean =
      me?.user.isBound === true ? me.profile.type !== "WORKER" : total === 2;
    const role = me?.roles.highestRoleCode ?? null;
    return (
      <Screen header={header}>
        {steps}
        <Stamp
          size="lg"
          play
          text="已绑定"
          sub={bindingComplete ? chinaToday().slice(5) : undefined}
        />
        <Say center title="档案绑好了" sub="资料有误，请联系管理员核实。" />
        <Sheet gap>
          <Row title="姓名">
            <View className="bind-name">{account?.realName ?? "本人档案"}</View>
          </Row>
          <Row title="手机号" value={account?.phoneMasked ?? "已登记"} />
          <Row
            title="人员档案"
            value={archiveLabel(me?.profile.type ?? null)}
          />
          {role !== null ? <Row title="权限" value={roleLabel(role)} /> : null}
        </Sheet>
        {FRONTEND_DEMO ? (
          <Notice>演示里的绑定只保存在本机，不关联真实微信。</Notice>
        ) : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Links>{signOutButton}</Links>
        <BottomBar
          primary={
            busy && !signingOut
              ? "读取中…"
              : nextStepLabel({
                  goesHome,
                  entered,
                  registrationComplete:
                    account?.workerRegistration === "COMPLETE",
                })
          }
          busy={busy}
          onPrimary={() => {
            void enterProject();
          }}
        />
      </Screen>
    );
  }

  const codeMissing: boolean = error !== null && code.trim().length === 0;
  return (
    <Screen header={header}>
      {steps}
      <Say title="输入邀请码" sub="邀请码由班组长或管理员给你，只能本人用。" />
      <Sheet gap>
        <FormInput
          label="邀请码"
          required
          value={code}
          placeholder="请输入邀请码"
          disabled={busy}
          error={codeMissing}
          onInput={(next: string): void => {
            setCode(next);
            setError(null);
          }}
        />
      </Sheet>
      {codeMissing && error ? <FormError>{error}</FormError> : null}
      <Sheet gap>
        <Row
          title="本人资料"
          sub={`${account?.realName ?? "姓名没填"} ${account?.phoneMasked ?? "手机号没填"}`}
          onClick={busy ? undefined : () => setEditingProfile(true)}
        >
          <View className="bind-edit">修改</View>
        </Row>
      </Sheet>
      <Notice>
        档案邀请码和六位临时工邀请码都在这里输。失效了找班组长或管理员重新领。
      </Notice>
      {FRONTEND_DEMO ? (
        <Notice>
          {
            "演示用的邀请码是 HANBO-DEMO。绑定前先把本人资料改成“待入场成员”，手机号 13800000006。"
          }
        </Notice>
      ) : null}
      {error && !codeMissing ? <Notice tone="error">{error}</Notice> : null}
      <BottomBar
        primary={
          busy && !signingOut ? "绑定中…" : error ? "重新绑定" : "确认绑定"
        }
        busy={busy}
        onPrimary={() => {
          void submit();
        }}
      >
        {signOutButton}
      </BottomBar>
    </Screen>
  );
}
