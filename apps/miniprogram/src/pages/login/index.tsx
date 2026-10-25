import { View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useEffect, useState } from "react";

import {
  AppHeader,
  AppIcon,
  Button,
  Label,
  Notice,
  Screen,
  Subtitle,
  type IconName,
} from "../../components/ui/index";
import { ACCESS_TOKEN_KEY, FRONTEND_DEMO } from "../../config/env";
import { devLogin, loginWithWechat } from "../../services/auth";
import { useSession } from "../../store/session";
import { sessionEntryUrl } from "../../routing/session";

import "./index.scss";

type DemoRole = {
  readonly code: string;
  readonly label: string;
  readonly sub: string;
  readonly icon: IconName;
};
const DEMO_ROLES: readonly DemoRole[] = [
  {
    code: "dev-worker",
    label: "工人",
    sub: "考勤打卡 · 补卡申请",
    icon: "user",
  },
  {
    code: "dev-team",
    label: "班组长",
    sub: "团队考勤 · 补卡审批",
    icon: "people",
  },
  {
    code: "dev-project",
    label: "项目管理员",
    sub: "人员管理 · 排班报表",
    icon: "building",
  },
  {
    code: "dev-company",
    label: "公司管理员",
    sub: "项目总览 · 公司报表",
    icon: "chart",
  },
  {
    code: "dev-system",
    label: "系统管理员",
    sub: "公司管理 · 账号权限",
    icon: "shield",
  },
];
const nativeWechatLogin: boolean = process.env.TARO_ENV === "weapp";

export default function Login(): JSX.Element {
  const { phase, onLoggedIn, error: sessionError } = useSession();
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
      <AppHeader title="瀚渤智慧工地" />
      <View className="login-intro">
        <View className="login-logo">
          <AppIcon name="building" />
        </View>
        <Label>HANBO SMART SITE</Label>
        <View className="login-title">
          让每一份付出<View>都有记录。</View>
        </View>
        <Subtitle>连接项目与每一个你，让工作简单而有序。</Subtitle>
        <View className="login-illustration">
          <View className="login-orbit" />
          <View className="login-building login-building--one" />
          <View className="login-building login-building--two" />
          <View className="login-building login-building--three" />
          <View className="login-check">
            <AppIcon name="check" />
          </View>
          <View className="login-float">工作有序 · 平安每一天</View>
        </View>
      </View>
      <View className="login-section">
        <View className="login-section__title">登录，连接你的工作现场</View>
        <View className="login-section__tag">
          {FRONTEND_DEMO ? "演示体验" : "微信登录"}
        </View>
      </View>
      <View className="login-wechat">
        <View className="login-wechat__heading">
          <View className="login-wechat__icon">
            <AppIcon name="shield" />
          </View>
          <View>
            <View className="login-wechat__title">微信登录与身份绑定</View>
            <View className="login-wechat__sub">
              微信登录 → 完善头像昵称 → 绑定本人档案
            </View>
          </View>
        </View>
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
            : "首次登录须选择头像并填写昵称，再使用邀请码绑定本人档案。已保存的资料无需重复填写。"}
        </View>
      </View>
      {!FRONTEND_DEMO && !nativeWechatLogin ? (
        <Notice>请在微信小程序内使用微信登录。</Notice>
      ) : null}
      {(error ?? sessionError) ? (
        <Notice>{error ?? sessionError}</Notice>
      ) : null}
      {FRONTEND_DEMO ? (
        <>
          <View className="login-section login-section--demo">
            <View className="login-section__title">已有身份，快速体验</View>
            <View className="login-section__tag">演示账号</View>
          </View>
          <View className="login-roles">
            {DEMO_ROLES.map((role) => (
              <View
                key={role.code}
                className={`login-role ${busy === role.code ? "login-role--busy" : ""}`}
                onClick={() => {
                  void signIn(() => devLogin(role.code), role.code);
                }}
              >
                <View className="login-role__icon">
                  <AppIcon name={role.icon} />
                </View>
                <View className="login-role__title">
                  {busy === role.code ? "正在进入…" : role.label}
                </View>
                <View className="login-role__sub">{role.sub}</View>
                <View className="login-role__arrow">↗</View>
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
      <View className="page-footnote">HANBO · SMART CONSTRUCTION</View>
    </Screen>
  );
}
