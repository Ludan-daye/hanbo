import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";

import {
  AppHeader,
  AppIcon,
  BottomNav,
  Button,
  Label,
  ListItem,
  Notice,
  Screen,
  Section,
  StateView,
} from "../../components/ui/index";
import { RolePanel } from "../../components/role-panels/index";
import { AccountAvatar } from "../../components/account-avatar";
import { useAccountProfile } from "../../hooks/use-account-profile";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { PANEL_LABELS } from "../../routing/features";
import { roleHomePanel } from "../../routing/roleHome";
import { resolveAdminProjectId } from "../../routing/projectAdmin";
import { resolveCompanyAdminCompanyId } from "../../routing/companyAdmin";
import { resolveTeamLeaderTeamId } from "../../routing/teamLeader";
import { fetchAttendanceToday, fetchMyProjects } from "../../services/me";
import {
  fetchCompanyDailyReport,
  fetchDailyReport,
  fetchTeamDailyReport,
} from "../../services/management";
import { fetchPendingMakeups } from "../../services/makeups";
import { chinaDateLabel, chinaToday } from "../../services/time";
import type {
  AttendanceToday,
  MyProjectMembership,
} from "../../services/me.types";
import type { ReportTotals } from "../../services/management.types";
import { FRONTEND_DEMO } from "../../config/env";
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
  const [projects, setProjects] = useState<readonly MyProjectMembership[]>([]);
  const [today, setToday] = useState<AttendanceToday | null>(null);
  const [totals, setTotals] = useState<ReportTotals | null>(null);
  const [pending, setPending] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (state.me === null || phase === "loading") return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async (): Promise<void> => {
      try {
        if (FRONTEND_DEMO) {
          const appSettings = await fetchAppSettings();
          if (!cancelled) setSettings(appSettings);
        }
        if (panel === "worker") {
          const rows = await fetchMyProjects();
          const data =
            rows.length > 0
              ? await fetchAttendanceToday(rows[0].projectId)
              : null;
          if (!cancelled) {
            setProjects(rows);
            setToday(data);
          }
        } else {
          const companyId = resolveCompanyAdminCompanyId(state.me);
          const projectId = resolveAdminProjectId(state.me);
          const teamId = resolveTeamLeaderTeamId(state.me);
          const report =
            panel === "companyAdmin" && companyId !== null
              ? await fetchCompanyDailyReport(companyId, chinaToday())
              : panel === "projectAdmin" && projectId !== null
                ? await fetchDailyReport(projectId, chinaToday())
                : panel === "teamLeader" && teamId !== null
                  ? await fetchTeamDailyReport(teamId, chinaToday())
                  : null;
          const requests =
            panel === "teamLeader" && teamId !== null
              ? await fetchPendingMakeups(teamId)
              : [];
          if (!cancelled) {
            setTotals(report?.totals ?? null);
            setPending(requests.length);
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
  const completed =
    today?.points.filter((point) => point.record !== null).length ?? 0;
  const nextPoint = today?.points.find((point) => point.record === null);
  return (
    <Screen>
      <AppHeader title="瀚渤 · 智慧工地" />
      <View className="home-greeting">
        <View>
          <Label>HELLO, HANBO</Label>
          <View className="home-greeting__title">
            {account?.nickname
              ? `你好，${account.nickname}`
              : "工作顺利，平安每一天"}
          </View>
          <View className="home-greeting__date">{chinaDateLabel()}</View>
          <View
            className="home-account"
            onClick={() => {
              void Taro.navigateTo({ url: "/pages/profile/index" });
            }}
          >
            {FRONTEND_DEMO ? "演示账号" : "微信已关联"} ·{" "}
            {account?.nickname ? PANEL_LABELS[panel] : "完善头像和昵称"} ›
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
      <View className="home-hero">
        <View className="home-hero__top">
          <View className="home-hero__label">
            {panel === "worker" ? "我的工作现场" : "今日工作概览"}
          </View>
          <View className="home-role">{PANEL_LABELS[panel]}</View>
        </View>
        <View className="home-hero__title">
          {panel === "worker"
            ? (projects[0]?.projectName ?? "我的考勤")
            : "每一份付出，都有记录"}
        </View>
        <View className="home-hero__sub">
          {panel === "worker"
            ? (projects[0]?.teamName ?? "查看今日排班与打卡进度")
            : "人员、考勤与项目，尽在掌握"}
        </View>
        <View className="home-hero__building">
          <View />
          <View />
          <View />
        </View>
        <View className="home-hero__bottom">
          <View>
            <View className="home-hero__number">
              {panel === "worker"
                ? `${completed}`
                : totals !== null
                  ? `${totals.actualAttendedDays}`
                  : panel === "systemAdmin"
                    ? "已就绪"
                    : panel === "none"
                      ? "待分配"
                      : "—"}
              <View className="home-hero__unit">
                {panel === "worker"
                  ? "/ 4 次"
                  : panel === "systemAdmin" || panel === "none"
                    ? ""
                    : "人次"}
              </View>
            </View>
            <View className="home-hero__caption">
              {panel === "worker"
                ? "今日已打卡"
                : panel === "systemAdmin"
                  ? "平台身份已连接"
                  : panel === "none"
                    ? "请联系管理员分配角色"
                    : "今日出勤"}
            </View>
          </View>
          <View
            className="home-hero__link"
            onClick={() => {
              void Taro.navigateTo({
                url:
                  panel === "worker"
                    ? "/pages/punch/index"
                    : panel === "companyAdmin"
                      ? "/pages/company-reports/index"
                      : panel === "projectAdmin"
                        ? "/pages/reports/index"
                        : panel === "teamLeader"
                          ? "/pages/team-attendance/index"
                          : panel === "systemAdmin"
                            ? "/pages/system-management/index"
                            : "/pages/profile/index",
              });
            }}
          >
            {panel === "worker" ? "去打卡" : "查看详情"}
            <View>↗</View>
          </View>
        </View>
      </View>
      {loading ? <View className="home-loading">正在同步工作信息…</View> : null}
      {error ? (
        <StateView title="概览加载失败" sub={error} onRetry={refresh} />
      ) : null}
      {panel === "worker" && today ? (
        <View className="home-progress">
          <View className="home-progress__heading">
            <View>今日考勤</View>
            <View>{today.shiftName ?? "暂未排班"}</View>
          </View>
          <View className="home-progress__points">
            {today.points.map((point) => (
              <View
                key={point.pointCode}
                className={`home-point ${point.record ? "home-point--done" : ""}`}
              >
                <View className="home-point__dot">
                  {point.record ? "✓" : ""}
                </View>
                <View>{point.scheduledTime}</View>
                <View className="home-point__state">
                  {point.record ? "已打卡" : "待打卡"}
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}
      {panel !== "worker" && totals ? (
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
      {panel === "teamLeader" ? (
        <ListItem
          primary={`待处理补卡 · ${pending} 条`}
          secondary="及时处理申请，让考勤记录更完整"
          chip="去审批"
          onClick={() => {
            void Taro.navigateTo({ url: "/pages/team-makeups/index" });
          }}
        />
      ) : null}
      {panel === "worker" && !loading && projects.length === 0 ? (
        <Notice>还没有加入项目，请联系管理员分配项目和班组。</Notice>
      ) : null}
      {panel === "worker" && today && !today.isWorkday ? (
        <Notice>今天是休息日，辛苦了，好好休息。</Notice>
      ) : null}
      {panel === "worker" && nextPoint && today?.isWorkday ? (
        <View className="home-tip">
          <AppIcon name="shield" />
          <View>进入打卡页后，完成定位与拍照即可提交考勤。</View>
        </View>
      ) : null}
      {settings?.announcement ? <Notice>{settings.announcement}</Notice> : null}
      <Section title="常用应用" sub="把日常工作，变得简单">
        <RolePanel panel={panel} />
      </Section>
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
      <View className="page-footnote">HANBO · 建造有序，工作安心</View>
      <BottomNav active="home" />
    </Screen>
  );
}
