import { Camera, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button, Notice, Subtitle } from "../ui/index";
import type {
  CompletedFaceSession,
  VideoFaceSession,
} from "../../services/face";
import { ApiError } from "../../services/apiClient";

import "./index.scss";

export type VideoFaceFlow<Result extends CompletedFaceSession> = {
  readonly createSession: () => Promise<VideoFaceSession>;
  readonly fetchResult: (sessionId: string) => Promise<Result>;
  readonly uploadVideo: (
    sessionId: string,
    filePath: string,
  ) => Promise<Result>;
};
type Props<Result extends CompletedFaceSession> = {
  readonly flow: VideoFaceFlow<Result>;
  readonly referenceDescription: string;
  readonly onResult: (result: Result) => void;
  readonly onCancel: () => void;
};
type Phase =
  | "READY"
  | "PREPARING"
  | "RECORDING"
  | "UPLOADING"
  | "RETRY"
  | "FAILED";
const actionText = (action: "1" | "2"): string =>
  action === "1" ? "请张嘴，再自然合上" : "请闭眼，再自然睁开";
const errorText = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "errMsg" in error)
    return String(error.errMsg);
  return "录像未完成，请重新操作。";
};

/** Capture a fresh front-camera video; only the authenticated server confirms identity. */
export const VideoFaceCapture = <Result extends CompletedFaceSession>({
  flow,
  referenceDescription,
  onResult,
  onCancel,
}: Props<Result>): JSX.Element => {
  const [phase, setPhase] = useState<Phase>("READY");
  const [ready, setReady] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<VideoFaceSession | null>(null);
  const [seconds, setSeconds] = useState<number>(0);
  const filePath = useRef<string | null>(null);
  const camera = useRef<Taro.CameraContext | null>(null);
  const active = useRef<boolean>(true);
  const recording = useRef<boolean>(false);
  const stopping = useRef<boolean>(false);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      if (recording.current && camera.current !== null) {
        camera.current.stopRecord({
          fail: (reason): void =>
            console.warn("FACE_RECORDING_CLEANUP_FAILED", {
              errMsg: reason.errMsg,
            }),
        });
      }
    };
  }, []);

  const confirm = useCallback(
    async (issued: VideoFaceSession, video: string): Promise<void> => {
      setPhase("UPLOADING");
      setError(null);
      try {
        if (new Date(issued.expiresAt).getTime() <= Date.now())
          throw new Error("本次核验已过期，请关闭后重新开始。");
        const current = await flow.fetchResult(issued.id);
        if (!active.current) return;
        if (current.status === "VERIFYING")
          throw new Error("云端仍在处理本次录像，请稍后点击确认结果。");
        const result =
          current.status === "PENDING"
            ? await flow.uploadVideo(issued.id, video)
            : current;
        if (!active.current) return;
        onResult(result);
        if (result.status === "VERIFIED") return;
        setPhase("FAILED");
        setError(
          "活体检测或本人比对未通过，请确认是本人操作、光线充足，并按顺序完成动作后重新核验。",
        );
      } catch (reason: unknown) {
        if (!active.current) return;
        const terminal: boolean =
          reason instanceof ApiError &&
          [400, 403, 404, 410, 413].includes(reason.statusCode);
        setPhase(terminal ? "FAILED" : "RETRY");
        setError(errorText(reason));
      }
    },
    [flow, onResult],
  );

  const stop = useCallback(async (): Promise<void> => {
    if (
      stopping.current ||
      !recording.current ||
      camera.current === null ||
      session === null
    )
      return;
    stopping.current = true;
    setPhase("UPLOADING");
    try {
      const context: Taro.CameraContext = camera.current;
      const result =
        await new Promise<Taro.CameraContext.StopRecordSuccessCallbackResult>(
          (resolve, reject) =>
            context.stopRecord({ success: resolve, fail: reject }),
        );
      recording.current = false;
      if (!active.current) return;
      const info = await Taro.getFileInfo({ filePath: result.tempVideoPath });
      if (!("size" in info)) throw new Error("未能读取录像大小，请重新录制。");
      if (info.size > 5 * 1024 * 1024)
        throw new Error("录像超过 5MB，请关闭后重新录制。");
      filePath.current = result.tempVideoPath;
      await confirm(session, result.tempVideoPath);
    } catch (reason: unknown) {
      if (active.current) {
        setPhase("FAILED");
        setError(errorText(reason));
      }
    } finally {
      stopping.current = false;
    }
  }, [session, confirm]);

  useEffect(() => {
    if (phase !== "RECORDING") return;
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [phase]);
  useEffect(() => {
    if (phase === "RECORDING" && seconds >= 8) void stop();
  }, [phase, seconds, stop]);

  const interrupted = (): void => {
    recording.current = false;
    if (active.current) {
      setReady(false);
      setPhase("FAILED");
      setError("相机已暂停，本次录像不用于核验。请关闭后重新进入。");
    }
  };
  Taro.useDidHide(interrupted);

  const start = async (): Promise<void> => {
    if (
      !ready ||
      camera.current === null ||
      (phase !== "READY" && phase !== "FAILED")
    )
      return;
    setPhase("PREPARING");
    setError(null);
    setSeconds(0);
    filePath.current = null;
    try {
      const issued = await flow.createSession();
      if (!active.current) return;
      setSession(issued);
      const context: Taro.CameraContext = camera.current;
      await new Promise<void>((resolve, reject) =>
        context.startRecord({
          success: (): void => resolve(),
          fail: reject,
          timeoutCallback: interrupted,
        }),
      );
      if (!active.current) {
        context.stopRecord({
          fail: (reason): void =>
            console.warn("FACE_RECORDING_CANCEL_FAILED", {
              errMsg: reason.errMsg,
            }),
        });
        return;
      }
      recording.current = true;
      setPhase("RECORDING");
    } catch (reason: unknown) {
      if (active.current) {
        setPhase("FAILED");
        setError(errorText(reason));
      }
    }
  };
  const action = session?.actionSequence[seconds < 4 ? 0 : 1];
  const instruction: string =
    phase === "RECORDING" && action !== undefined
      ? actionText(action)
      : phase === "UPLOADING"
        ? "正在确认活体与本人比对结果"
        : "正对前置镜头，保持光线均匀";
  return (
    <View className="video-face">
      <View className="video-face__sheet">
        <View className="video-face__title">本人活体核验</View>
        <Subtitle>{referenceDescription}</Subtitle>
        {process.env.TARO_ENV === "weapp" ? (
          <Camera
            className="video-face__camera"
            mode="normal"
            devicePosition="front"
            resolution="low"
            flash="off"
            onInitDone={() => {
              camera.current = Taro.createCameraContext();
              setReady(true);
            }}
            onStop={interrupted}
            onError={() => {
              setReady(false);
              setPhase("FAILED");
              setError(
                "无法使用摄像头，请在微信设置中允许相机权限，再重新进入。",
              );
            }}
          />
        ) : (
          <Notice>请在微信小程序真机预览中使用摄像头核验。</Notice>
        )}
        <View className="video-face__instruction">{instruction}</View>
        {phase === "RECORDING" ? (
          <View className="video-face__count">
            录制中 · 剩余 {Math.max(0, 8 - seconds)} 秒
          </View>
        ) : null}
        <Subtitle>
          按提示完成两个动作，约 8
          秒自动结束。录像发送至腾讯云完成核验；仅由后端确认通过。
        </Subtitle>
        {error !== null ? <Notice>{error}</Notice> : null}
        {phase === "RETRY" ? (
          <Button
            onClick={() => {
              if (session !== null && filePath.current !== null)
                void confirm(session, filePath.current);
            }}
          >
            确认本次核验结果
          </Button>
        ) : (
          <Button
            disabled={!ready || !["READY", "FAILED"].includes(phase)}
            loading={phase === "PREPARING" || phase === "UPLOADING"}
            onClick={() => {
              void start();
            }}
          >
            {phase === "RECORDING"
              ? "请按提示完成动作"
              : phase === "UPLOADING"
                ? "正在核验…"
                : phase === "FAILED"
                  ? "重新核验"
                  : "开始录像核验"}
          </Button>
        )}
        <Button variant="outline" onClick={onCancel}>
          取消并返回
        </Button>
      </View>
    </View>
  );
};
