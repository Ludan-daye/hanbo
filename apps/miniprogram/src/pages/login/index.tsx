import { Input, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useEffect, useState } from "react";

import {
  AppHeader,
  AppIcon,
  Button,
  Notice,
  Screen,
  Subtitle,
  type IconName,
} from "../../components/ui/index";
import { ACCESS_TOKEN_KEY, FRONTEND_DEMO, TEST_LOGIN_ENABLED } from "../../config/env";
import { devLogin, loginWithWechat, loginTestAccount, type TestAccountCode } from "../../services/auth";
import { useSession } from "../../store/session";
import { sessionEntryUrl } from "../../routing/session";

import "./index.scss";

type DemoRole = {
  readonly code: TestAccountCode;
  readonly label: string;
  readonly sub: string;
  readonly icon: IconName;
};
const DEMO_ROLES: readonly DemoRole[] = [
  {
    code: "dev-worker",
    label: "一级 · 普通工人",
    sub: "工人权限 · 本人考勤与补卡",
    icon: "user",
  },
  {
    code: "dev-team",
    label: "二级 · 班组长",
    sub: "工人权限 · 班组考勤与审批",
    icon: "people",
  },
  {
    code: "dev-project",
    label: "三级 · 项目管理员",
    sub: "管理人员权限 · 项目人员与排班",
    icon: "building",
  },
  {
    code: "dev-company",
    label: "四级 · 公司管理员",
    sub: "管理人员权限 · 公司项目与报表",
    icon: "chart",
  },
  {
    code: "dev-system",
    label: "五级 · 超级管理员",
    sub: "管理人员权限 · 平台与账号",
    icon: "shield",
  },
];
const nativeWechatLogin: boolean = process.env.TARO_ENV === "weapp";

export default function Login(): JSX.Element {
  const { phase, onLoggedIn, error: sessionError } = useSession();
  const [testPasscode, setTestPasscode] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const redirectForPhase = (): void => {
    if (!Taro.getStorageSync(ACCESS_TOKEN_KEY)) return;
    const url = sessionEntryUrl(phase);
    if (url !== null && url !== "/pages/login/index")
      void Taro.redirectTo({ url });
  };
  useDidShow(redirectForPhase);
  useEffect(redirectForPhase, [phase]);
  const signIn = async (
    action: () => Promise<void>,
    pendingId: string,
  ): Promise<void> => {
    if (busy !== null) return;
    setBusy(pendingId);
    setError(null);
    try {
      await action();
      await onLoggedIn();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "登录失败，请检查网络后重试",
      );
    } finally {
      setBusy(null);
    }
  };
  return (
    <Screen>
      <AppHeader title="瀚渤" />
      <View className="login-intro">
        <View className="login-logo">H</View>
        <View className="login-title">欢迎使用瀚渤</View>
        <Subtitle>项目、人员与考勤，一个入口。</Subtitle>
      </View>
      <View className="login-wechat">
        <Button
          loading={busy !== null}
          disabled={!FRONTEND_DEMO && !nativeWechatLogin}
          onClick={() => {
            if (FRONTEND_DEMO) {
              void signIn(() => devLogin("dev-unbound"), "binding-demo");
              return;
            }
            void signIn(loginWithWechat, "wechat");
          }}
        >
          {FRONTEND_DEMO ? "体验首次登录与绑定" : "微信一键登录"}
        </Button>
        <View className="login-wechat__note">
          {FRONTEND_DEMO
            ? "此入口体验邀请码绑定流程，不关联真实微信。"
            : "必须使用本人微信登录，并填写真实姓名、手机号后绑定档案。"}
        </View>
      </View>
      {!FRONTEND_DEMO && !nativeWechatLogin ? (
        <Notice>请在微信小程序内使用微信登录。</Notice>
      ) : null}
      {(error ?? sessionError) ? (
        <Notice>{error ?? sessionError}</Notice>
      ) : null}
      {FRONTEND_DEMO || TEST_LOGIN_ENABLED ? (
        <>
          <View className="login-section login-section--demo">
            <View className="login-section__title">{FRONTEND_DEMO ? "选择演示身份" : "测试人员登录"}</View>
          </View>
          {TEST_LOGIN_ENABLED ? (
            <View className="ui-field-wrap">
              <View className="ui-field-label">测试口令</View>
              <Input className="ui-field" password value={testPasscode} maxlength={128}
                placeholder="输入口令后，点击下方测试身份"
                onInput={(event) => setTestPasscode(event.detail.value)} />
              <View className="login-wechat__note">共用测试账号，操作会保存到云端测试库。</View>
            </View>
          ) : null}
          <View className="login-roles">
            {DEMO_ROLES.map((role) => (
              <View
                key={role.code}
                className={`login-role ${busy === role.code ? "login-role--busy" : ""}`}
                onClick={() => {
                  void signIn(() => FRONTEND_DEMO ? devLogin(role.code) : loginTestAccount(role.code, testPasscode), role.code);
                }}
              >
                <View className="login-role__icon">
                  <AppIcon name={role.icon} />
                </View>
                <View className="login-role__body">
                  <View className="login-role__title">
                    {busy === role.code ? "正在进入…" : role.label}
                  </View>
                  <View className="login-role__sub">{role.sub}</View>
                </View>
                <View className="login-role__arrow">›</View>
              </View>
            ))}
          </View>
        </>
      ) : null}
      <View className="login-disclaimer">
        {FRONTEND_DEMO ? (
          <>
            绑定演示可使用邀请码 HANBO-DEMO。
            <View>当前数据仅保存在本机。</View>
          </>
        ) : (
          "人员档案与岗位权限由管理员统一分配，请使用本人微信登录。"
        )}
      </View>
    </Screen>
  );
}
