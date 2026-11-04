import type { AccountProfile } from "./account";
import type { MyFace } from "./face";
import type { WorkerMonthSummary } from "./worker-home";

export type WorkerReminder = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly url: string;
};

/** Match the punch page's local demo exception without relaxing formal verification. */
export const workerCanUseDemoFace = (
  face: MyFace | null,
  isDemo: boolean,
): boolean => isDemo && face?.mode === "DEVELOPMENT";

export const workerFaceBlocker = (
  face: MyFace | null,
  isDemo = false,
): WorkerReminder | null => {
  if (face === null) return null;
  const link = { id: "face", url: "/pages/face-profile/index" };
  if (face.mode === "UNCONFIGURED")
    return {
      ...link,
      title: "刷脸核验暂不可用",
      description:
        face.profile?.status === "REJECTED"
          ? `请联系管理员检查核验服务。底照审核未通过：${face.profile.reviewReason || "请按审核意见重新拍摄本人正脸。"}`
          : "请联系管理员检查核验服务。",
    };
  if (face.profile?.status === "APPROVED")
    return face.mode === "WECHAT_NATIVE" ||
      face.mode === "VIDEO_ACTION" ||
      workerCanUseDemoFace(face, isDemo)
      ? null
      : {
          ...link,
          title: "刷脸核验暂不可用",
          description: "请联系项目管理员确认正式核验服务。",
        };
  if (face.profile === null)
    return {
      ...link,
      title: "先准备本人底照",
      description: "审核通过后，才能进行正式打卡。",
    };
  if (face.profile.status === "PENDING")
    return {
      ...link,
      title: "底照正在审核",
      description: "审核通过后可打卡，请等待管理员审核。",
    };
  if (face.profile.status === "REJECTED")
    return {
      ...link,
      title: "底照需要重新提交",
      description:
        face.profile.reviewReason || "请按审核意见重新拍摄本人正脸。",
    };
  return {
    ...link,
    title: "请确认底照状态",
    description: "请查看人脸档案审核结果。",
  };
};

export const workerHomeReminders = (
  account: AccountProfile | null,
  face: MyFace | null,
  month: WorkerMonthSummary | null,
  isDemo = false,
): readonly WorkerReminder[] => {
  const reminders: WorkerReminder[] = [];
  const blocker = workerFaceBlocker(face, isDemo);
  if (blocker) reminders.push(blocker);
  if (
    account &&
    (!account.realName ||
      !account.phone ||
      !account.nickname ||
      !account.avatarDataUrl)
  )
    reminders.push({
      id: "profile",
      title: "完善本人资料",
      description: "完善姓名、手机号、头像和昵称。",
      url: "/pages/profile/index",
    });
  if (month?.missingDays)
    reminders.push({
      id: "missing",
      title: `本月有 ${month.missingDays} 项缺卡待核对`,
      description: "按实际出勤申请补卡。",
      url: "/pages/my-records/index?range=MONTH",
    });
  if (month?.rejectedMakeups)
    reminders.push({
      id: "rejected",
      title: `${month.rejectedMakeups} 条补卡申请被驳回`,
      description: "查看审批意见，核对后再处理。",
      url: "/pages/my-makeups/index",
    });
  if (month?.pendingMakeups)
    reminders.push({
      id: "pending",
      title: `${month.pendingMakeups} 条补卡申请待审批`,
      description: "审批中，请勿重复申请。",
      url: "/pages/my-makeups/index",
    });
  return reminders;
};
