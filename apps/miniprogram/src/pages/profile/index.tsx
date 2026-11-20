import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";

import { AccountAvatar } from "../../components/account-avatar";
import { AccountProfileForm } from "../../components/account-profile-form";
import {
  AppHeader,
  BottomNav,
  Button,
  Links,
  Notice,
  PageHeader,
  Row,
  Screen,
  SectionTitle,
  Sheet,
  StateView,
} from "../../components/ui/index";
import { FRONTEND_DEMO, TEST_LOGIN_ENABLED } from "../../config/env";
import { useAccountProfile } from "../../hooks/use-account-profile";
import { useCachedRead } from "../../hooks/use-cached-read";
import { useLeaveGuard } from "../../hooks/use-leave-guard";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { roleHomePanel } from "../../routing/roleHome";
import { resetDemoState } from "../../services/demo/client";
import { errorMessage } from "../../services/error-messages";
import { fetchMyFace, type MyFace } from "../../services/face";
import { fetchMyProjects } from "../../services/me";
import type { MyProjectMembership } from "../../services/me.types";
import { useSession } from "../../store/session";

import {
  badgeContactLine,
  badgeName,
  badgeRoleLine,
  faceRowStatus,
  recordEntries,
} from "./profile-model";

import "./index.scss";

/** 活体测试会产生真实的云端核验费用，只在演示或测试登录构建中展示。 */
const TEST_TOOLS_VISIBLE = FRONTEND_DEMO || TEST_LOGIN_ENABLED;

const go = (url: string): void => {
  void Taro.navigateTo({ url });
};

/**
 * 我的：所有人同一套。上面一张工牌，下面是和本人有关的、和记录有关的两组，
 * 最底下是权限与范围和退出登录。改本人资料是这一页里的另一个视图。
 */
export default function Profile(): JSX.Element {
  useSessionGuard();
  const { state, clear, refreshMe } = useSession();
  const { revision, refresh } = usePageRefresh();
  const {
    profile: account,
    error: accountError,
    refresh: refreshAccount,
  } = useAccountProfile();
  const [projects, setProjects] = useState<
    readonly MyProjectMembership[] | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [editingProfile, setEditingProfile] = useState<boolean>(false);
  const me = state.me;
  const panel = roleHomePanel(me?.roles.highestRoleCode ?? null);
  // 改本人资料是同一页里的子视图：系统返回会关掉整页，先问一下。
  useLeaveGuard(
    editingProfile && account !== null
      ? "本人资料还没保存，离开后改动不保留。"
      : null,
  );
  useEffect(() => {
    if (state.me === null) return;
    let cancelled = false;
    setError(null);
    void fetchMyProjects().then(
      (rows) => {
        if (!cancelled) setProjects(rows);
      },
      (reason) => {
        if (!cancelled) setError(errorMessage(reason, "暂时无法读取项目信息"));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [revision, state.me]);
  // 底照的审核状态和首页用同一份缓存；没读到时这一行只是不带状态，照样能点进去。
  const face = useCachedRead<MyFace>(
    me?.profile.id ? `${me.user.id}:my-face` : null,
    fetchMyFace,
    revision,
  );
  const signOut = async (): Promise<void> => {
    if (busy) return;
    const confirm = await Taro.showModal({
      title: FRONTEND_DEMO ? "切换演示身份" : "退出登录",
      content: FRONTEND_DEMO
        ? "退出当前演示身份并返回登录页。"
        : "退出后需要重新微信登录才能打卡。",
      confirmText: "退出",
      confirmColor: "#D7261E",
    });
    if (!confirm.confirm) return;
    setBusy(true);
    try {
      await clear();
    } finally {
      await Taro.reLaunch({ url: "/pages/login/index" });
    }
  };
  const resetDemo = async (): Promise<void> => {
    if (busy || !FRONTEND_DEMO) return;
    const result = await Taro.showModal({
      title: "重置前端演示数据",
      content: "清除本机演示人员、照片及记录，恢复初始数据。",
      confirmText: "重置",
    });
    if (!result.confirm) return;
    setBusy(true);
    try {
      await clear();
      resetDemoState();
      await Taro.reLaunch({ url: "/pages/login/index" });
    } catch (failure: unknown) {
      setError(errorMessage(failure, "重置失败"));
      setBusy(false);
    }
  };

  if (editingProfile)
    return (
      <Screen
        header={
          <PageHeader
            title="本人资料"
            onBack={() => setEditingProfile(false)}
          />
        }
      >
        {account ? (
          <AccountProfileForm
            profile={account}
            submitLabel="保存资料"
            inBar
            onSaved={async (): Promise<void> => {
              await refreshMe();
              refreshAccount();
              setEditingProfile(false);
            }}
          />
        ) : accountError ? (
          <StateView
            title="账号资料读取失败"
            sub={accountError}
            onRetry={refreshAccount}
          />
        ) : (
          <StateView title="正在读取账号资料" />
        )}
      </Screen>
    );

  const name = badgeName(account);
  const records = recordEntries({
    panel,
    workerProfile: me?.profile.type === "WORKER",
    projectCount: projects?.length ?? null,
  });
  const recordGroup = (
    <Sheet gap>
      {records.map((entry) => (
        <Row
          key={entry.url}
          title={entry.title}
          value={entry.value}
          mute
          chevron
          onClick={() => go(entry.url)}
        />
      ))}
    </Sheet>
  );
  const personGroup = (
    <Sheet gap>
      <Row title="本人资料" chevron onClick={() => setEditingProfile(true)} />
      {account && account.workerRegistration !== "NOT_APPLICABLE" ? (
        <Row
          title="用工登记"
          status={
            account.workerRegistration === "REQUIRED"
              ? { kind: "warn", text: "待填写" }
              : undefined
          }
          chevron
          onClick={() => go("/pages/worker-registration/index")}
        />
      ) : null}
      {me?.profile.id ? (
        <Row
          title="人脸底照"
          status={faceRowStatus(face.data)}
          chevron
          onClick={() => go("/pages/face-profile/index")}
        />
      ) : null}
      <Row
        title="档案绑定"
        status={
          me?.user.isBound
            ? { kind: "ok", text: "已绑定" }
            : { kind: "warn", text: "待绑定" }
        }
        chevron
        onClick={() => go("/pages/bind/index")}
      />
    </Sheet>
  );
  const problem = accountError ?? error;

  return (
    <Screen header={<AppHeader title="我的" />}>
      <View className="profile-badge">
        <View className="profile-badge__band">
          <View className="profile-badge__slot" />
        </View>
        <View className="profile-badge__body">
          <View className="profile-badge__photo">
            <AccountAvatar
              src={account?.avatarDataUrl ?? null}
              name={account?.realName ?? account?.nickname}
            />
          </View>
          {name === null && accountError === null ? (
            <View className="profile-badge__text" aria-label="正在读取账号资料">
              <View className="profile-badge__sk profile-badge__sk--name sk" />
              <View className="profile-badge__sk sk" />
              <View className="profile-badge__sk sk" />
            </View>
          ) : (
            <View className="profile-badge__text">
              <View className="profile-badge__name">
                {name ?? "资料没读到"}
              </View>
              <View className="profile-badge__line">
                {badgeRoleLine(panel, projects)}
              </View>
              <View className="profile-badge__line">
                {badgeContactLine(account, FRONTEND_DEMO)}
              </View>
            </View>
          )}
        </View>
      </View>
      {/* 工人先看和本人有关的；管理人员自己的项目、任务、考勤、补卡排在前面。 */}
      {panel === "worker" ? (
        <>
          {personGroup}
          {recordGroup}
        </>
      ) : (
        <>
          {recordGroup}
          {personGroup}
        </>
      )}
      {TEST_TOOLS_VISIBLE ? (
        <>
          <SectionTitle>测试，不计考勤</SectionTitle>
          <Sheet>
            <Row
              title="打卡流程测试"
              chevron
              onClick={() => go("/pages/punch-test/index")}
            />
            {me?.profile.id ? (
              <Row
                title="活体测试"
                chevron
                onClick={() => go("/pages/face-profile/index?test=1")}
              />
            ) : null}
          </Sheet>
        </>
      ) : null}
      <Notice>刷不了脸的时候，联系管理员处理考勤或补卡。</Notice>
      {problem ? (
        <>
          <Notice tone="error">
            有些信息没读到
            <View className="ui-notice__sub">{problem}</View>
          </Notice>
          <Button
            variant="outline"
            onClick={() => {
              refresh();
              refreshAccount();
            }}
          >
            重新读取
          </Button>
        </>
      ) : null}
      <View className="profile-links">
        <Links>
          <Button
            variant="text"
            onClick={() => go("/pages/permission-levels/index")}
          >
            权限与范围
          </Button>
          <Button
            variant="text"
            loading={busy}
            onClick={() => {
              void signOut();
            }}
          >
            {busy ? "退出中" : FRONTEND_DEMO ? "切换演示身份" : "退出登录"}
          </Button>
        </Links>
      </View>
      {FRONTEND_DEMO ? (
        <Links>
          <Button
            variant="text"
            disabled={busy}
            onClick={() => {
              void resetDemo();
            }}
          >
            重置演示数据
          </Button>
        </Links>
      ) : null}
      <View className="profile-version">瀚渤智慧工地 v0.1</View>
      <BottomNav active="profile" />
    </Screen>
  );
}
