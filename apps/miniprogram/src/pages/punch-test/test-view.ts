import type { StatusKind } from "../../components/ui/status-kind";

export type TestPhase =
  | "IDLE"
  | "LOCATING"
  | "PHOTO"
  | "PREPARING"
  | "VERIFYING";

/**
 * 接下来该做哪一件事。profile：活体核验要用底照，底照还不能用，先去人脸档案；
 * done：三步都过了。
 */
export type TestNext = "locate" | "photo" | "profile" | "face" | "done";

export const punchTestNext = (input: {
  readonly finished: boolean;
  /** 在项目范围内，定位精度也够。 */
  readonly inside: boolean;
  readonly uploaded: boolean;
  readonly faceReady: boolean;
}): TestNext =>
  input.finished
    ? "done"
    : !input.inside
      ? "locate"
      : !input.uploaded
        ? "photo"
        : !input.faceReady
          ? "profile"
          : "face";

/** 底部那个按钮上写什么：正在做的事，或者下一步该做的事。 */
export const punchTestPrimary = (input: {
  readonly phase: TestPhase;
  readonly next: TestNext;
  /** 已经定过一次位（没通过）。 */
  readonly located: boolean;
  /** 手里有一次核验结果：刚录完正在确认，或者上一次没通过。 */
  readonly faceTried: boolean;
}): string => {
  if (input.phase === "LOCATING") return "定位中…";
  if (input.phase === "PHOTO") return "拍照上传中…";
  // 录像前后都要再核对一次位置：前一次是准备，后一次是确认结果。
  if (input.phase === "PREPARING")
    return input.faceTried ? "确认结果中…" : "准备核验中…";
  if (input.phase === "VERIFYING") return "核验中…";
  if (input.next === "done") return "返回";
  if (input.next === "locate") return input.located ? "重新定位" : "开始定位";
  if (input.next === "photo") return "拍照并上传";
  if (input.next === "profile") return "查看人脸档案";
  return input.faceTried ? "重新核验" : "开始活体核验";
};

export type TestRow = {
  readonly key: "locate" | "photo" | "face";
  readonly state: "done" | "now" | "todo";
  readonly title: string;
  readonly sub: string;
  readonly status: { readonly kind: StatusKind; readonly text: string };
};

export type TestLocation = {
  readonly isInside: boolean;
  readonly accuracyPassed: boolean;
  readonly distanceM: number;
  readonly radiusM: number;
  readonly accuracyLimitM: number | null;
};

const profileNote = (
  videoEnabled: boolean,
  profileStatus: string | null,
): string => {
  if (!videoEnabled) return "视频活体没启用，请联系管理员";
  if (profileStatus === null) return "还没录入底照，先到人脸档案录一张";
  if (profileStatus === "APPROVED") return "录一段动作视频，和底照比对";
  if (profileStatus === "PENDING")
    return "录一段动作视频，和底照比对。底照还在审核，正式打卡要等审核通过";
  if (profileStatus === "REJECTED") return "底照审核没通过，先到人脸档案重新录";
  return "底照现在不能用，先到人脸档案看看";
};

/** 三步的结果，竖着排成一条时间线。 */
export const punchTestRows = (input: {
  readonly phase: TestPhase;
  readonly next: TestNext;
  /** 最近一次定位的结果；还没定位，或正在重新核对时为 null。 */
  readonly location: TestLocation | null;
  /** 现场照片传上去之后的大小；还没传为 null。 */
  readonly uploadedBytes: number | null;
  /** 活体核验的结果；还没核验为 null。 */
  readonly faceResult: "VERIFIED" | "FAILED" | null;
  readonly videoEnabled: boolean;
  /** 底照的审核状态；没有底照为 null。 */
  readonly profileStatus: string | null;
}): ReadonlyArray<TestRow> => {
  const { phase, next, location } = input;
  // 正在做的那一步，或者下一步该做的那一步：这一行是橙点。
  const current: TestRow["key"] | null =
    phase === "LOCATING"
      ? "locate"
      : phase === "PHOTO"
        ? "photo"
        : phase !== "IDLE"
          ? "face"
          : next === "done"
            ? null
            : next === "profile"
              ? "face"
              : next;
  const waiting = (key: TestRow["key"]): Pick<TestRow, "state" | "status"> => ({
    state: current === key ? "now" : "todo",
    status: { kind: current === key ? "warn" : "idle", text: "待测试" },
  });
  const failed: TestRow["status"] = { kind: "bad", text: "没通过" };

  const range =
    location === null
      ? ""
      : `距中心 ${Math.round(location.distanceM)} 米，允许 ${location.radiusM} 米`;
  const locate: Omit<TestRow, "key" | "title"> =
    phase === "LOCATING"
      ? {
          state: "now",
          sub: "正在定位",
          status: { kind: "warn", text: "定位中" },
        }
      : location === null
        ? phase === "IDLE"
          ? { ...waiting("locate"), sub: "核对你是不是在项目范围内" }
          : {
              state: "todo",
              sub: "正在重新核对位置",
              status: { kind: "warn", text: "核对中" },
            }
        : !location.isInside
          ? { state: "now", sub: range, status: failed }
          : !location.accuracyPassed
            ? {
                state: "now",
                sub: `定位精度不够，要求误差不超过 ${location.accuracyLimitM} 米`,
                status: failed,
              }
            : {
                state: "done",
                sub: range,
                status: { kind: "ok", text: "通过" },
              };

  const photo: Omit<TestRow, "key" | "title"> =
    phase === "PHOTO"
      ? {
          state: "now",
          sub: "正在拍照上传",
          status: { kind: "warn", text: "上传中" },
        }
      : input.uploadedBytes !== null
        ? {
            state: "done",
            sub: `已上传 ${Math.round(input.uploadedBytes / 1024)}KB`,
            status: { kind: "ok", text: "已上传" },
          }
        : { ...waiting("photo"), sub: "在范围内拍一张，传到测试服务器" };

  const face: Omit<TestRow, "key" | "title"> =
    input.faceResult === "VERIFIED"
      ? {
          state: "done",
          sub: "动作和本人比对都通过了",
          status: { kind: "ok", text: "通过" },
        }
      : input.faceResult === "FAILED"
        ? {
            state: "now",
            sub: "活体或本人比对没通过，按提示的动作顺序再测一次",
            status: failed,
          }
        : phase === "PREPARING" || phase === "VERIFYING"
          ? {
              state: "now",
              sub: "按屏幕上的提示录一段动作视频",
              status: { kind: "warn", text: "核验中" },
            }
          : {
              ...waiting("face"),
              sub: profileNote(input.videoEnabled, input.profileStatus),
            };

  return [
    { key: "locate", title: "1 定位", ...locate },
    { key: "photo", title: "2 现场照片", ...photo },
    { key: "face", title: "3 活体核验", ...face },
  ];
};
