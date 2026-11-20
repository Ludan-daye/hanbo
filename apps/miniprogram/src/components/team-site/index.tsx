import Taro from "@tarojs/taro";

import { PageHeader, Row, Screen, Sheet, StateView } from "../ui/index";
import type { LineIconName } from "../ui/line-icon";
import type { MeResponse } from "../../services/auth.types";

/** 一个班组现场能办的事：和班组长工作台同一批页面。 */
export const TEAM_SITE_ENTRIES: ReadonlyArray<{
  readonly title: string;
  readonly sub: string;
  readonly icon: LineIconName;
  readonly url: string;
}> = [
  { title: "工作安排", sub: "安排工人，邀请临时工", icon: "task", url: "/pages/team-work/index" },
  { title: "班组安全", sub: "安全交底和隐患整改", icon: "shield", url: "/pages/team-safety/index" },
  { title: "班组日报", sub: "出勤和工作汇总", icon: "doc", url: "/pages/team-log/index" },
  { title: "违规登记", sub: "登记违规、看安全信用", icon: "star", url: "/pages/safety-credit/index" },
  { title: "班组考勤", sub: "日报、周报和月报", icon: "chart", url: "/pages/team-attendance/index" },
];

export const teamSiteUrl = (
  url: string,
  projectId: string,
  teamId: string,
): string =>
  `${url}?teamId=${encodeURIComponent(teamId)}&projectId=${encodeURIComponent(projectId)}`;

/** 班组现场的几项入口，放在 Sheet 外面也行：自带一个 Sheet。 */
export const TeamSiteEntries = ({
  projectId,
  teamId,
}: {
  readonly projectId: string;
  readonly teamId: string;
}): JSX.Element => (
  <Sheet gap>
    {TEAM_SITE_ENTRIES.map((entry) => (
      <Row
        key={entry.url}
        title={entry.title}
        sub={entry.sub}
        icon={entry.icon}
        chevron
        onClick={() =>
          void Taro.navigateTo({
            url: teamSiteUrl(entry.url, projectId, teamId),
          })
        }
      />
    ))}
  </Sheet>
);

/** 这个账号能不能从项目里挑班组（项目管理员及以上）。 */
export const canPickTeam = (me: MeResponse | null): boolean =>
  me?.roles.assignments.some((assignment) =>
    ["PROJECT_ADMIN", "COMPANY_ADMIN", "SYSTEM_ADMIN"].includes(
      assignment.roleCode,
    ),
  ) ?? false;

/**
 * 班组页面没有班组可用时的样子：项目管理员给一个“选择班组”，去班组现场挑；
 * 其余账号说明这里只给班组长用。
 */
export const NoTeamScreen = ({
  title,
  me,
}: {
  readonly title: string;
  readonly me: MeResponse | null;
}): JSX.Element => {
  const { projectId } = Taro.useRouter().params;
  return (
  <Screen header={<PageHeader title={title} />}>
    {canPickTeam(me) ? (
      <StateView
        kind="empty"
        title="先选一个班组"
        sub="项目管理员可以替班组长办理这里的事。"
        retryLabel="选择班组"
        onRetry={() =>
          void Taro.redirectTo({
            url: `/pages/team-site/index${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ""}`,
          })
        }
      />
    ) : (
      <StateView
        kind="empty"
        title="请先选择负责的班组"
        sub="这里给班组长和项目管理员用。"
      />
    )}
  </Screen>
  );
};
