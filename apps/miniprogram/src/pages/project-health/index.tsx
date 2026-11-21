import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";

import {
  PageHeader,
  Row,
  Screen,
  SectionTitle,
  Sheet,
  SignLine,
  SkeletonRows,
  StateView,
} from "../../components/ui/index";
import { useCachedRead } from "../../hooks/use-cached-read";
import { useManagedCompanyId } from "../../hooks/use-management-scope";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSessionGuard } from "../../hooks/use-session-guard";
import { fetchProjectHealth } from "../../services/management";
import type { ProjectHealth } from "../../services/management.types";
import { useSession } from "../../store/session";

import { healthLines, healthOrder } from "./health-view";

/**
 * 各项目一览（2026-11-21 Q10，单独一页）：每个项目的违规、申诉、底照、资料未核实和低信用人数，
 * 点一行进对应的列表。首页只放“等你处理”，这里放全量。
 */
export default function ProjectHealthPage(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const companyId = useManagedCompanyId(state.me);
  const { revision, refresh } = usePageRefresh();
  const userId = state.me?.user.id;
  const read = useCachedRead<ProjectHealth>(
    companyId === null || userId === undefined ? null : `${userId}:project-health:${companyId}`,
    () => fetchProjectHealth(companyId ?? ""),
    revision,
    "各项目一览没读到",
  );
  const header = <PageHeader title="各项目一览" />;
  if (companyId === null)
    return (
      <Screen header={header}>
        <StateView kind="empty" title="请从公司工作台进入" />
      </Screen>
    );
  if (read.data === null)
    return (
      <Screen header={header}>
        {read.error !== null ? (
          <StateView title="各项目一览没读到" sub={read.error} onRetry={refresh} />
        ) : (
          <SkeletonRows rows={4} gap />
        )}
      </Screen>
    );
  const projects = healthOrder(read.data.projects);
  const busy = projects.filter((project) => healthLines(project, companyId).length > 0).length;
  return (
    <Screen header={header}>
      <SignLine
        title={busy === 0 ? "各项目都没有积压" : `${busy} 个项目有要处理的事`}
        sub="违规、申诉、底照、资料核实和低信用人数"
        value={`${projects.length} 个项目`}
      />
      {projects.map((project) => {
        const lines = healthLines(project, companyId);
        return (
          <View key={project.projectId}>
            <SectionTitle>{project.name}</SectionTitle>
            <Sheet>
              {lines.length === 0 ? (
                <Row title="没有积压" mute />
              ) : (
                lines.map((line) => (
                  <Row
                    key={line.key}
                    title={line.title}
                    value={`${line.count}`}
                    hazard
                    chevron
                    onClick={() => {
                      void Taro.navigateTo({ url: line.url });
                    }}
                  />
                ))
              )}
            </Sheet>
          </View>
        );
      })}
    </Screen>
  );
}
