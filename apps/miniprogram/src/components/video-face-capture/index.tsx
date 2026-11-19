import { Camera, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button, Notice, Say } from "../ui/index";
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
          throw new Error("核验已过期，请重新开始。");
        const current = await flow.fetchResult(issued.id);
        if (!active.current) return;
        if (current.status === "VERIFYING")
          throw new Error("核验处理中，请稍后查看结果。");
        const result =
          current.status === "PENDING"
            ? await flow.uploadVideo(issued.id, video)
            : current;
        if (!active.current) return;
        onResult(result);
        if (result.status === "VERIFIED") return;
        setPhase("FAILED");
        setError(
          "核验未通过，请本人在光线充足处按顺序完成动作。",
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
      setError("相机已暂停，录像无效，请重新进入。");
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
        ? "正在核验"
        : "正对镜头，光线要足";
  return (
    <View className="video-face">
      <View className="video-face__sheet">
        <Say
          title={instruction}
          sub={
            phase === "RECORDING"
              ? `录制中，还剩 ${Math.max(0, 8 - seconds)} 秒`
              : referenceDescription
          }
        />
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
              setError("相机未授权，请在微信设置中开启。");
            }}
          />
        ) : (
          <Notice>相机核验只能在微信小程序里用手机做。</Notice>
        )}
        <Notice>
          两个动作，大约 8 秒，录完自动结束。录像会发到腾讯云做活体和本人比对，结果由服务器确认。
        </Notice>
        {error !== null ? <Notice tone="error">{error}</Notice> : null}
        {/* 这一层盖在页面上，页面底部的操作条被挡住了，所以按钮放在内容里。 */}
        <View className="video-face__actions">
          <Button variant="text" onClick={onCancel}>
            取消
          </Button>
          {phase === "RETRY" ? (
            <Button
              onClick={() => {
                if (session !== null && filePath.current !== null)
                  void confirm(session, filePath.current);
              }}
            >
              确认核验结果
            </Button>
          ) : (
            <Button
              disabled={!ready || !["READY", "FAILED"].includes(phase)}
              loading={phase === "PREPARING" || phase === "UPLOADING"}
              onClick={() => {
                void start();
              }}
            >
              {phase === "PREPARING"
                ? "准备中…"
                : phase === "RECORDING"
                  ? "录制中…"
                  : phase === "UPLOADING"
                    ? "核验中…"
                    : phase === "FAILED"
                      ? "重新核验"
                      : "开始录像"}
            </Button>
          )}
        </View>
      </View>
    </View>
  );
};
