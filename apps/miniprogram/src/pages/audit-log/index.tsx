import Taro from "@tarojs/taro";

import { PageHeader, Screen, StateView } from "../../components/ui/index";
import {
  useManagedCompanyId,
  useManagedProjectId,
} from "../../hooks/use-management-scope";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { useSession } from "../../store/session";

import { AuditLogList } from "./audit-list";
import { auditLogScope } from "./audit-view";

/**
 * 操作记录：项目管理员看本项目、公司管理员看本公司各项目里谁在什么时候做了什么。
 * 列表和平台管理的“日志”标签共用（audit-list.tsx）。
 */
export default function AuditLog(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const params = Taro.useRouter().params;
  const projectId = useManagedProjectId(state.me);
  const companyId = useManagedCompanyId(state.me);
  const scope = auditLogScope({
    projectParam: params.projectId,
    companyParam: params.companyId,
    projectId,
    companyId,
  });
  const { revision, refresh } = usePageRefresh();

  const header = <PageHeader title="操作记录" />;
  if (scope === null)
    return (
      <Screen header={header}>
        <StateView
          kind="empty"
          title="没有可以看的项目"
          sub="项目管理员和公司管理员才能看操作记录。"
        />
      </Screen>
    );
  return (
    <Screen header={header}>
      <AuditLogList
        key={scope.kind === "PLATFORM" ? scope.kind : `${scope.kind}:${scope.id}`}
        scope={scope}
        revision={revision}
        onRetry={refresh}
      />
    </Screen>
  );
}
