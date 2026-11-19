import { View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useEffect, useState } from "react";

import {
  AppHeader,
  Button,
  Links,
  Notice,
  PRESS,
  Row,
  Say,
  Screen,
  SectionTitle,
  Sheet,
  type LineIconName,
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
import { prepareDemoWorkerPreview } from "../../services/demo/client";
import { errorMessage } from "../../services/error-messages";
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
  readonly icon: LineIconName;
};
// 顺序不能动：走查和截图的脚本按第几个 .login-role 来选身份。
const DEMO_ROLES: readonly DemoRole[] = [
  {
    code: "dev-worker",
    label: "一级 普通工人",
    sub: "工人权限，本人考勤和补卡",
    icon: "user",
  },
  {
    code: "dev-team",
    label: "二级 班组长",
    sub: "工人权限，班组考勤和审批",
    icon: "users",
  },
  {
    code: "dev-project",
    label: "三级 项目管理员",
    sub: "管理人员权限，项目人员和排班",
    icon: "building",
  },
  {
    code: "dev-company",
    label: "四级 公司管理员",
    sub: "管理人员权限，公司项目和报表",
    icon: "chart",
  },
  {
    code: "dev-system",
    label: "五级 超级管理员",
    sub: "管理人员权限，平台和账号",
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
      setError(errorMessage(reason, "登录失败，请检查网络后重试"));
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
  const previewWorker = (): void => {
    void signIn(async (): Promise<void> => {
      clearWorkEntry();
      prepareDemoWorkerPreview();
      await devLogin("dev-worker");
    }, "worker-preview");
  };
  const signInRole = (code: TestAccountCode): void => {
    void signIn(async (): Promise<void> => {
      clearWorkEntry();
      if (FRONTEND_DEMO) {
        if (code === "dev-worker") prepareDemoWorkerPreview();
        await devLogin(code);
      } else await loginTestAccount(code);
    }, code);
  };
  const wechatUnavailable: boolean = !FRONTEND_DEMO && !nativeWechatLogin;
  const problem: string | null = error ?? sessionError;
  return (
    <Screen header={<AppHeader title="" />}>
      <View className="login-logo">瀚</View>
      <Say
        title="瀚渤智慧工地"
        sub={
          FRONTEND_DEMO
            ? "先选你的用工方式，再进入演示。"
            : "先选你的用工方式，再用微信登录。"
        }
      />
      <View className="login-entries">
        {WORK_ENTRY_OPTIONS.map((entry) => {
          const selected = workEntry === entry.value;
          return (
            <View
              key={entry.value}
              className={`login-entry ui-press${selected ? " login-entry--on" : ""}`}
              {...PRESS}
              onClick={() => {
                if (busy !== null) return;
                setWorkEntry(entry.value);
                setError(null);
              }}
            >
              <View className="login-entry__text">
                <View className="login-entry__title">{entry.label}</View>
                <View className="login-entry__sub">{entry.description}</View>
              </View>
              {selected ? (
                <View className="login-entry__tick" />
              ) : (
                <View className="ui-chevron" />
              )}
            </View>
          );
        })}
      </View>
      {/* 这一屏唯一的黑色实心按钮。选了用工方式才能点。 */}
      <Button
        loading={busy === "worker"}
        disabled={workEntry === null || busy !== null || wechatUnavailable}
        onClick={signInWorker}
      >
        {busy === "worker"
          ? "登录中…"
          : FRONTEND_DEMO
            ? "进入演示"
            : "微信登录"}
      </Button>
      {problem ? <Notice tone="error">{problem}</Notice> : null}
      <Links>
        <Button
          variant="text"
          disabled={busy !== null || wechatUnavailable}
          onClick={signInManager}
        >
          {busy === "manager" ? "登录中…" : "我是管理人员"}
        </Button>
        {FRONTEND_DEMO ? (
          <Button
            variant="text"
            disabled={busy !== null}
            onClick={previewWorker}
          >
            {busy === "worker-preview" ? "进入中…" : "直接体验工人端"}
          </Button>
        ) : null}
      </Links>
      {wechatUnavailable ? (
        <Notice>请在微信小程序里打开，才能用微信登录。</Notice>
      ) : null}
      <Notice>
        {FRONTEND_DEMO
          ? "演示用的是虚构资料，数据只保存在本机，不用邀请码和口令。"
          : "入场要完成微信绑定、用工登记和底照录入。岗位和权限由管理员分配。"}
      </Notice>
      {FRONTEND_DEMO || TEST_LOGIN_ENABLED ? (
        <>
          {/* 整行都能点；右边的“收起/展开”不单独接事件，免得一次点击切换两回。 */}
          <View
            className="login-test-toggle"
            onClick={() => {
              if (busy === null) setShowTestAccounts((current) => !current);
            }}
          >
            <SectionTitle action={showTestAccounts ? "收起" : "展开"}>
              {FRONTEND_DEMO ? "选择演示身份" : "测试人员登录"}
            </SectionTitle>
          </View>
          {showTestAccounts ? (
            <View className="m-fade">
              <Sheet>
                {DEMO_ROLES.map((role) => (
                  <View
                    key={role.code}
                    className={`login-role ui-press${busy === role.code ? " login-role--busy" : ""}`}
                    {...PRESS}
                    onClick={() => signInRole(role.code)}
                  >
                    <Row
                      icon={role.icon}
                      title={busy === role.code ? "正在进入…" : role.label}
                      sub={role.sub}
                      chevron
                    />
                  </View>
                ))}
              </Sheet>
              {TEST_LOGIN_ENABLED ? (
                <Notice>选一个测试身份登录，操作会保存到测试库。</Notice>
              ) : null}
            </View>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
