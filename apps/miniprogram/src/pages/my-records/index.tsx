import { PageHeader, Screen } from "../../components/ui/index";
import { WorkerRecords } from "../../components/worker-records";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { useSession } from "../../store/session";

/**
 * 我的考勤：所有角色同一套版式。
 * 账号还没读到时只放页头（Screen 自己会显示骨架）；换了账号整页重建，筛选和展开状态不带过去。
 */
export default function MyRecords(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  return state.me ? (
    <WorkerRecords key={state.me.user.id} />
  ) : (
    <Screen header={<PageHeader title="我的考勤" />} />
  );
}
