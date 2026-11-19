import {
  AppHeader,
  BottomNav,
  Screen,
  SkeletonRows,
  SkeletonSign,
} from "../../components/ui/index";
import { WorkerHome } from "../../components/worker-home";
import { API_BASE_URL, FRONTEND_DEMO } from "../../config/env";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { roleHomePanel } from "../../routing/roleHome";
import { useSession } from "../../store/session";

import { CompanyAdminHome } from "./views/company-admin";
import { LeaderHome } from "./views/leader";
import { NoRoleHome } from "./views/no-role";
import { APP_NAME } from "./views/parts";
import { ProjectAdminHome } from "./views/project-admin";
import { SystemAdminHome } from "./views/system-admin";

/** 首页按最高职级显示：每个职级一个视图，都是根页面（页头不带返回，底部是导航）。 */
export default function Home(): JSX.Element {
  useSessionGuard();
  const { state, phase } = useSession();
  const me = state.me;
  if (me === null)
    // 会话还没读回来（或正要跳去登录）：先把版面站住。
    return (
      <Screen header={<AppHeader title={APP_NAME} />}>
        <SkeletonSign />
        <SkeletonRows rows={3} gap />
        <BottomNav active="home" />
      </Screen>
    );
  // 换了账号就重新开始，不带着上一个人的选择和状态。
  const key = `${FRONTEND_DEMO}:${API_BASE_URL}:${me.user.id}`;
  switch (roleHomePanel(me.roles.highestRoleCode)) {
    case "worker":
      return <WorkerHome key={`${key}:${phase}`} userId={me.user.id} />;
    case "teamLeader":
      return <LeaderHome key={key} me={me} />;
    case "projectAdmin":
      return <ProjectAdminHome key={key} me={me} />;
    case "companyAdmin":
      return <CompanyAdminHome key={key} me={me} />;
    case "systemAdmin":
      return <SystemAdminHome key={key} me={me} />;
    case "none":
      return <NoRoleHome />;
  }
}
