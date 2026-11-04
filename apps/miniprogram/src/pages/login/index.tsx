import { Button as TaroButton, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useEffect, useState } from "react";

import {
  AppIcon,
  Button,
  Notice,
  type IconName,
} from "../../components/ui/index";
import {
  ACCESS_TOKEN_KEY,
  FRONTEND_DEMO,
  TEST_LOGIN_ENABLED,
} from "../../config/env";
import {
  devLogin,
  loginWithWechat,
  loginTestAccount,
  type TestAccountCode,
} from "../../services/auth";
import { FlowScreen } from "../../components/worker-flow";
import { prepareDemoWorkerPreview } from "../../services/demo/client";
import { useSession } from "../../store/session";
import { sessionEntryUrl } from "../../routing/session";
import {
  clearWorkEntry,
  saveWorkEntry,
  WORK_ENTRY_OPTIONS,
  type WorkEntry,
} from "../../services/work-entry";

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
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [workEntry, setWorkEntry] = useState<WorkEntry | null>(null);
  const [showTestAccounts, setShowTestAccounts] = useState<boolean>(true);
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
  const signInWorker = (): void => {
    if (workEntry === null) return;
    void signIn(async (): Promise<void> => {
      saveWorkEntry(workEntry);
      if (FRONTEND_DEMO) {
        prepareDemoWorkerPreview();
        await devLogin("dev-worker");
      } else await loginWithWechat();
    }, "worker");
  };
  const signInManager = (): void => {
    void signIn(async (): Promise<void> => {
      clearWorkEntry();
      if (FRONTEND_DEMO) await devLogin("dev-project");
      else await loginWithWechat();
    }, "manager");
  };
  return (
    <FlowScreen title="瀚渤" enabled root>
      <View className="login-intro">
        <View className="login-logo">
          <AppIcon name="building" />
        </View>
        <View className="login-title">欢迎使用瀚渤</View>
      </View>
      <View className="login-entry-heading">请选择用工入口</View>
      <View className="login-entries">
        {WORK_ENTRY_OPTIONS.map((entry) => (
          <TaroButton
            key={entry.value}
            className={`login-entry${workEntry === entry.value ? " login-entry--selected" : ""}`}
            disabled={busy !== null}
            onClick={() => {
              setWorkEntry(entry.value);
              setError(null);
            }}
          >
            <View className="login-entry__icon">
              <AppIcon
                name={entry.value === "LONG_TERM" ? "building" : "clock"}
              />
            </View>
            <View className="login-entry__body">
              <View className="login-entry__title">{entry.label}</View>
              <View className="login-entry__description">
                {entry.description}
              </View>
            </View>
            <View className="login-entry__check">
              {workEntry === entry.value ? "✓" : ""}
            </View>
          </TaroButton>
        ))}
      </View>
      <View className="login-wechat">
        {FRONTEND_DEMO ? (
          <View className="login-demo-preview">
            <Button
              loading={busy === "worker-preview"}
              disabled={busy !== null}
              onClick={() => {
                void signIn(async (): Promise<void> => {
                  clearWorkEntry();
                  prepareDemoWorkerPreview();
                  await devLogin("dev-worker");
                }, "worker-preview");
              }}
            >
              直接体验工人端
            </Button>
            <View className="login-wechat__note">
              使用虚构资料，数据仅存本机。
            </View>
          </View>
        ) : null}
        <Button
          variant={FRONTEND_DEMO ? "outline" : "primary"}
          loading={busy === "worker"}
          disabled={
            workEntry === null ||
            busy !== null ||
            (!FRONTEND_DEMO && !nativeWechatLogin)
          }
          onClick={signInWorker}
        >
          {workEntry === null
            ? "请先选择用工入口"
            : `${FRONTEND_DEMO ? "体验" : "微信登录"} · ${workEntry === "LONG_TERM" ? "长期用工" : "临时用工"}`}
        </Button>
        <View className="login-wechat__note">
          {FRONTEND_DEMO
            ? "演示工人账号，免邀请码。"
            : "入场须完成微信绑定、用工登记和底照录入。"}
        </View>
        <TaroButton
          className="login-manager"
          disabled={busy !== null || (!FRONTEND_DEMO && !nativeWechatLogin)}
          onClick={signInManager}
        >
          {busy === "manager" ? "正在登录…" : "管理人员登录 ›"}
        </TaroButton>
      </View>
      {!FRONTEND_DEMO && !nativeWechatLogin ? (
        <Notice>请在微信小程序内使用微信登录。</Notice>
      ) : null}
      {(error ?? sessionError) ? (
        <Notice>{error ?? sessionError}</Notice>
      ) : null}
      {FRONTEND_DEMO || TEST_LOGIN_ENABLED ? (
        <>
          <TaroButton
            className="login-section login-test-toggle"
            disabled={busy !== null}
            onClick={() => setShowTestAccounts((current) => !current)}
          >
            <View className="login-section__title">
              {FRONTEND_DEMO ? "选择演示身份" : "测试人员登录"}
            </View>
            <View>{showTestAccounts ? "收起" : "展开"}</View>
          </TaroButton>
          {showTestAccounts ? (
            <>
              {TEST_LOGIN_ENABLED ? <View className="login-wechat__note">选择测试身份，操作保存至测试库。</View> : null}
              <View className="login-roles">
                {DEMO_ROLES.map((role) => (
                  <View
                    key={role.code}
                    className={`login-role ${busy === role.code ? "login-role--busy" : ""}`}
                    onClick={() => {
                      void signIn(async (): Promise<void> => {
                        clearWorkEntry();
                        if (FRONTEND_DEMO) {
                          if (role.code === "dev-worker") prepareDemoWorkerPreview();
                          await devLogin(role.code);
                        }
                        else await loginTestAccount(role.code);
                      }, role.code);
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
        </>
      ) : null}
      <View className="login-disclaimer">
        {FRONTEND_DEMO ? (
          <>
            测试登录免口令。
            <View>当前数据仅保存在本机。</View>
          </>
        ) : (
          "本人微信登录，岗位权限由管理员分配。"
        )}
      </View>
    </FlowScreen>
  );
}
