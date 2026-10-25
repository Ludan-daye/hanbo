import { View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useEffect, useState } from "react";

import {
  AppHeader,
  AppIcon,
  Button,
  Field,
  ListItem,
  Notice,
  Screen,
  Subtitle,
  Title,
} from "../../components/ui/index";
import { ACCESS_TOKEN_KEY, FRONTEND_DEMO } from "../../config/env";
import { PANEL_LABELS } from "../../routing/features";
import { roleHomePanel } from "../../routing/roleHome";
import { bindByInvitation } from "../../services/auth";
import { useSession } from "../../store/session";

import "./index.scss";

export default function Bind(): JSX.Element {
  const { state, phase, refreshMe, clear } = useSession();
  const [code, setCode] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [bindingComplete, setBindingComplete] = useState<boolean>(false);
  const bound: boolean = bindingComplete || state.me?.user.isBound === true;
  const guard = (): void => {
    if (phase === "anonymous" || !Taro.getStorageSync(ACCESS_TOKEN_KEY)) {
      void Taro.reLaunch({ url: "/pages/login/index" });
      return;
    }
    if (phase === "profile-required")
      void Taro.reLaunch({ url: "/pages/complete-profile/index" });
  };
  useDidShow(guard);
  useEffect(guard, [phase]);

  const submit = async (): Promise<void> => {
    if (busy || bound || phase !== "unbound") return;
    if (code.trim().length === 0) {
      setError("请填写管理员提供的本人专属邀请码。");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await bindByInvitation(code.trim());
      setBindingComplete(true);
      setCode("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "绑定失败，请确认邀请码后重试。",
      );
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
      await Taro.reLaunch({ url: "/pages/home/index" });
    } catch (cause: unknown) {
      setError(
        cause instanceof Error
          ? cause.message
          : "读取绑定信息失败，请重新登录查看。",
      );
    } finally {
      setBusy(false);
    }
  };
  const signOut = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      await clear();
    } catch (cause: unknown) {
      await Taro.showToast({
        icon: "none",
        title:
          cause instanceof Error
            ? cause.message
            : "会话退出失败，本机登录已清除。",
      });
    } finally {
      await Taro.reLaunch({ url: "/pages/login/index" });
    }
  };
  return (
    <Screen>
      <AppHeader title={bound ? "账号绑定" : "绑定本人档案"} />
      <View className="binding-steps">
        <View className="binding-step binding-step--done">
          <View className="binding-step__number">✓</View>
          {FRONTEND_DEMO ? "演示登录" : "微信登录"}
        </View>
        <View className="binding-step__line" />
        <View
          className={`binding-step ${bound ? "binding-step--done" : "binding-step--active"}`}
        >
          <View className="binding-step__number">{bound ? "✓" : "2"}</View>
          绑定档案
        </View>
        <View className="binding-step__line" />
        <View className="binding-step">
          <View className="binding-step__number">3</View>进入项目
        </View>
      </View>
      <View className="bind-intro">
        <View
          className={`profile-avatar ${bound ? "binding-success-icon" : ""}`}
        >
          <AppIcon name={bound ? "check" : "invite"} />
        </View>
        <Title>{bound ? "本人档案已绑定" : "连接你的工作现场"}</Title>
        <Subtitle>
          {bound ? (
            "登录账号已关联人员档案，可以进入项目开始工作。"
          ) : (
            <>
              已完成{FRONTEND_DEMO ? "演示" : "微信"}登录，
              <View>输入本人专属邀请码，关联项目人员档案。</View>
            </>
          )}
        </Subtitle>
      </View>
      {FRONTEND_DEMO ? (
        <Notice>
          当前为演示绑定，不关联真实微信。
          {bound ? "绑定结果保存在本机。" : "可使用演示邀请码 HANBO-DEMO。"}
        </Notice>
      ) : null}
      {bound ? (
        <>
          <View className="form-card">
            <ListItem
              primary="人员档案"
              secondary={
                state.me?.profile.type === "MANAGER"
                  ? "管理人员档案"
                  : state.me?.profile.type === "WORKER"
                    ? "工人档案"
                    : "档案关联成功"
              }
              chip="已绑定"
            />
            {state.me?.roles.highestRoleCode ? (
              <ListItem
                primary="当前身份"
                secondary={
                  PANEL_LABELS[roleHomePanel(state.me.roles.highestRoleCode)]
                }
              />
            ) : null}
            <Subtitle>
              再次使用同一账号登录会自动识别身份，岗位和项目权限由管理员分配。
            </Subtitle>
          </View>
          <Button
            loading={busy}
            onClick={() => {
              void enterProject();
            }}
          >
            进入工作台
          </Button>
        </>
      ) : (
        <View className="form-card">
          <Field
            label="本人专属邀请码"
            value={code}
            placeholder="请输入管理员提供的邀请码"
            onInput={(value: string): void => {
              setCode(value);
              setError(null);
            }}
          />
          <View className="binding-help">
            请向管理员领取对应本人档案的邀请码，绑定后将按该档案分配权限。
          </View>
          <Button
            loading={busy}
            onClick={() => {
              void submit();
            }}
          >
            绑定本人档案
          </Button>
        </View>
      )}
      {error ? <Notice>{error}</Notice> : null}
      <Button
        variant="outline"
        disabled={busy}
        onClick={() => {
          void signOut();
        }}
      >
        {FRONTEND_DEMO ? "退出并返回演示登录" : "退出当前微信账号"}
      </Button>
      <View className="page-footnote">
        {bound
          ? "如档案信息有误，请联系管理员核实。"
          : "邀请码仅供本人使用，过期或失效请联系管理员重新获取。"}
      </View>
    </Screen>
  );
}
