import { permissionLabel } from "../../routing/permissionLevels";
import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";

import {
  AppHeader,
  BottomNav,
  Button,
  Notice,
  Screen,
  Section,
  StateView,
} from "../../components/ui/index";
import { RolePanel } from "../../components/role-panels/index";
import { WorkerProjectOverview } from "../../components/worker-project-overview";
import { WorkerHome } from "../../components/worker-home";
import { TeamLeaderOverview } from "../../components/team-leader-overview";
import { AccountAvatar } from "../../components/account-avatar";
import { useAccountProfile } from "../../hooks/use-account-profile";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { roleHomePanel } from "../../routing/roleHome";
import { resolveAdminProjectId } from "../../routing/projectAdmin";
import { resolveCompanyAdminCompanyId } from "../../routing/companyAdmin";
import {
  fetchCompanyDailyReport,
  fetchDailyReport,
} from "../../services/management";
import { chinaDateLabel, chinaToday } from "../../services/time";
import type { ReportTotals } from "../../services/management.types";
import { API_BASE_URL, FRONTEND_DEMO } from "../../config/env";
import {
  fetchAppSettings,
  type SystemSettings,
} from "../../services/workflows";
import { useSession } from "../../store/session";

import "./index.scss";

export default function Home(): JSX.Element {
  useSessionGuard();
  const { state, phase, refreshMe } = useSession();
  const { profile: account, error: accountError } = useAccountProfile();
  const { revision, refresh } = usePageRefresh();
  const panel = roleHomePanel(state.me?.roles.highestRoleCode ?? null);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [totals, setTotals] = useState<ReportTotals | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (state.me === null || phase === "loading") return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    if (panel === "teamLeader") {
      setLoading(false);
      return;
    }
    void (async (): Promise<void> => {
      try {
        if (FRONTEND_DEMO) {
          const appSettings = await fetchAppSettings();
          if (!cancelled) setSettings(appSettings);
        }
        if (panel !== "worker") {
          const companyId = resolveCompanyAdminCompanyId(state.me);
          const projectId = resolveAdminProjectId(state.me);
          const report =
            panel === "companyAdmin" && companyId !== null
              ? await fetchCompanyDailyReport(companyId, chinaToday())
              : panel === "projectAdmin" && projectId !== null
                ? await fetchDailyReport(projectId, chinaToday())
                : null;
          if (!cancelled) {
            setTotals(report?.totals ?? null);
          }
        }
      } catch (reason) {
        if (!cancelled)
          setError(
            reason instanceof Error ? reason.message : "暂时无法读取工作概览",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state.me, phase, revision, panel]);
  if (state.me?.roles.highestRoleCode === "WORKER") {
    return (
      <WorkerHome
        key={`${FRONTEND_DEMO}:${API_BASE_URL}:${state.me.user.id}:${phase}`}
        userId={state.me.user.id}
      />
    );
  }
  return (
    <Screen>
      <AppHeader title="瀚渤" />
      <View className="home-greeting">
        <View>
          <View className="home-greeting__title">
            {account?.nickname ? `你好，${account.nickname}` : "你好，欢迎回来"}
          </View>
          <View className="home-greeting__date">{chinaDateLabel()}</View>
          <View
            className="home-account"
            onClick={() => {
              void Taro.navigateTo({ url: "/pages/profile/index" });
            }}
          >
            {account?.nickname
              ? permissionLabel(state.me?.roles.highestRoleCode ?? null)
              : "完善本人资料"}
          </View>
        </View>
        <View
          className="home-avatar"
          onClick={() => {
            void Taro.navigateTo({ url: "/pages/profile/index" });
          }}
        >
          <AccountAvatar src={account?.avatarDataUrl ?? null} />
        </View>
      </View>
      {accountError ? <Notice>{accountError}</Notice> : null}
      {panel === "worker" ? (
        <WorkerProjectOverview
          revision={revision}
          onRefresh={refresh}
          account={account}
        />
      ) : panel === "teamLeader" ? (
        <TeamLeaderOverview revision={revision} onRefresh={refresh} />
      ) : (
        <View className="home-hero">
          <View className="home-hero__label">
            {panel === "systemAdmin" || panel === "none"
              ? "账号状态"
              : "今日出勤"}
          </View>
          <View className="home-hero__bottom">
            <View>
              <View className="home-hero__number">
                {totals !== null
                  ? `${totals.actualAttendedDays}`
                  : panel === "systemAdmin"
                    ? "已就绪"
                    : panel === "none"
                      ? "待分配"
                      : "—"}
                <View className="home-hero__unit">
                  {panel === "systemAdmin" || panel === "none" ? "" : "人次"}
                </View>
              </View>
              <View className="home-hero__caption">
                {panel === "systemAdmin"
                  ? "平台身份已连接"
                  : panel === "none"
                    ? "请联系管理员分配角色"
                    : panel === "companyAdmin"
                      ? "全部项目"
                      : "当前项目"}
              </View>
            </View>
            <View
              className="home-hero__link"
              onClick={() => {
                void Taro.navigateTo({
                  url:
                    panel === "companyAdmin"
                      ? "/pages/company-reports/index"
                      : panel === "projectAdmin"
                        ? "/pages/reports/index"
                        : panel === "systemAdmin"
                          ? "/pages/system-management/index"
                          : "/pages/profile/index",
                });
              }}
            >
              查看详情<View>→</View>
            </View>
          </View>
        </View>
      )}
      {panel !== "worker" && panel !== "teamLeader" && loading ? (
        <View className="home-loading">正在同步工作信息…</View>
      ) : null}
      {panel !== "teamLeader" && error ? (
        <StateView title="概览加载失败" sub={error} onRetry={refresh} />
      ) : null}
      {panel !== "worker" && panel !== "teamLeader" && totals ? (
        <View className="home-summary">
          <View>
            <View>{totals.participantCount}</View>
            <View>统计人数</View>
          </View>
          <View>
            <View>{totals.missingPunchCount}</View>
            <View>缺卡人次</View>
          </View>
          <View>
            <View>{(totals.workedMinutes / 60).toFixed(1)}</View>
            <View>累计工时 / h</View>
          </View>
        </View>
      ) : null}
      {settings?.announcement ? <Notice>{settings.announcement}</Notice> : null}
      {panel !== "teamLeader" ? (
        <Section title={panel === "worker" ? "快捷入口" : "常用功能"}>
          <View className="home-shortcuts">
            <RolePanel panel={panel} limit={4} />
          </View>
        </Section>
      ) : null}
      {panel === "none" ? (
        <Button
          variant="outline"
          onClick={() => {
            void refreshMe().catch((cause: unknown): void => {
              setError(
                cause instanceof Error
                  ? cause.message
                  : "读取角色信息失败，请重试。",
              );
            });
          }}
        >
          刷新角色信息
        </Button>
      ) : null}
      <BottomNav active="home" />
    </Screen>
  );
}
