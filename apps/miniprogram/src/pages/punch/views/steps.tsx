import { Image, View } from "@tarojs/components";

import { BottomBar, Button, Notice, Say } from "../../../components/ui";

/** 第 2 步：看一眼刚拍的现场照片，不满意就重拍。 */
export const PhotoView = ({
  path,
  taking,
  problem,
  onNext,
  onRetake,
}: {
  readonly path: string;
  readonly taking: boolean;
  readonly problem: string | null;
  readonly onNext: () => void;
  readonly onRetake: () => void;
}): JSX.Element => (
  <>
    <View className="m-step">
      <Say title="现场照片拍好了" sub="只能现场拍，不能从相册选。" />
      <Image className="punch-photo" src={path} mode="aspectFill" />
      {problem !== null ? <Notice tone="error">{problem}</Notice> : null}
    </View>
    <BottomBar
      primary={taking ? "拍照中…" : "下一步：安全交底"}
      busy={taking}
      onPrimary={onNext}
    >
      <Button variant="outline" disabled={taking} onClick={onRetake}>
        重拍
      </Button>
    </BottomBar>
  </>
);

/** 第 4 步：人脸核验。录像界面由 VideoFaceCapture 盖在上面，这里是它前后的那一屏。 */
export const FaceView = ({
  phase,
  demo,
  resume,
  expired,
  problem,
  onStart,
  onRetake,
}: {
  readonly phase: "ready" | "preparing" | "verifying";
  /** 演示版用自拍代替人脸核验。 */
  readonly demo: boolean;
  /** 上一次核验已经做完，只差确认结果。 */
  readonly resume: boolean;
  readonly expired: boolean;
  readonly problem: string | null;
  readonly onStart: () => void;
  readonly onRetake: () => void;
}): JSX.Element => (
  <>
    <View className="m-step">
      {phase === "preparing" ? (
        <Say title="正在准备人脸核验" sub="请留在考勤范围内。" />
      ) : phase === "verifying" ? (
        <Say title="正在核验" sub="按屏幕上的提示完成动作。" />
      ) : demo ? (
        <Say
          title="拍一张自拍，完成打卡"
          sub="演示版用自拍代替人脸核验，不会真的比对。"
        />
      ) : (
        <Say
          title="核验本人"
          sub="按提示做两个动作，大约 8 秒。核验通过后自动保存。"
        />
      )}
      {expired ? (
        <Notice tone="warning">
          上次的核验结果过期了
          <View className="ui-notice__sub">重新核验一次，通过后自动保存。</View>
        </Notice>
      ) : null}
      {problem !== null ? <Notice tone="error">{problem}</Notice> : null}
    </View>
    <BottomBar
      primary={
        phase === "preparing"
          ? "准备中…"
          : phase === "verifying"
            ? "核验中…"
            : demo
              ? "拍照并打卡"
              : resume
                ? "确认核验结果"
                : "开始人脸核验"
      }
      busy={phase !== "ready"}
      onPrimary={onStart}
    >
      {phase === "ready" ? (
        <Button variant="text" onClick={onRetake}>
          重拍现场照片
        </Button>
      ) : null}
    </BottomBar>
  </>
);

/** 核验通过之后的保存：保存中、没保存上、保存前还要再开定位权限。 */
export const SavingView = ({
  state,
  demo,
  problem,
  onRetry,
  onSettings,
}: {
  readonly state: "saving" | "retry" | "settings";
  readonly demo: boolean;
  readonly problem: string | null;
  readonly onRetry: () => void;
  readonly onSettings: () => void;
}): JSX.Element =>
  state === "saving" ? (
    <>
      <Say
        title="正在保存打卡"
        sub={
          demo
            ? "正在保存这条演示记录，请稍等。"
            : "人脸核验已经通过。保存完成才算打上卡，请稍等。"
        }
      />
      <BottomBar primary="保存中…" busy />
    </>
  ) : state === "settings" ? (
    <>
      <Say
        title="需要打开定位权限"
        sub="人脸核验已经通过，保存前还要再核对一次位置。"
      />
      <BottomBar primary="去设置" onPrimary={onSettings} />
    </>
  ) : (
    <>
      <Say
        title="打卡还没保存"
        sub="人脸核验已经通过，保存时出了问题。核验结果还有效，不用重拍。"
      />
      {problem !== null ? <Notice tone="error">{problem}</Notice> : null}
      <BottomBar primary="重新提交" onPrimary={onRetry} />
    </>
  );
