import { Image, Picker } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  Button,
  ListItem,
  Notice,
  PageHeader,
  Screen,
  Section,
  StateView,
  Subtitle,
} from "../../components/ui";
import {
  VideoFaceCapture,
  type VideoFaceFlow,
} from "../../components/video-face-capture";
import { FRONTEND_DEMO } from "../../config/env";
import { usePageRefresh } from "../../hooks/use-page-refresh";
import { useSessionGuard } from "../../hooks/use-session-guard";
import {
  chooseAttendancePhoto,
  readAttendanceLocation,
} from "../../services/attendance-device";
import {
  createLivenessTest,
  faceStatusLabel,
  fetchLivenessTestResult,
  fetchMyFace,
  uploadLivenessTestVideo,
  type FaceLivenessTestResult,
  type MyFace,
} from "../../services/face";
import {
  checkAttendanceGeofence,
  type AttendanceLocation,
  type GeofenceCheck,
} from "../../services/geofence";
import { fetchAttendanceToday, fetchMyProjects } from "../../services/me";
import type {
  AttendanceTodayGeofence,
  MyProjectMembership,
} from "../../services/me.types";
import { uploadImage, type UploadResult } from "../../services/uploads";

type LocationResult = GeofenceCheck & {
  readonly position: AttendanceLocation;
  readonly geofence: AttendanceTodayGeofence;
  readonly accuracyPassed: boolean;
};
type Phase = "IDLE" | "LOCATING" | "PHOTO" | "PREPARING" | "VERIFYING";
const errorText = (reason: unknown): string => {
  if (reason instanceof Error) return reason.message;
  if (typeof reason === "object" && reason !== null && "errMsg" in reason)
    return String(reason.errMsg);
  return "测试未完成，请重试。";
};

export default function PunchTest(): JSX.Element {
  useSessionGuard();
  const { revision, refresh } = usePageRefresh();
  const [projects, setProjects] = useState<
    readonly MyProjectMembership[] | null
  >(null);
  const [projectId, setProjectId] = useState<string>("");
  const [face, setFace] = useState<MyFace | null>(null);
  const [location, setLocation] = useState<LocationResult | null>(null);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [upload, setUpload] = useState<UploadResult | null>(null);
  const [faceResult, setFaceResult] = useState<FaceLivenessTestResult | null>(
    null,
  );
  const [finished, setFinished] = useState<boolean>(false);
  const [phase, setPhase] = useState<Phase>("IDLE");
  const [error, setError] = useState<string | null>(null);
  const lock = useRef<boolean>(false);
  const phoneAvailable = process.env.TARO_ENV === "weapp" && !FRONTEND_DEMO;
  const inside = location?.isInside === true && location.accuracyPassed;
  const faceReady =
    face?.mode === "VIDEO_ACTION" &&
    face.profile !== null &&
    ["PENDING", "APPROVED"].includes(face.profile.status);
  const busy = phase !== "IDLE";

  useEffect(() => {
    let cancelled = false;
    void Promise.all([fetchMyProjects(), fetchMyFace()])
      .then(([rows, info]) => {
        if (cancelled) return;
        setProjects(rows);
        setFace(info);
        setProjectId((current) =>
          rows.some((row) => row.projectId === current)
            ? current
            : (rows[0]?.projectId ?? ""),
        );
        setError(null);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(errorText(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [revision]);

  const confirmLocation = useCallback(async (): Promise<void> => {
    if (!projectId) throw new Error("请先选择本人参与的项目。");
    setLocation(null);
    const today = await fetchAttendanceToday(projectId);
    const position = await readAttendanceLocation();
    const check = checkAttendanceGeofence(today.geofence, position);
    const limit = today.geofence.locationAccuracyLimitM;
    const accuracy =
      position.accuracyM === null ? null : Number(position.accuracyM);
    const accuracyPassed =
      limit === null ||
      (accuracy !== null &&
        Number.isFinite(accuracy) &&
        accuracy >= 0 &&
        accuracy <= limit);
    setLocation({
      ...check,
      position,
      geofence: today.geofence,
      accuracyPassed,
    });
    if (!check.isInside)
      throw new Error(
        `不在项目范围内：距中心 ${Math.round(check.distanceM)} 米，允许 ${today.geofence.radiusM} 米。请到达范围内后继续。`,
      );
    if (!accuracyPassed)
      throw new Error(
        `定位精度不足，项目要求误差不超过 ${limit} 米。请到开阔处重试。`,
      );
  }, [projectId]);

  const locate = async (): Promise<void> => {
    if (lock.current) return;
    lock.current = true;
    setPhase("LOCATING");
    setError(null);
    setFinished(false);
    setPhotoPath(null);
    setUpload(null);
    setFaceResult(null);
    try {
      await confirmLocation();
    } catch (reason: unknown) {
      setError(errorText(reason));
    } finally {
      lock.current = false;
      setPhase("IDLE");
    }
  };
  const takePhoto = async (): Promise<void> => {
    if (lock.current || !inside) return;
    lock.current = true;
    setPhase("PHOTO");
    setError(null);
    setFinished(false);
    setFaceResult(null);
    setPhotoPath(null);
    setUpload(null);
    try {
      await confirmLocation();
      const path = await chooseAttendancePhoto();
      setPhotoPath(path);
      setUpload(await uploadImage(path));
    } catch (reason: unknown) {
      setError(errorText(reason));
    } finally {
      lock.current = false;
      setPhase("IDLE");
    }
  };
  const startFace = async (): Promise<void> => {
    if (lock.current || upload === null || !faceReady) return;
    lock.current = true;
    setPhase("PREPARING");
    setError(null);
    setFinished(false);
    setFaceResult(null);
    try {
      await confirmLocation();
      setPhase("VERIFYING");
    } catch (reason: unknown) {
      setError(errorText(reason));
      lock.current = false;
      setPhase("IDLE");
    }
  };
  const flow = useMemo<VideoFaceFlow<FaceLivenessTestResult>>(
    () => ({
      createSession: async () => {
        await confirmLocation();
        return createLivenessTest();
      },
      fetchResult: fetchLivenessTestResult,
      uploadVideo: uploadLivenessTestVideo,
    }),
    [confirmLocation],
  );
  const finishFace = async (result: FaceLivenessTestResult): Promise<void> => {
    setFaceResult(result);
    setPhase("PREPARING");
    try {
      if (result.status !== "VERIFIED")
        throw new Error("活体或本人比对未通过，请按动作顺序重新测试。");
      await confirmLocation();
      setFinished(true);
    } catch (reason: unknown) {
      setError(errorText(reason));
    } finally {
      lock.current = false;
      setPhase("IDLE");
    }
  };

  return (
    <Screen>
      <PageHeader title="打卡流程测试" />
      <Notice>
        真实定位、拍照上传、腾讯云活体及本人比对；无需排班，不生成正式考勤。
      </Notice>
      {!phoneAvailable ? (
        <Notice>
          请在微信小程序手机预览中测试。网页演示不会调用真实核验。
        </Notice>
      ) : null}
      {error ? <Notice>{error}</Notice> : null}
      {projects === null ? (
        <StateView title="读取测试条件" onRetry={refresh} />
      ) : projects.length === 0 ? (
        <StateView
          title="尚未加入项目"
          sub="请管理员将本人加入项目后，测试项目范围和打卡设备。"
        />
      ) : (
        <>
          <Picker
            mode="selector"
            disabled={busy}
            range={projects.map((row) => row.projectName)}
            value={projects.findIndex((row) => row.projectId === projectId)}
            onChange={(event) => {
              if (lock.current) return;
              setProjectId(projects[Number(event.detail.value)]!.projectId);
              setLocation(null);
              setPhotoPath(null);
              setUpload(null);
              setFaceResult(null);
              setFinished(false);
              setError(null);
            }}
          >
            <ListItem
              primary="测试项目"
              secondary={
                projects.find((row) => row.projectId === projectId)?.projectName
              }
              chip="切换"
            />
          </Picker>
          <Section
            title="1 · GPS 定位"
            sub={
              location === null
                ? "等待定位"
                : inside
                  ? "定位通过 · 在范围内"
                  : "定位未通过"
            }
          >
            {location ? (
              <>
                <Subtitle>
                  距中心 {Math.round(location.distanceM)} 米 · 允许{" "}
                  {location.geofence.radiusM} 米
                </Subtitle>
                <Subtitle>
                  纬度 {location.position.latitude} · 经度{" "}
                  {location.position.longitude}
                </Subtitle>
                <Subtitle>
                  定位精度{" "}
                  {location.position.accuracyM === null
                    ? "未知"
                    : `${location.position.accuracyM} 米`}
                </Subtitle>
              </>
            ) : (
              <Subtitle>使用所选项目的真实圆形围栏，范围内才能继续。</Subtitle>
            )}
            <Button
              disabled={busy || !phoneAvailable}
              loading={phase === "LOCATING"}
              onClick={() => {
                void locate();
              }}
            >
              {location === null ? "开始定位测试" : "重新定位并开始"}
            </Button>
          </Section>
          <Section
            title="2 · 现场拍照"
            sub={upload ? "拍摄及上传通过" : "等待拍照上传"}
          >
            {photoPath ? (
              <Image
                src={photoPath}
                mode="aspectFit"
                style={{ width: "100%", height: "180px", borderRadius: "12px" }}
              />
            ) : null}
            <Subtitle>
              {upload
                ? `已上传 ${Math.round(upload.sizeBytes / 1024)} KB`
                : "现场拍照后上传测试服务器，范围外不能继续。"}
            </Subtitle>
            <Button
              variant="outline"
              disabled={busy || !inside || !phoneAvailable}
              loading={phase === "PHOTO"}
              onClick={() => {
                void takePhoto();
              }}
            >
              {photoPath ? "重新拍照并上传" : "拍照并上传"}
            </Button>
          </Section>
          <Section
            title="3 · 活体人脸识别"
            sub={
              faceResult
                ? faceResult.status === "VERIFIED"
                  ? "活体与本人比对通过"
                  : "核验未通过"
                : "等待人脸核验"
            }
          >
            <Subtitle>
              按提示录制动作视频，发送腾讯云，与本人登记底照比对。
            </Subtitle>
            {!faceReady ? (
              <ListItem
                primary="先准备本人底照"
                secondary={
                  face?.profile
                    ? faceStatusLabel(face.profile.status)
                    : "尚未录入底照"
                }
                chip="人脸档案"
                onClick={() => {
                  void Taro.navigateTo({ url: "/pages/face-profile/index" });
                }}
              />
            ) : null}
            {face?.mode !== "VIDEO_ACTION" && face !== null ? (
              <Notice>当前未启用视频动作活体，请管理员检查云端配置。</Notice>
            ) : null}
            {face?.profile?.status === "PENDING" ? (
              <Subtitle>
                待审核底照可用于本次测试；正式打卡仍须管理员审核通过。
              </Subtitle>
            ) : null}
            {faceResult?.score !== null && faceResult?.score !== undefined ? (
              <Subtitle>人脸相似度：{faceResult.score.toFixed(2)}</Subtitle>
            ) : null}
            {faceResult?.failureCode ? (
              <Subtitle>失败原因：{faceResult.failureCode}</Subtitle>
            ) : null}
            {faceResult?.requestId ? (
              <Subtitle>核验编号：{faceResult.requestId}</Subtitle>
            ) : null}
            <Button
              disabled={
                busy ||
                !inside ||
                upload === null ||
                !faceReady ||
                !phoneAvailable
              }
              loading={phase === "PREPARING"}
              onClick={() => {
                void startFace();
              }}
            >
              开始活体人脸测试
            </Button>
          </Section>
          {finished ? (
            <Notice>
              测试通过：定位、现场照片上传、活体与本人比对均成功。未生成考勤记录。
            </Notice>
          ) : null}
        </>
      )}
      {phase === "VERIFYING" ? (
        <VideoFaceCapture
          flow={flow}
          referenceDescription="本次仅测试，不生成考勤记录。请保持在项目范围内。"
          onCancel={() => {
            lock.current = false;
            setPhase("IDLE");
          }}
          onResult={(result) => {
            void finishFace(result);
          }}
        />
      ) : null}
    </Screen>
  );
}
