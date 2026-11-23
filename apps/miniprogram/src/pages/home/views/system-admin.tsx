import { RoleGrid, RolePanel } from "../../../components/role-panels/index";
import {
  Sign,
  SignButton,
  SignText,
  SkeletonSign,
} from "../../../components/ui/index";
import { useCachedRead } from "../../../hooks/use-cached-read";
import { usePageRefresh } from "../../../hooks/use-page-refresh";
import type { MeResponse } from "../../../services/auth.types";
import {
  fetchSystemOverview,
  type SystemOverview,
} from "../../../services/workflows";
import { systemAdminSign, systemAdminTodos } from "../home-model";

import {
  HomeShell,
  TodoSheet,
  useAnnouncement,
  usePullRefresh,
} from "./parts";

// 打卡安排不放在首页（五级 Q11），要设就进入公司 → 进入项目再设。
const GRID: readonly string[] = [
  "/pages/system-management/index",
  "/pages/safety-policy/index",
];
const LIST: readonly string[] = ["/pages/team-makeups/index"];

/**
 * 超级管理员首页（五级第五期，Q10）。平台没有“今天到岗”这件事：标牌说平台的规模
 * （公司、进行中项目、在用账号），“等你处理”是没有管理员的公司、还没绑定的公司管理员、
 * 只有你能批的补卡。数字都来自 /system/overview，和点进去的列表同口径。
 */
export const SystemAdminHome = ({
  me,
}: {
  readonly me: MeResponse;
}): JSX.Element => {
  const userId = me.user.id;
  const { revision, refresh } = usePageRefresh();
  const overview = useCachedRead<SystemOverview>(
    `${userId}:system-overview`,
    fetchSystemOverview,
    revision,
    "平台概况没读到",
  );
  const settings = useAnnouncement(userId, revision);
  usePullRefresh(
    refresh,
    overview.loading || overview.refreshing || settings.loading || settings.refreshing,
  );
  const sign = overview.data === null ? null : systemAdminSign(overview.data);
  return (
    <HomeShell
      title="平台"
      announcement={settings.data?.announcement}
      problem={(overview.data !== null ? overview.error : null) ?? settings.error}
      onRetry={refresh}
    >
      {sign !== null ? (
        <Sign>
          <SignText title={sign.title} sub={sign.sub} />
        </Sign>
      ) : overview.error !== null ? (
        <Sign>
          <SignText title="平台概况没读到" sub={overview.error} />
          <SignButton onClick={refresh}>重新读取</SignButton>
        </Sign>
      ) : (
        <SkeletonSign />
      )}
      <TodoSheet
        todos={systemAdminTodos(overview.data)}
        loading={overview.loading}
        incomplete={overview.data === null && overview.error !== null}
      />
      <RoleGrid panel="systemAdmin" only={GRID} />
      <RolePanel panel="systemAdmin" only={LIST} gap />
    </HomeShell>
  );
};
