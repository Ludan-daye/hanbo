import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";

import {
  AppHeader,
  AppIcon,
  BottomNav,
  Button,
  ListItem,
  Notice,
  Screen,
  Section,
  StateView,
} from "../../components/ui/index";
import { AccountAvatar } from "../../components/account-avatar";
import { FRONTEND_DEMO } from "../../config/env";
import { useAccountProfile } from "../../hooks/use-account-profile";
import { AccountProfileForm } from "../../components/account-profile-form";
import { resetDemoState } from "../../services/demo/client";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { displayProjectRole } from "../../routing/features";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { PANEL_LABELS } from "../../routing/features";
import { roleHomePanel } from "../../routing/roleHome";
import { fetchMyProjects } from "../../services/me";
import type { MyProjectMembership } from "../../services/me.types";
import { useSession } from "../../store/session";

import "./index.scss";

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
  const panel = roleHomePanel(state.me?.roles.highestRoleCode ?? null);
  useEffect(() => {
    if (state.me === null) return;
    let cancelled = false;
    setError(null);
    void fetchMyProjects().then(
      (rows) => {
        if (!cancelled) setProjects(rows);
      },
      (reason) => {
        if (!cancelled)
          setError(
            reason instanceof Error ? reason.message : "暂时无法读取项目信息",
          );
      },
    );
    return () => {
      cancelled = true;
    };
  }, [revision, state.me]);
  const signOut = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      await clear();
    } finally {
      await Taro.reLaunch({ url: "/pages/login/index" });
    }
  };
  return (
    <Screen>
      <AppHeader title="我的" />
      <View className="profile-card">
        <View className="profile-avatar">
          <AccountAvatar src={account?.avatarDataUrl ?? null} />
        </View>
        <View>
          <View className="profile-card__name">
            {account?.nickname ??
              (account === null
                ? accountError === null
                  ? "资料读取中…"
                  : "资料未加载"
                : "未设置昵称")}
          </View>
          <View className="profile-card__sub">
            {PANEL_LABELS[panel]} · {FRONTEND_DEMO ? "演示账号" : "微信已关联"}
          </View>
          <View className="profile-card__sub">
            {state.me?.user.isBound ? "本人档案已绑定" : "待绑定本人档案"}
          </View>
        </View>
        <View className="profile-card__verified">
          <AppIcon name="shield" />
        </View>
      </View>
      {accountError ? (
        <StateView
          title="账号资料读取失败"
          sub={accountError}
          onRetry={refreshAccount}
        />
      ) : null}
      <Section
        title="头像与昵称"
        sub={
          FRONTEND_DEMO
            ? "演示资料仅保存在本机"
            : "由本人主动设置，保存后再次登录仍可查看"
        }
      >
        {account !== null ? (
          <AccountProfileForm
            profile={account}
            submitLabel="保存资料"
            onSaved={async (): Promise<void> => {
              await refreshMe();
              refreshAccount();
            }}
          />
        ) : null}
      </Section>
      <Section title="账号绑定">
        <ListItem
          primary="登录方式"
          secondary={FRONTEND_DEMO ? "本机演示账号" : "微信登录 · 已关联"}
        />
        {account?.phoneMasked ? (
          <ListItem primary="档案手机号" secondary={account.phoneMasked} />
        ) : null}
        <ListItem
          primary={FRONTEND_DEMO ? "演示账号绑定信息" : "微信账号绑定信息"}
          secondary={
            FRONTEND_DEMO
              ? "仅用于演示，不关联真实微信"
              : "查看当前账号的人员档案与岗位身份"
          }
          chip={state.me?.user.isBound ? "已绑定" : "待绑定"}
          onClick={() => {
            void Taro.navigateTo({ url: "/pages/bind/index" });
          }}
        />
      </Section>
      <Section title="我的项目" sub="角色和班组由管理员分配">
        {projects === null && error === null ? (
          <StateView title="加载中…" />
        ) : null}
        {error ? (
          <StateView title="加载失败" sub={error} onRetry={refresh} />
        ) : null}
        {projects?.map((project) => (
          <ListItem
            key={project.projectId}
            primary={project.projectName}
            secondary={`${displayProjectRole(project.projectRoleLabel)} · ${project.teamName ?? "未分配班组"}`}
            chip="已加入"
          />
        ))}
        {projects?.length === 0 ? (
          <StateView
            title="暂无项目成员身份"
            sub="公司级和系统级角色不一定加入具体班组。"
          />
        ) : null}
      </Section>
      <Section title="账号权限">
        {state.me?.roles.assignments.map((role) => (
          <ListItem
            key={`${role.roleCode}-${role.scope.scopeId}`}
            primary={PANEL_LABELS[roleHomePanel(role.roleCode)]}
            secondary={
              {
                GLOBAL: "全平台范围",
                COMPANY: "所属公司范围",
                PROJECT: "所属项目范围",
                TEAM: "所属班组范围",
              }[role.scope.scopeType] ?? role.scope.scopeType
            }
          />
        ))}
      </Section>
      {state.me?.profile.id ? (
        <Section title="考勤身份">
          <ListItem
            primary="人脸档案"
            secondary="录入本人底照、查看审核结果"
            onClick={() => {
              void Taro.navigateTo({ url: "/pages/face-profile/index" });
            }}
          />
        </Section>
      ) : null}
      <Notice>
        人脸核验以服务端结果为准。无法刷脸时，请联系管理员办理人工考勤或补卡。
      </Notice>
      <Button
        variant="outline"
        loading={busy}
        onClick={() => {
          void signOut();
        }}
      >
        {FRONTEND_DEMO ? "退出并切换演示身份" : "退出登录"}
      </Button>
      {FRONTEND_DEMO ? (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            void (async (): Promise<void> => {
              const result = await Taro.showModal({
                title: "重置前端演示数据",
                content:
                  "将删除本机的演示人员、照片和操作记录，并恢复初始场景。",
                confirmText: "重置",
              });
              if (!result.confirm) return;
              setBusy(true);
              try {
                await clear();
                resetDemoState();
                await Taro.reLaunch({ url: "/pages/login/index" });
              } catch (failure: unknown) {
                setError(
                  failure instanceof Error ? failure.message : "重置失败",
                );
                setBusy(false);
              }
            })();
          }}
        >
          重置演示数据
        </Button>
      ) : null}
      <View className="page-footnote">瀚渤智慧工地 · v0.1</View>
      <BottomNav active="profile" />
    </Screen>
  );
}
