import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";

import {
  Notice,
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
import { fetchProjectAdmins } from "../../services/management";
import type { ProjectAdmins } from "../../services/management.types";
import { useSession } from "../../store/session";

import { projectAdminLines } from "./admins-view";

const go = (url: string): void => {
  void Taro.navigateTo({ url });
};

/**
 * 项目负责人：公司每个项目一块，写着现在的项目管理员；没有管理员的项目排在最前面、标红。
 * 点一个人看他在全公司的任职，在那里任免或离岗；点“任命管理员”进该项目的人员页。
 */
export default function CompanyAdmins(): JSX.Element {
  useSessionGuard();
  const { state } = useSession();
  const companyId = useManagedCompanyId(state.me);
  const { revision, refresh } = usePageRefresh();
  const userId = state.me?.user.id;
  const data = useCachedRead<ProjectAdmins>(
    companyId === null || userId === undefined
      ? null
      : `${userId}:project-admins:${companyId}`,
    () => fetchProjectAdmins(companyId ?? ""),
    revision,
    "项目负责人没读到",
  );
  const lines = projectAdminLines(data.data);
  const missing = lines.filter((line) => line.missing).length;
  const header = <PageHeader title="项目负责人" />;
  if (companyId === null)
    return (
      <Screen header={header}>
        <StateView kind="empty" title="请从公司工作台进入" />
      </Screen>
    );
  return (
    <Screen header={header}>
      {data.data === null ? (
        data.error !== null ? (
          <StateView title="项目负责人没读到" sub={data.error} onRetry={refresh} />
        ) : (
          <SkeletonRows rows={4} gap />
        )
      ) : (
        <>
          <SignLine
            title={missing > 0 ? `${missing} 个项目没有管理员` : "每个项目都有管理员"}
            sub="项目管理员的任免由公司管理员办理"
            value={String(lines.length)}
          />
          {lines.length === 0 ? (
            <StateView kind="empty" title="还没有项目" sub="新建项目时选好管理员。" />
          ) : (
            lines.map((line) => (
              <View key={line.projectId}>
                <SectionTitle
                  action="任命管理员"
                  onAction={() =>
                    go(`/pages/participants/index?projectId=${encodeURIComponent(line.projectId)}`)
                  }
                >
                  {line.title}
                </SectionTitle>
                <Sheet>
                  {line.admins.length === 0 ? (
                    <Row
                      title="还没有项目管理员"
                      sub="到项目人员里把一个人的身份改成项目管理员"
                      status={line.missing ? { kind: "bad", text: "缺管理员" } : undefined}
                      hazard={line.missing}
                      chevron
                      onClick={() =>
                        go(`/pages/participants/index?projectId=${encodeURIComponent(line.projectId)}`)
                      }
                    />
                  ) : (
                    line.admins.map((admin) => (
                      <Row
                        key={admin.memberId}
                        title={admin.displayName ?? "姓名待补录"}
                        sub={admin.phone}
                        status={admin.isBound ? undefined : { kind: "warn", text: "未绑定" }}
                        chevron
                        onClick={() =>
                          go(
                            `/pages/company-person/index?companyId=${encodeURIComponent(companyId)}&participantType=${admin.participantType}&profileId=${encodeURIComponent(admin.profileId)}`,
                          )
                        }
                      />
                    ))
                  )}
                </Sheet>
              </View>
            ))
          )}
          {data.error !== null ? <Notice tone="error">{data.error}</Notice> : null}
        </>
      )}
    </Screen>
  );
}
