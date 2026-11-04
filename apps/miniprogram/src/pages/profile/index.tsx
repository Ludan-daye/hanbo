import { permissionLabel } from "../../routing/permissionLevels";
import { Button as NativeButton, View } from "@tarojs/components";
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
import { myProjectDetailUrl } from "../../services/project-attendance";
import { fetchMyProjects } from "../../services/me";
import type { MyProjectMembership } from "../../services/me.types";
import { useSession } from "../../store/session";
import { FlowScreen } from "../../components/worker-flow";

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
  const [editingProfile, setEditingProfile] = useState<boolean>(false);
  const [auxiliaryOpen, setAuxiliaryOpen] = useState<boolean>(false);
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
      setError(failure instanceof Error ? failure.message : "重置失败");
      setBusy(false);
    }
  };
  if (state.me?.roles.highestRoleCode === "WORKER") {
    const go = (url: string): void => { void Taro.navigateTo({ url }); };
    return (
      <FlowScreen title="我的" root>
        <View className="worker-profile">
          <View className="worker-profile__identity">
            <View className="worker-profile__avatar"><AccountAvatar src={account?.avatarDataUrl ?? null} /></View>
            <View className="worker-profile__identity-body">
              <View className="worker-profile__name">
                {account?.nickname ?? (account === null ? accountError === null ? "资料读取中…" : "资料未加载" : "未设置昵称")}
              </View>
              <View className="worker-profile__muted">普通工人 · {state.me.user.isBound ? "档案已绑定" : "待绑定本人档案"}</View>
              {account?.realName ? <View className="worker-profile__muted">本人姓名：{account.realName}</View> : null}
              {account?.phoneMasked ? <View className="worker-profile__muted">{account.phoneMasked}</View> : null}
              <View className="worker-profile__muted">{FRONTEND_DEMO ? "演示账号 · 未关联微信" : "微信登录 · 已关联"}</View>
            </View>
          </View>
          {accountError ? <StateView title="账号资料读取失败" sub={accountError} onRetry={refreshAccount} /> : null}
          <View className="worker-profile__group">
            <NativeButton className="worker-profile__row" onClick={() => setEditingProfile(!editingProfile)}>
              <View>本人资料</View><View className="worker-profile__row-hint">{editingProfile ? "收起编辑" : "编辑"}</View>
            </NativeButton>
            {editingProfile && account ? (
              <View className="worker-profile__editor">
                <AccountProfileForm appearance="worker" profile={account} submitLabel="保存资料" onSaved={async () => {
                  await refreshMe(); refreshAccount(); setEditingProfile(false);
                }} />
                <Button appearance="worker" variant="outline" onClick={() => setEditingProfile(false)}>取消编辑</Button>
              </View>
            ) : null}
            {account && account.workerRegistration !== "NOT_APPLICABLE" ? (
              <NativeButton className="worker-profile__row" onClick={() => go("/pages/worker-registration/index")}>
                <View>用工登记</View><View className="worker-profile__row-hint">查看 / 修改</View>
              </NativeButton>
            ) : null}
            {state.me.profile.id ? (
              <NativeButton className="worker-profile__row" onClick={() => go("/pages/face-profile/index")}>
                <View>人脸档案</View><View className="worker-profile__row-hint">查看审核状态</View>
              </NativeButton>
            ) : null}
            <NativeButton className="worker-profile__row" onClick={() => go("/pages/bind/index")}>
              <View>账号绑定</View><View className="worker-profile__row-hint">{state.me.user.isBound ? "已绑定" : "待绑定"}</View>
            </NativeButton>
          </View>
          <View className="worker-profile__group">
            <NativeButton className="worker-profile__row" onClick={() => go("/pages/my-records/index?range=MONTH")}><View>我的考勤</View><View className="worker-profile__row-hint">查看</View></NativeButton>
            <NativeButton className="worker-profile__row" onClick={() => go("/pages/my-makeups/index")}><View>补卡记录</View><View className="worker-profile__row-hint">查看</View></NativeButton>
            <NativeButton className="worker-profile__row" onClick={() => go("/pages/my-projects/index")}>
              <View>我的项目</View><View className="worker-profile__row-hint">{projects === null ? "查看全部" : `${projects.length} 个项目`}</View>
            </NativeButton>
            {error ? <StateView title="项目信息读取失败" sub={error} onRetry={refresh} /> : null}
          </View>
          <View className="worker-profile__group">
            <NativeButton className="worker-profile__row" onClick={() => go("/pages/permission-levels/index")}><View>权限与范围</View><View className="worker-profile__row-hint">查看</View></NativeButton>
            <NativeButton className="worker-profile__row worker-profile__aux-toggle" onClick={() => setAuxiliaryOpen(!auxiliaryOpen)}>
              <View>辅助测试</View><View className="worker-profile__row-hint">{auxiliaryOpen ? "收起" : "展开"}</View>
            </NativeButton>
            {auxiliaryOpen ? (
              <View className="worker-profile__auxiliary">
                <NativeButton className="worker-profile__row" onClick={() => go("/pages/punch-test/index")}><View>打卡流程测试</View><View className="worker-profile__row-hint">查看</View></NativeButton>
                {state.me.profile.id ? <NativeButton className="worker-profile__row" onClick={() => go("/pages/face-profile/index?test=1")}><View>活体测试</View><View className="worker-profile__row-hint">查看</View></NativeButton> : null}
                <View className="worker-profile__muted">测试不计考勤。{FRONTEND_DEMO ? "演示环境不可进行真实测试。" : "可用条件以测试页为准。"}</View>
              </View>
            ) : null}
          </View>
          <View className="worker-profile__help">无法刷脸时，联系管理员处理考勤或补卡。</View>
          <NativeButton className="worker-profile__account-action" disabled={busy} onClick={() => { void signOut(); }}>
            {busy ? "正在处理…" : FRONTEND_DEMO ? "退出并切换演示身份" : "退出登录"}
          </NativeButton>
          {FRONTEND_DEMO ? <NativeButton className="worker-profile__account-action" disabled={busy} onClick={() => { void resetDemo(); }}>重置演示数据</NativeButton> : null}
          <View className="worker-profile__version">瀚渤智慧工地 · v0.1</View>
          <BottomNav active="profile" appearance="worker" />
        </View>
      </FlowScreen>
    );
  }
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
      <ListItem
        primary="打卡流程测试"
        secondary="定位、拍照、人脸测试 · 不计考勤"
        chip="开始测试"
        onClick={() => {
          void Taro.navigateTo({ url: "/pages/punch-test/index" });
        }}
      />
      <Section title="个人资料">
        {account && account.workerRegistration !== "NOT_APPLICABLE" ? (
          <ListItem
            primary="用工登记资料"
            secondary="身份证、住址、紧急联系人、健康、保险及工资银行卡"
            chip="查看／修改"
            onClick={() => {
              void Taro.navigateTo({ url: "/pages/worker-registration/index" });
            }}
          />
        ) : null}
        {!editingProfile ? (
          <ListItem
            primary="头像与本人资料"
            chip="编辑"
            onClick={() => setEditingProfile(true)}
          />
        ) : null}
        {editingProfile && account !== null ? (
          <AccountProfileForm
            profile={account}
            submitLabel="保存资料"
            onSaved={async (): Promise<void> => {
              await refreshMe();
              refreshAccount();
              setEditingProfile(false);
            }}
          />
        ) : null}
        {editingProfile ? (
          <Button variant="outline" onClick={() => setEditingProfile(false)}>
            取消编辑
          </Button>
        ) : null}
      </Section>
      <Section title="账号绑定">
        <ListItem
          primary="登录方式"
          secondary={FRONTEND_DEMO ? "本机演示账号" : "微信登录 · 已关联"}
        />
        {account?.realName ? (
          <ListItem primary="真实姓名" secondary={account.realName} />
        ) : null}
        {account?.phoneMasked ? (
          <ListItem primary="档案手机号" secondary={account.phoneMasked} />
        ) : null}
        <ListItem
          primary={FRONTEND_DEMO ? "演示账号绑定信息" : "微信账号绑定信息"}
          secondary={
            FRONTEND_DEMO
              ? "仅用于演示，不关联真实微信"
              : "人员档案及岗位"
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
            chip="进入项目"
            onClick={() => {
              void Taro.navigateTo({ url: myProjectDetailUrl(project.projectId) });
            }}
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
        <ListItem
          primary="权限等级与功能"
          secondary="工人一至二级 · 管理人员三至五级"
          onClick={() => {
            void Taro.navigateTo({ url: "/pages/permission-levels/index" });
          }}
        />
        {state.me?.roles.assignments.map((role) => (
          <ListItem
            key={`${role.roleCode}-${role.scope.scopeId}`}
            primary={permissionLabel(role.roleCode)}
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
            secondary="底照录入与审核"
            onClick={() => {
              void Taro.navigateTo({ url: "/pages/face-profile/index" });
            }}
          />
        </Section>
      ) : null}
      <Notice>
        无法刷脸时，联系管理员处理考勤或补卡。
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
                  "清除本机演示人员、照片及记录，恢复初始数据。",
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
