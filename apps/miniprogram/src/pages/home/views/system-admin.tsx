import { RoleGrid, RolePanel } from "../../../components/role-panels/index";
import { Sign, SignText } from "../../../components/ui/index";
import { usePageRefresh } from "../../../hooks/use-page-refresh";
import type { MeResponse } from "../../../services/auth.types";

import { HomeShell, useAnnouncement, usePullRefresh } from "./parts";

// 打卡安排不放在首页（五级 Q11），要设就进入公司 → 进入项目再设。
const GRID: readonly string[] = [
  "/pages/system-management/index",
  "/pages/safety-policy/index",
];
const LIST: readonly string[] = ["/pages/team-makeups/index"];

/**
 * 超级管理员首页。平台没有“今天到岗”这件事，标牌只说这是平台账号、该去哪。
 * 公司数、账号数这些数字要等平台管理的接口有了再放上来（现在只有演示版有）。
 */
export const SystemAdminHome = ({
  me,
}: {
  readonly me: MeResponse;
}): JSX.Element => {
  const { revision, refresh } = usePageRefresh();
  const settings = useAnnouncement(me.user.id, revision);
  usePullRefresh(refresh, settings.loading || settings.refreshing);
  return (
    <HomeShell
      title="平台"
      announcement={settings.data?.announcement}
      problem={settings.error}
      onRetry={refresh}
    >
      <Sign>
        <SignText
          title="平台账号已就绪"
          sub="公司、账号权限和平台设置都在平台管理里。"
        />
      </Sign>
      <RoleGrid panel="systemAdmin" only={GRID} />
      <RolePanel panel="systemAdmin" only={LIST} gap />
    </HomeShell>
  );
};
