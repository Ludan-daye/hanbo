import type { StatusKind } from "../../components/ui/status-kind";
import { FEATURES, PANEL_LABELS } from "../../routing/features";
import type { PanelKey } from "../../routing/roleHome";
import type { AccountProfile } from "../../services/account";
import type { MyFace } from "../../services/face";
import type { MyProjectMembership } from "../../services/me.types";

// “我的”页面上要算的东西，不碰界面，方便单测。

type RowStatus = { readonly kind: StatusKind; readonly text: string };

/** 工牌上的名字：先用真实姓名，没有就用昵称。null 表示资料还没读到。 */
export const badgeName = (account: AccountProfile | null): string | null =>
  account === null
    ? null
    : account.realName || account.nickname || "还没有填姓名";

/** 工牌第二行：职级，后面跟班组或项目。 */
export const badgeRoleLine = (
  panel: PanelKey,
  projects: readonly MyProjectMembership[] | null,
): string => {
  const role = PANEL_LABELS[panel];
  if (projects === null || projects.length === 0) return role;
  if (projects.length > 1) return `${role}，${projects.length} 个项目`;
  return `${role}，${projects[0].teamName ?? projects[0].projectName}`;
};

/** 工牌第三行：手机号和登录方式。 */
export const badgeContactLine = (
  account: AccountProfile | null,
  demo: boolean,
): string =>
  `${account?.phoneMasked ?? "还没有填手机号"}，${demo ? "演示账号" : "微信已关联"}`;

/** “人脸底照”那一行后面的状态；还没读到时不显示。 */
export const faceRowStatus = (face: MyFace | null): RowStatus | undefined => {
  if (face === null) return undefined;
  if (face.profile === null) return { kind: "warn", text: "待录入" };
  switch (face.profile.status) {
    case "APPROVED":
      return { kind: "ok", text: "已通过" };
    case "PENDING":
      return { kind: "warn", text: "审核中" };
    case "REJECTED":
      return { kind: "bad", text: "未通过" };
    default:
      return undefined;
  }
};

export type ProfileEntry = {
  readonly title: string;
  readonly url: string;
  /** 右边的灰字。 */
  readonly value?: string;
};

const SAFETY_CREDIT: ProfileEntry = {
  title: "安全信用",
  url: "/pages/my-safety-credit/index",
};

/**
 * 记录那一组。
 * 工人：考勤、补卡、安全信用（项目和任务在首页和“项目”里）。
 * 管理人员：我的项目、我的任务、我的考勤、补卡申请；本人档案是工人档案的，再加安全信用。
 */
export const recordEntries = (input: {
  readonly panel: PanelKey;
  readonly workerProfile: boolean;
  /** 读到了几个项目；没读到是 null。 */
  readonly projectCount: number | null;
}): readonly ProfileEntry[] => {
  if (input.panel === "worker")
    return [
      { title: "我的考勤", url: "/pages/my-records/index?range=MONTH" },
      { title: "补卡记录", url: "/pages/my-makeups/index" },
      SAFETY_CREDIT,
    ];
  return [
    ...FEATURES.worker.map(
      (feature): ProfileEntry => ({
        title: feature.title,
        url: feature.url,
        value:
          feature.url === "/pages/my-projects/index" &&
          input.projectCount !== null
            ? `${input.projectCount} 个项目`
            : undefined,
      }),
    ),
    ...(input.workerProfile ? [SAFETY_CREDIT] : []),
  ];
};
