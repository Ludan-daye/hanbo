import { Picker, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  BottomBar,
  Button,
  KV,
  Links,
  Notice,
  PageHeader,
  Photo,
  Row,
  Screen,
  Sheet,
  SignLine,
  StateView,
  Status,
  Timeline,
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
import { errorMessage } from "../../services/error-messages";
import {
  createLivenessTest,
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
import {
  punchTestNext,
  punchTestPrimary,
  punchTestRows,
  type TestPhase,
} from "./test-view";

import "./index.scss";

type LocationResult = GeofenceCheck & {
  readonly position: AttendanceLocation;
  readonly geofence: AttendanceTodayGeofence;
  readonly accuracyPassed: boolean;
};
const errorText = (reason: unknown): string =>
  errorMessage(reason, "测试未完成，请重试。");
const FACE_PROFILE_URL = "/pages/face-profile/index";

/**
 * 打卡流程测试，只在测试版里出现：定位、现场照片、活体核验各试一遍，不计考勤。
 * 三步的结果竖着排，底部的按钮永远是下一步该做的那件事。
 */
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
  const [phase, setPhase] = useState<TestPhase>("IDLE");
  const [error, setError] = useState<string | null>(null);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState<boolean>(false);
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

  const next = punchTestNext({
    finished,
    inside,
    uploaded: upload !== null,
    faceReady,
  });
  const openFaceProfile = (): void => {
    void Taro.navigateTo({ url: FACE_PROFILE_URL });
  };
  const leave = (): void => {
    if (Taro.getCurrentPages().length > 1) void Taro.navigateBack();
    else void Taro.reLaunch({ url: "/pages/profile/index" });
  };
  const runCurrentStep = (): void => {
    if (busy || !phoneAvailable) return;
    if (next === "done") leave();
    else if (next === "locate") void locate();
    else if (next === "photo") void takePhoto();
    else if (next === "profile") openFaceProfile();
    else void startFace();
  };
  const header = <PageHeader title="打卡测试" />;
  const sign = finished ? (
    <SignLine title="三步都通过了" sub="这次测试不计考勤。" />
  ) : (
    <SignLine title="测试不计考勤" sub="试一遍定位、拍照和人脸核验" />
  );
  const environment = phoneAvailable ? null : (
    <Notice>
      {FRONTEND_DEMO
        ? "现在是本机演示。真实核验要在微信小程序里用手机预览。"
        : "摄像头和定位要在微信小程序里用手机预览才能测。"}
    </Notice>
  );

  if (projects === null)
    return (
      <Screen header={header}>
        {sign}
        {environment}
        {error ? (
          <StateView
            kind="error"
            title="测试条件没读到"
            sub={error}
            onRetry={refresh}
          />
        ) : (
          <StateView title="正在读取测试条件…" />
        )}
      </Screen>
    );
  if (projects.length === 0)
    return (
      <Screen header={header}>
        {sign}
        {environment}
        <StateView
          kind="empty"
          title="还没有加入项目"
          sub="请管理员把你加进项目，再来测范围和打卡设备。"
        />
      </Screen>
    );

  const selectedProject = projects.find((row) => row.projectId === projectId);
  const rows = punchTestRows({
    phase,
    next,
    location:
      location === null
        ? null
        : {
            isInside: location.isInside,
            accuracyPassed: location.accuracyPassed,
            distanceM: location.distanceM,
            radiusM: location.geofence.radiusM,
            accuracyLimitM: location.geofence.locationAccuracyLimitM,
          },
    uploadedBytes: upload?.sizeBytes ?? null,
    faceResult:
      faceResult === null
        ? null
        : faceResult.status === "VERIFIED"
          ? "VERIFIED"
          : "FAILED",
    videoEnabled: face?.mode === "VIDEO_ACTION",
    profileStatus: face?.profile?.status ?? null,
  });
  // 重做前面的某一步。和底部按钮是同一件事时不重复放。
  const canRelocate = location !== null && next !== "locate" && next !== "done";
  const canRetake =
    photoPath !== null && (next === "face" || next === "profile");
  const showProfileLink = !faceReady && next !== "profile";
  return (
    <Screen header={header}>
      {sign}
      {environment}
      <Picker
        mode="selector"
        disabled={busy}
        range={projects.map((row) => row.projectName)}
        value={Math.max(
          0,
          projects.findIndex((row) => row.projectId === projectId),
        )}
        onChange={(event) => {
          if (lock.current) return;
          const selected = projects[Number(event.detail.value)];
          if (!selected) return;
          setProjectId(selected.projectId);
          setLocation(null);
          setPhotoPath(null);
          setUpload(null);
          setFaceResult(null);
          setFinished(false);
          setError(null);
          setDiagnosticsOpen(false);
        }}
      >
        <Sheet gap>
          <Row title="测试项目" chevron>
            <View className="punch-test__project">
              {selectedProject?.projectName ?? "请选择项目"}
            </View>
          </Row>
        </Sheet>
      </Picker>
      <Sheet gap>
        <Timeline
          items={rows.map((row) => ({
            key: row.key,
            state: row.state,
            title: row.title,
            sub: row.sub,
            right: <Status kind={row.status.kind}>{row.status.text}</Status>,
          }))}
        />
      </Sheet>
      {photoPath !== null ? <Photo src={photoPath} /> : null}
      {location !== null || faceResult !== null ? (
        <Sheet gap>
          <Row
            title="定位和核验详情"
            value={diagnosticsOpen ? "收起" : "展开"}
            mute
            onClick={() => setDiagnosticsOpen(!diagnosticsOpen)}
          />
          {diagnosticsOpen ? (
            <View className="punch-test__details m-fade">
              {location !== null ? (
                <>
                  <KV label="纬度" value={location.position.latitude} />
                  <KV label="经度" value={location.position.longitude} />
                  <KV
                    label="定位精度"
                    value={
                      location.position.accuracyM === null
                        ? "不知道"
                        : `${location.position.accuracyM} 米`
                    }
                  />
                </>
              ) : null}
              {faceResult?.score !== null && faceResult?.score !== undefined ? (
                <KV label="人脸相似度" value={faceResult.score.toFixed(2)} />
              ) : null}
              {/* 返回码和编号是给排查问题的人看的，原样显示。 */}
              {faceResult?.failureCode ? (
                <KV label="云端返回码" value={faceResult.failureCode} />
              ) : null}
              {faceResult?.requestId ? (
                <KV label="核验编号" value={faceResult.requestId} />
              ) : null}
            </View>
          ) : null}
        </Sheet>
      ) : null}
      {canRelocate || canRetake || showProfileLink ? (
        <Links>
          {canRelocate ? (
            <Button
              variant="text"
              disabled={busy || !phoneAvailable}
              onClick={() => {
                void locate();
              }}
            >
              重新定位
            </Button>
          ) : null}
          {canRetake ? (
            <Button
              variant="text"
              disabled={busy || !inside || !phoneAvailable}
              onClick={() => {
                void takePhoto();
              }}
            >
              重拍照片
            </Button>
          ) : null}
          {showProfileLink ? (
            <Button variant="text" disabled={busy} onClick={openFaceProfile}>
              人脸档案
            </Button>
          ) : null}
        </Links>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      <BottomBar
        primary={punchTestPrimary({
          phase,
          next,
          located: location !== null,
          faceTried: faceResult !== null,
        })}
        busy={busy}
        disabled={!phoneAvailable}
        onPrimary={runCurrentStep}
      >
        {finished && !busy ? (
          <Button
            variant="outline"
            onClick={() => {
              void locate();
            }}
          >
            再测一遍
          </Button>
        ) : null}
      </BottomBar>
      {phase === "VERIFYING" ? (
        <VideoFaceCapture
          flow={flow}
          referenceDescription="只是测试，不计考勤。请留在项目范围内。"
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
